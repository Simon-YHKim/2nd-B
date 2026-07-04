// C1/C2/C3/C9: single LLM entry point.
//
//   C1: Only this file imports @google/genai (enforced by ESLint + boundary script).
//   C2: When EXPO_PUBLIC_USE_VERTEX=true, the @google/genai client is constructed
//       with vertexai:true, satisfying the XPRIZE "Google Cloud product" mandate.
//   C3: After every call, ai_audit_log receives a queued write via audit-write outbox.
//   C9: classifyInput() runs BEFORE the network call. Red zone short-circuits.
//
// Tests in __tests__/gemini.test.ts assert the ordering.

import { GoogleGenAI } from "@google/genai";

import { throwIfAborted } from "../async/abort";
import { getEnv } from "../env";
import { phase2EffortFor, proxyFnForVendor, resolveVendorForPurpose } from "./routing";
import { retrieveEvidence } from "../knowledge/retrieve";
import { loadDomainLevels } from "../persona/load-domain-levels";
import { classifyInput, crisisHotlines, type SafetyResult } from "../safety/classifier";
import { getSupabaseClient } from "../supabase/client";
import type { CrisisEventInsert } from "../supabase/crisis-events";
import { enqueueAuditWrite } from "./audit-write-outbox";
import { classifySafety, fixedCrisisResponse } from "./safety";
import {
  MODELS,
  PURPOSE_TIER,
  type AdvisorInput,
  type AuditMeta,
  type AdvisorResult,
  type GeminiModel,
  type GeminiResult,
  type PromptInput,
  type PromptPurpose,
  type ReasoningEffort,
} from "./types";

// Web Crypto SubtleCrypto fallback to a simple non-cryptographic hash when
// running outside a browser/RN runtime (e.g. node tests). Audit hashes are
// for traceability, not for security — collisions are acceptable here.
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

// Default effort for the reasoning (pro) tier when a caller omits it.
const DEFAULT_EFFORT: ReasoningEffort = "high";

// Resolve the tier for a callGemini request. An explicit `input.model` always
// wins (preserves every existing caller). Otherwise pick by purpose via
// PURPOSE_TIER, falling back to "flash" — callGemini's historical default — for
// any purpose not in the map. callAdvisor does NOT go through here (it uses pro
// directly), so the advisor default is unaffected.
function resolveTier(input: { model?: GeminiModel; purpose: PromptPurpose }): GeminiModel {
  if (input.model) return input.model;
  return PURPOSE_TIER[input.purpose] ?? "flash";
}

// Map a reasoning effort level to a @google/genai generation config.
//
// @google/genai 2.5 exposes thinking control via config.thinkingConfig
// (thinkingBudget = max thinking tokens; -1 = dynamic/unbounded). We use it as
// the primary lever AND set a matching maxOutputTokens cap so the lever still
// has teeth on any SDK/runtime build where thinkingConfig is ignored (e.g. an
// older edge runtime). Both are advisory generation params — never safety
// controls (C9 stays the gate). Budgets are deliberately generous; the point is
// proportionality across tiers, not a hard truncation.
//   low   -> small thinking budget, tight output cap   (Free / quick replies)
//   high  -> default; balanced budget                  (standard reasoning)
//   xhigh -> large budget                              (deep reflection)
//   max   -> dynamic/unbounded thinking, large output  (hardest problems)
function effortToConfig(effort: ReasoningEffort): {
  thinkingConfig: { thinkingBudget: number };
  maxOutputTokens: number;
} {
  switch (effort) {
    case "low":
      return { thinkingConfig: { thinkingBudget: 512 }, maxOutputTokens: 1024 };
    case "medium":
      // D-26 added the medium rung (used by Phase 2 vendor seats; mapped here
      // for the direct-Gemini path too so the ladder stays total).
      return { thinkingConfig: { thinkingBudget: 1024 }, maxOutputTokens: 1536 };
    case "xhigh":
      return { thinkingConfig: { thinkingBudget: 8192 }, maxOutputTokens: 4096 };
    case "max":
      // -1 = let the model decide its own thinking budget (dynamic / unbounded).
      return { thinkingConfig: { thinkingBudget: -1 }, maxOutputTokens: 8192 };
    case "high":
    default:
      return { thinkingConfig: { thinkingBudget: 2048 }, maxOutputTokens: 2048 };
  }
}

// Purposes whose direct-path calls suppress model thinking entirely.
// Verbatim transcription gains nothing from thinking tokens: gemini-2.5-flash
// runs dynamic thinking by default, which only adds latency + spend on OCR
// (routing decision, docs/LLM-ROUTING.md A12). Direct/Vertex client path only —
// the edge proxy pins its own generationConfig server-side.
const THINKING_OFF_PURPOSES: ReadonlySet<PromptPurpose> = new Set(["capture_ocr"]);

// Reasoning provider seam (C1-SAFE). EXPO_PUBLIC_REASONING_PROVIDER selects the
// backend for the reasoning (pro) path. Default "gemini"; "claude" routes the
// pro-tier call through the claude-proxy Edge Function (see
// docs/CLAUDE-REASONING-SETUP.md, Option A). We NEVER import an Anthropic SDK
// here — the Claude call happens server-side in the edge function, so C1 holds.
// The chosen provider is recorded in the audit meta.
function resolveReasoningProvider(): "gemini" | "claude" {
  const raw = (process.env.EXPO_PUBLIC_REASONING_PROVIDER ?? "gemini").trim().toLowerCase();
  return raw === "claude" ? "claude" : "gemini";
}

// Each vendor routes to its own Supabase Edge Function; all keep the client
// SDK-free (C1). Claude/OpenAI have no client-side path (no key on the
// device), so a non-Gemini call ALWAYS goes through its edge function even
// when EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION is off for the direct Gemini path.
function reasoningProxyFn(
  reasoningProvider: "gemini" | "claude" | "openai" | undefined,
): "gemini-proxy" | "claude-proxy" | "openai-proxy" {
  return proxyFnForVendor(reasoningProvider);
}

let cachedClient: GoogleGenAI | null = null;
let cachedClientVertex = false;

function getClient(): { client: GoogleGenAI; vertex: boolean } {
  const env = getEnv();
  if (cachedClient && cachedClientVertex === env.EXPO_PUBLIC_USE_VERTEX) {
    return { client: cachedClient, vertex: cachedClientVertex };
  }
  if (env.EXPO_PUBLIC_USE_VERTEX) {
    cachedClient = new GoogleGenAI({
      vertexai: true,
      project: env.GOOGLE_CLOUD_PROJECT!,
      location: env.GOOGLE_CLOUD_LOCATION,
    });
    cachedClientVertex = true;
  } else {
    cachedClient = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY ?? "" });
    cachedClientVertex = false;
  }
  return { client: cachedClient, vertex: cachedClientVertex };
}

// C-cost (round-4 H4): the gemini-proxy is the ONLY spend-capped LLM egress
// (bump_gemini_spend, 0035/0036, per-user/day). Reaching the direct @google/genai
// client on a LIVE call bypasses that ceiling. The API-key direct path bills the
// Gemini free tier the $0/mo promise (blueprint §5) protects, so a live call MUST
// route through the edge proxy. Vertex (USE_VERTEX) is the only permitted direct
// egress: it bills GCP (governed by the project budget/quota in the GCP console,
// a separate domain from the Gemini-API free-tier counter) and is the C2
// submission-evidence path. Mock mode never reaches the direct branch (returns
// earlier). Called at the top of both direct branches so neither can ship an
// uncapped live API-key path.
function assertDirectEgressAllowed(env: ReturnType<typeof getEnv>): void {
  if (env.EXPO_PUBLIC_LLM_MODE === "live" && !env.EXPO_PUBLIC_USE_VERTEX) {
    throw new Error(
      "LLM boundary (C-cost): a live call reached the uncapped direct API-key client. " +
        "Route through the gemini-proxy edge function (EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION=true), " +
        "which enforces the per-user/day spend cap, or use Vertex (EXPO_PUBLIC_USE_VERTEX=true).",
    );
  }
}

async function writeAiAuditLog(userId: string, audit: AuditMeta, warnLabel: string): Promise<void> {
  await enqueueAuditWrite({
    kind: "ai_audit_log",
    ownerUserId: userId,
    payload: { userId, ...audit },
    warnLabel,
  });
}

async function writeCrisisEvent(
  userId: string,
  payload: CrisisEventInsert,
  warnLabel: string,
): Promise<void> {
  await enqueueAuditWrite({
    kind: "crisis_event",
    ownerUserId: userId,
    payload,
    warnLabel,
  });
}

// Offline-preview responses keyed by purpose + locale. Used when LLM_MODE=mock
// so the UI can be exercised end-to-end without a live model connection. Safety
// classifier still runs (C9 invariant) and audit log still records the call (C3).
// NOTE: these strings are user-facing in the offline-preview build, so they read
// as ordinary product copy. The internal "mock"/no-key technical marker lives in
// this comment and in modelUsed audit fields only.
const MOCK_RESPONSES: Record<
  "journal_reflect" | "audit_qa" | "knowledge_lookup" | "persona_narrative" | "gap_synthesize" | "secondb_chat" | "interview_probe" | "imagine" | "import_ingest" | "ops_recommend",
  Record<"en" | "ko", string>
> = {
  journal_reflect: {
    en: "What feeling came up most strongly in that moment? Try naming it in a single word.",
    ko: "그 순간 가장 또렷이 떠오른 감정이 무엇이었나요? 한 단어로 이름 붙여볼까요?",
  },
  audit_qa: {
    en: "Looking back, who did you lean on most during that period, and what did they offer you?",
    ko: "그 시기를 돌아보면, 가장 의지했던 사람은 누구였고, 그 사람은 당신에게 무엇을 주었나요?",
  },
  knowledge_lookup: {
    en: "This is an offline preview. Curated references will appear here when you go online.",
    ko: "지금은 오프라인 미리보기예요. 온라인으로 연결하면 검증된 자료가 여기에 표시됩니다.",
  },
  persona_narrative: {
    en: "I'm noticing a pattern across your recent entries. Tell me more about how you decided.",
    ko: "최근 기록에서 반복되는 흐름이 보여요. 그 결정을 어떻게 내렸는지 더 들려주세요.",
  },
  // Seen-lens self-vs-others gap note (D-26 split of the old persona_chat key)
  // so the offline-preview build keeps a purpose-flavored line on that surface.
  gap_synthesize: {
    en: "The two pictures mostly agree, with one gentle gap: others seem to read you as a bit more outgoing than you describe yourself. It might be worth asking one of them what they see.",
    ko: "두 그림은 대체로 겹치는데, 한 가지 부드러운 간극이 보여요. 다른 사람들은 스스로 묘사하신 것보다 조금 더 활발한 모습으로 보고 있는 것 같아요. 가까운 한 분께 어떻게 보이는지 물어봐도 좋겠어요.",
  },
  secondb_chat: {
    en: "This is an offline preview. When you go online I'll consult your captured pages and answer with citations. For now I'm following the same prompt structure.",
    ko: "지금은 오프라인 미리보기예요. 온라인으로 연결하면 캡처한 페이지를 참고해 인용과 함께 답해 드려요. 지금은 같은 흐름으로 안내해요.",
  },
  interview_probe: {
    en: "What part of what you just said feels most alive to you right now?",
    ko: "방금 말한 것 중에서 지금 가장 살아 있는 느낌이 드는 부분은 무엇인가요?",
  },
  // Structured "공상" sample in the :: delimited format parseImagineResult
  // expects, so the result cards render in the offline-preview build (the
  // default deployed build).
  imagine: {
    en:
      "TITLE :: A lantern in the night alley\n" +
      "WORLDLINE :: A story where one small piece lights the village's first lamp.\n" +
      "SCENE :: The first lamp :: A single lantern flickers on in a dark alley.\n" +
      "SCENE :: The path appears :: The lit lanterns trace a road forward.\n" +
      "SCENE :: Friends gather :: Small pixel friends drift onto the path.\n" +
      "OBJECT :: Lantern :: The little light your piece switched on.\n" +
      "OBJECT :: Path :: A signal line linking piece to piece.\n" +
      "OBJECT :: Note :: A place to jot what comes next.\n" +
      "CHARACTER :: SecondB Divergent :: The guide who unfolds a thought from a new angle.\n" +
      "CHARACTER :: Lumen :: The guide who brings back useful pieces.\n" +
      "NEXTSTEP :: Write down one line of the scene you saw today.",
    ko:
      "TITLE :: 밤빛 골목의 등불\n" +
      "WORLDLINE :: 작은 기록 하나가 마을의 첫 등불을 켜는 이야기예요.\n" +
      "SCENE :: 첫 등불 :: 어두운 골목에 등불이 하나 켜져요.\n" +
      "SCENE :: 이어지는 길 :: 켜진 등불을 따라 길이 이어져요.\n" +
      "SCENE :: 모이는 친구들 :: 작은 친구들이 길 위로 모여요.\n" +
      "OBJECT :: 등불 :: 오늘의 조각이 켠 작은 빛.\n" +
      "OBJECT :: 길 :: 조각과 조각을 잇는 신호선.\n" +
      "OBJECT :: 노트 :: 다음을 적어두는 자리.\n" +
      "CHARACTER :: SecondB Divergent :: 생각을 낯선 각도에서 장면으로 펼쳐주는 길잡이.\n" +
      "CHARACTER :: Lumen :: 쓸모 있는 새 조각을 가져오는 길잡이.\n" +
      "NEXTSTEP :: 오늘 떠오른 장면 한 줄을 기록으로 남겨보기.",
  },
  // Structured JSON sample for the external-import ingest so /import works in
  // the default offline-preview build (parseIngestResult reads this shape).
  ops_recommend: {
    en: JSON.stringify([
      {
        title: "10-minute evening reset",
        reason: "Offline preview: a small, repeatable step that fits any day.",
        durationMinutes: 10,
        recurrence: "daily",
        checklist: ["Clear one surface", "Lay out tomorrow's first task"],
      },
      {
        title: "Pick this week's one focus",
        reason: "Offline preview: your notes work best with a single anchor.",
        durationMinutes: 15,
        recurrence: "weekly",
      },
    ]),
    ko: JSON.stringify([
      {
        title: "저녁 10분 리셋",
        reason: "오프라인 미리보기: 어떤 하루에도 들어가는 작은 반복이에요.",
        durationMinutes: 10,
        recurrence: "daily",
        checklist: ["한 군데만 정리하기", "내일 첫 할 일 꺼내두기"],
      },
      {
        title: "이번 주 집중 한 가지 고르기",
        reason: "오프라인 미리보기: 기록은 하나의 닻이 있을 때 가장 잘 움직여요.",
        durationMinutes: 15,
        recurrence: "weekly",
      },
    ]),
  },
  import_ingest: {
    en: JSON.stringify({
      summary: "A reflective, curious person who values growth and close relationships.",
      track: "daily",
      tags: ["imported", "growth", "reflection"],
      items: [
        { section: "trait", title: "Openness", detail: "Drawn to new ideas and perspectives.", confidence: "medium" },
        { section: "value", title: "Growth", detail: "Frames experiences as chances to learn.", confidence: "medium" },
        { section: "relationship", title: "Close ties", detail: "Leans on a small circle of trusted people.", confidence: "low" },
      ],
    }),
    ko: JSON.stringify({
      summary: "성장과 가까운 관계를 중요하게 여기는, 호기심 많고 성찰적인 사람.",
      track: "daily",
      tags: ["imported", "성장", "성찰"],
      items: [
        { section: "trait", title: "개방성", detail: "새로운 생각과 관점에 끌려요.", confidence: "medium" },
        { section: "value", title: "성장", detail: "경험을 배움의 기회로 받아들여요.", confidence: "medium" },
        { section: "relationship", title: "가까운 관계", detail: "신뢰하는 소수에게 의지해요.", confidence: "low" },
      ],
    }),
  },
};

type ProxyCrisisDecision = {
  route: boolean;
  confirmedMarker: boolean;
};

// C9 fallback (2026-06-10 audit follow-up): gemini-proxy is the second,
// server-authoritative crisis gate. When a crisis phrasing slips past the
// client lexicon but the proxy's hasCrisisTerm catches it, functions.invoke
// rejects with a FunctionsHttpError (status 422). Treat unreadable 422 bodies
// as a UX fail-safe (show the fixed hotline template) but only write the
// restricted crisis_events row when the proxy marker is explicit.
async function inspectProxyCrisisRejection(error: unknown): Promise<ProxyCrisisDecision> {
  const noRoute = { route: false, confirmedMarker: false };
  if (!error || typeof error !== "object") return noRoute;
  const ctx = (error as { context?: { status?: number; clone?: unknown; json?: unknown } })
    .context;
  if (!ctx || typeof ctx !== "object" || ctx.status !== 422) return noRoute;
  try {
    const target =
      typeof ctx.clone === "function"
        ? ((ctx.clone as () => { json?: () => Promise<unknown> })())
        : (ctx as { json?: () => Promise<unknown> });
    if (typeof target.json !== "function") return { route: true, confirmedMarker: false };
    const body = (await target.json()) as { error?: unknown } | null;
    if (body?.error === "safety_red_zone") return { route: true, confirmedMarker: true };
    return noRoute;
  } catch {
    return { route: true, confirmedMarker: false };
  }
}

// RED SafetyResult for a proxy-detected crisis. The client classifier
// returned green/yellow, so there is no matched-term list — the proxy body
// intentionally never echoes the matched term (no oracle).
function proxyCrisisSafetyResult(locale: "en" | "ko", minor = false): SafetyResult {
  const h = crisisHotlines(locale, minor)[0];
  return {
    zone: "red",
    matched: [],
    categories: ["crisis"],
    crisisRouting: { hotline: h.id, label: h.label, number: h.number },
  };
}

// C9 fallback for record saves that do NOT pass through callAdvisor/callGemini
// at all (free-tier journal, advisor toggle off, plain notes — persona sim
// P1-1): classify locally (zero LLM cost) and, on red, run the SAME audited
// crisis routing as every LLM surface (ai_audit_log + crisis_events + the
// fixed hotline text). Returns null when the text is not red.
export async function classifyRecordTextForCrisis(
  text: string,
  locale: "en" | "ko",
  userId: string,
  minor = false,
): Promise<GeminiResult<string> | null> {
  const safety = classifyInput(text, locale, { minor });
  if (safety.zone !== "red") return null;
  return routeCrisis(safety, locale, userId, djb2(text), minor, "record_save_red");
}

async function routeCrisis(
  result: SafetyResult,
  locale: "en" | "ko",
  userId: string,
  promptHash: string,
  minor = false,
  sourceTag = "input_red",
  opts: { recordCrisisEvent?: boolean } = {},
): Promise<GeminiResult<string>> {
  // Same hotline set as the Advisor path (single source of truth):
  // KO adult -> 109, KO minor -> 1388 + 109, EN -> 988.
  const numbers = crisisHotlines(locale, minor).map((hl) => hl.number);
  const joined = locale === "ko" ? numbers.join(" 또는 ") : numbers.join(" or ");
  const text =
    locale === "ko"
      ? `지금 많이 힘드신 것 같아요. 혼자 견디지 마시고 ${joined}로 연락해 주세요. 전문가가 24시간 함께합니다.`
      : `It sounds like you're going through a lot right now. Please reach out to ${joined} — trained responders are available 24/7.`;
  const audit = {
    promptHash,
    outputHash: djb2(text),
    modelUsed: "none-crisis-routed",
    vertexBackend: false,
    safetyZone: "red" as const,
    latencyMs: 0,
  };
  // C3: crisis routing MUST be audited. The whole point of audit_log is the
  // judges' ability to prove the safety classifier intercepted dangerous input.
  await writeAiAuditLog(userId, audit, "[ai_audit_log] crisis insert failed");
  // Separate restricted ledger (crisis_events), parity with callAdvisor's input-RED
  // path. Without this every callGemini surface (chat/journal/interview/persona/
  // import/clipper/phase1) intercepted a crisis but left NO categorical trace in the
  // restricted log. routeCrisis only has the lexicon classifier's fields, so map
  // them conservatively (RED confidence 0.95 like lexiconToResult; no C-SSRS level;
  // categories else "lexicon_match", tagged with sourceTag — input_red for the
  // client short-circuit, proxy_input_red for a confirmed server-gate 422
  // fallback, proxy_input_red_unconfirmed for an unreadable 422 UX fail-safe —
  // to distinguish from the output_swap path). Unconfirmed proxy fallbacks skip
  // crisis_events to avoid over-recording in the restricted ledger.
  const lexCategories =
    result.categories.length > 0
      ? result.categories
      : result.matched.length > 0
        ? ["lexicon_match"]
        : [];
  if (opts.recordCrisisEvent !== false) {
    await writeCrisisEvent(
      userId,
      {
        classifierConfidence: 0.95,
        triggerCategories: [...lexCategories, sourceTag],
        cssrsLevel: null,
        routingTemplateVersion: "routecrisis-inline-v1",
        locale,
      },
      "[crisis_events] crisis insert failed",
    );
  }
  return { text, safety: result, audit };
}

export async function callGemini<T = string>(input: PromptInput): Promise<GeminiResult<T>> {
  throwIfAborted(input.signal);
  // C9: pre-call classification of user input. Red zone never reaches the LLM.
  const inputSafety = classifyInput(input.user, input.locale, { minor: input.minor });
  const promptHash = djb2(`${input.system ?? ""}${input.user}`);
  if (inputSafety.zone === "red") {
    return (await routeCrisis(
      inputSafety,
      input.locale,
      input.userId,
      promptHash,
      input.minor,
    )) as unknown as GeminiResult<T>;
  }

  const env = getEnv();
  // Tier routing: explicit input.model wins; otherwise pick by purpose. Existing
  // callers preserved (historical default was flash; unmapped purposes -> flash).
  const tier = resolveTier(input);
  const model = MODELS[tier];
  // D-26 Phase 2: purpose-keyed vendor seat (EXPO_PUBLIC_LLM_PHASE=2). The
  // proxy owns the actual model id; image-bearing calls and the OCR/voice
  // pins always stay Gemini. Phase 1 (default) resolves "gemini" everywhere.
  const vendorSeat = resolveVendorForPurpose(input.purpose, input.image != null);
  // effort applies on the reasoning (pro) tier, and on non-Gemini vendor seats
  // (the proxy maps it to the vendor's native reasoning ladder). On Gemini
  // lite/flash it stays undefined so the audit row doesn't imply a reasoning
  // budget that wasn't used.
  const effort: ReasoningEffort | undefined =
    tier === "pro"
      ? input.effort ?? DEFAULT_EFFORT
      : vendorSeat !== "gemini"
        ? input.effort ?? phase2EffortFor(input.purpose) ?? DEFAULT_EFFORT
        : undefined;
  // Vendor for the call: a Phase 2 seat wins; otherwise the legacy pro-tier
  // reasoning-provider seam (EXPO_PUBLIC_REASONING_PROVIDER) applies.
  const reasoningProvider =
    vendorSeat !== "gemini"
      ? vendorSeat
      : tier === "pro"
        ? resolveReasoningProvider()
        : undefined;
  // Which backend actually served the answer — reassigned when the D-26
  // outage failover drops a vendor seat back to the Gemini Phase 1 route.
  // Audit rows record THIS, not the intended seat (C3 honesty).
  let servedByProvider = reasoningProvider;

  // Offline-preview mode: skip network. Useful for offline dev, CI, and demos
  // without a live model connection. C3 audit log + C9 safety classifier still
  // apply. The internal "mock" marker stays in the modelUsed audit field only;
  // user-facing text below reads as ordinary product copy.
  if (env.EXPO_PUBLIC_LLM_MODE === "mock") {
    const t0 = Date.now();
    // 'advisor' purpose flows through callAdvisor(), not callGemini(). For
    // any unknown purpose, fall back to a generic offline-preview reply.
    const mockTable = MOCK_RESPONSES as Record<string, Record<"en" | "ko", string>>;
    const text =
      mockTable[input.purpose]?.[input.locale] ??
      (input.locale === "ko" ? "지금은 오프라인 미리보기예요." : "This is an offline preview.");
    const latencyMs = Date.now() - t0;
    const outputSafety = classifyInput(text, input.locale, { minor: input.minor });
    const audit = {
      promptHash: djb2(`${input.system ?? ""}${input.user}`),
      outputHash: djb2(text),
      modelUsed: `mock:${model}`,
      vertexBackend: env.EXPO_PUBLIC_USE_VERTEX,
      safetyZone: outputSafety.zone,
      latencyMs,
      // Mock never egresses, so vendor-seat effort/provider would be a lie in
      // the row (mock:gemini-* + "claude"). Record them only for the pro tier
      // (pre-D-26 semantics, where they describe the local thinking config).
      ...(tier === "pro" && effort ? { effort } : {}),
      ...(tier === "pro" && reasoningProvider ? { reasoningProvider } : {}),
    };
    await writeAiAuditLog(input.userId, audit, "[ai_audit_log] insert failed (mock)");
    return { text: text as unknown as T, safety: outputSafety, audit };
  }

  // Live mode: route through gemini-proxy Edge Function when configured
  // (key stays server-side) or construct the @google/genai client directly.
  let text: string;
  let latencyMs: number;
  let modelUsedForAudit: string;
  let vertexBackend: boolean;
  // When the proxy writes the audit row itself (C3 server-authoritative), it
  // returns audited:true and we skip the client insert to avoid double-logging.
  let proxyAudited = false;

  // Route through an edge function when configured, OR whenever the vendor is
  // non-Gemini (Claude/OpenAI have no client-side path — the keys live only in
  // their proxies). reasoningProxyFn picks the matching function.
  if (
    env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION ||
    (reasoningProvider != null && reasoningProvider !== "gemini")
  ) {
    const supabase = getSupabaseClient();
    const proxyBody = {
      system: input.system ?? null,
      user: input.user,
      model,
      // Purpose label: lets the proxy apply purpose-aware policy (premium
      // entitlement gate + D-26 server-owned model seats + effort ceilings)
      // and gives server logs call attribution. Labels are self-reported, so
      // the proxy's tier-aware cap + effort clamp are the hard ceilings.
      purpose: input.purpose,
      // Optional image payload for multimodal OCR / vision prompts.
      ...(input.image ? { image: input.image } : {}),
      // Structured-output schema (e.g. phase1). The proxy sets
      // responseMimeType=application/json + responseSchema when present so
      // edge-routed callers reach parity with the direct-client path.
      ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
      // Reasoning effort (pro tier / vendor seats). Each proxy maps it to its
      // vendor's native ladder server-side and clamps per purpose.
      ...(effort ? { effort } : {}),
    };
    const primaryFn = reasoningProxyFn(reasoningProvider);
    const t0 = Date.now();
    let { data, error } = await supabase.functions.invoke(primaryFn, {
      body: proxyBody,
      signal: input.signal,
    });
    // D-26 outage failover: a vendor seat that fails for any NON-CRISIS reason
    // falls back ONCE to its Phase 1 assignment (gemini-proxy) — "each vendor
    // row's outage fallback is that row's Phase 1 assignment". A crisis 422 is
    // handled below and never retried (all proxies share the same gate, so a
    // retry would just re-reject — and must not look like an outage).
    if (error && primaryFn !== "gemini-proxy") {
      const vendorCrisis = await inspectProxyCrisisRejection(error);
      if (vendorCrisis.route) {
        return (await routeCrisis(
          proxyCrisisSafetyResult(input.locale, input.minor),
          input.locale,
          input.userId,
          promptHash,
          input.minor,
          vendorCrisis.confirmedMarker ? "proxy_input_red" : "proxy_input_red_unconfirmed",
          { recordCrisisEvent: vendorCrisis.confirmedMarker },
        )) as unknown as GeminiResult<T>;
      }
      if (typeof console !== "undefined") {
        console.warn(`[llm] ${primaryFn} failed for ${input.purpose} — falling back to gemini-proxy`);
      }
      servedByProvider = "gemini";
      ({ data, error } = await supabase.functions.invoke("gemini-proxy", {
        body: proxyBody,
        signal: input.signal,
      }));
    }
    latencyMs = Date.now() - t0;
    if (error) {
      // C9 fallback: the server gate caught what the client lexicon missed —
      // surface the same hotline routing as a client-side RED, never the raw
      // FunctionsHttpError. The proxy does not audit its 422 rejection (it
      // audits only successful Gemini calls), so the client writes the audit.
      // The restricted crisis_events row is added only when the body explicitly
      // carries safety_red_zone; unreadable 422s still show the hotline template.
      const proxyCrisis = await inspectProxyCrisisRejection(error);
      if (proxyCrisis.route) {
        return (await routeCrisis(
          proxyCrisisSafetyResult(input.locale, input.minor),
          input.locale,
          input.userId,
          promptHash,
          input.minor,
          proxyCrisis.confirmedMarker ? "proxy_input_red" : "proxy_input_red_unconfirmed",
          { recordCrisisEvent: proxyCrisis.confirmedMarker },
        )) as unknown as GeminiResult<T>;
      }
      throw error;
    }
    const payload = data as { text?: string; modelUsed?: string; audited?: boolean } | null;
    text = payload?.text ?? "";
    modelUsedForAudit = payload?.modelUsed ?? model;
    vertexBackend = false;
    proxyAudited = payload?.audited === true;
  } else {
    // C2 client constructed with Vertex when configured.
    assertDirectEgressAllowed(env);
    const { client, vertex } = getClient();

    const t0 = Date.now();
    const config = {
      ...(input.responseSchema ? { responseMimeType: "application/json", responseSchema: input.responseSchema } : {}),
      ...(input.signal ? { abortSignal: input.signal } : {}),
      // effort -> thinking budget + output cap, pro tier only (effort is set).
      ...(effort ? effortToConfig(effort) : {}),
      // Non-pro purposes where thinking is provably valueless (verbatim OCR):
      // disable the default dynamic thinking to cut latency + token spend.
      ...(!effort && THINKING_OFF_PURPOSES.has(input.purpose)
        ? { thinkingConfig: { thinkingBudget: 0 } }
        : {}),
    };
    const res = await client.models.generateContent({
      model,
      contents: [
        ...(input.system ? [{ role: "user", parts: [{ text: `[SYSTEM]\n${input.system}` }] }] : []),
        {
          role: "user",
          parts: [
            // Multimodal: attach the image first (Gemini's OCR/vision best
            // practice), mirroring the edge-function path. Without this the
            // direct/Vertex path silently dropped input.image.
            ...(input.image
              ? [{ inlineData: { mimeType: input.image.mimeType, data: input.image.data } }]
              : []),
            { text: input.user },
          ],
        },
      ],
      config: Object.keys(config).length > 0 ? config : undefined,
    });
    latencyMs = Date.now() - t0;
    text = res.text ?? "";
    modelUsedForAudit = model;
    vertexBackend = vertex;
  }

  // Output re-classification + swap. Round-4 H1: the lexical classifyInput pass
  // missed semantically-red output with no literal crisis term, while callAdvisor
  // re-classifies output with the semantic union classifier. Reach parity: gate
  // the swap on classifySafety (lexicon + Gemini Flash where a client key exists;
  // lexicon-only on the keyless web build, exactly like callAdvisor there). We
  // keep a cheap classifier-typed lexical result for the returned
  // GeminiResult.safety shape, but the swap DECISION + recorded zone use the
  // semantic (worst-case-merged) result.
  const lexical = classifyInput(text, input.locale, { minor: input.minor });
  const semantic = await classifySafety(text, input.locale, { userId: input.userId });
  const outputZone: "green" | "yellow" | "red" =
    lexical.zone === "red" || semantic.zone === "red"
      ? "red"
      : lexical.zone === "yellow" || semantic.zone === "yellow"
        ? "yellow"
        : "green";
  const outputSafety = { ...lexical, zone: outputZone };

  // OUTPUT SAFETY SWAP (parity with callAdvisor). The model can emit red-zone
  // content the input classifier never saw — via injected wiki/clip context, a
  // jailbreak, or multi-turn drift. callGemini text is rendered verbatim by every
  // caller (interview probe, phase1 summary, import echo, persona), so we must
  // NOT ship it. Swap in the verbatim crisis template, write an HONEST audit row
  // (real model + latency + a +swap marker so judges see the model WAS called and
  // intercepted), and log a categorical crisis_event. Skip the audit insert only
  // when the proxy already wrote it server-side (proxyAudited), like GREEN/YELLOW.
  if (outputZone === "red") {
    const fixed = fixedCrisisResponse(input.locale, input.minor);
    const swapAudit = {
      promptHash,
      outputHash: djb2(fixed.text),
      modelUsed: `${modelUsedForAudit}+swap:${fixed.version}`,
      vertexBackend,
      safetyZone: "red" as const,
      latencyMs,
      ...(effort ? { effort } : {}),
      ...(servedByProvider ? { reasoningProvider: servedByProvider } : {}),
    };
    if (!proxyAudited) {
      await writeAiAuditLog(input.userId, swapAudit, "[ai_audit_log] output-swap insert failed");
    }
    await writeCrisisEvent(
      input.userId,
      {
        // Carry the semantic classifier's confidence / triggers / C-SSRS level
        // when present (Flash); on the lexicon-only fallback these are the
        // lexicon's conservative values.
        classifierConfidence: semantic.confidence,
        triggerCategories: [...semantic.triggers, "output_swap"],
        cssrsLevel: semantic.cssrsLevel,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      },
      "[crisis_events] output-swap insert failed",
    );
    return {
      text: fixed.text as unknown as T,
      safety: outputSafety,
      audit: swapAudit,
    };
  }

  const audit = {
    promptHash: djb2(`${input.system ?? ""}${input.user}`),
    outputHash: djb2(text),
    modelUsed: modelUsedForAudit,
    vertexBackend,
    safetyZone: outputSafety.zone,
    latencyMs,
    ...(effort ? { effort } : {}),
    ...(servedByProvider ? { reasoningProvider: servedByProvider } : {}),
  };

  // C3: best-effort audit. We must not block UX on logging failure. Skip when
  // the proxy already wrote the row server-side (proxyAudited) to avoid a
  // duplicate; we still write here on the direct path and whenever the proxy
  // did not confirm an audit (deploy-safe fallback).
  if (!proxyAudited) {
    await writeAiAuditLog(input.userId, audit, "[ai_audit_log] insert failed");
  }

  return {
    text: text as unknown as T,
    safety: outputSafety,
    audit,
  };
}

// callAdvisor — Engine 4 entry. Layered safety + Path A RAG retrieval.
//
// Per docs/handoff/build-rag-wiki.md §6.5 "Gemini Wrapper with mandatory safety
// pre-pass" + §7 "Prompt Assembly Template".
//
// Flow:
//   1. classifySafety (LLM-Flash union lexicon) — strong, semantic + literal.
//   2. RED → fixedCrisisResponse + audit log + crisis_events. Never invoke Advisor LLM.
//   3. YELLOW → retrieveEvidence with listening-mode addendum, then Advisor LLM call.
//   4. GREEN → retrieveEvidence with full Advisor prompt, then Advisor LLM call.
//
// Offline-preview mode (LLM_MODE=mock): GREEN/YELLOW returns a templated reply but
// still routes through retrieveEvidence so the system prompt assembly is exercised.
// RED still uses fixedCrisisResponse and still inserts crisis_events. The internal
// "mock" marker stays in the modelUsed audit field; the returned text reads as
// ordinary product copy.
// Advisor-shaped result for a proxy-detected crisis (C9 fallback). Mirrors
// the input-RED block in callAdvisor: same fixed template, same audit +
// crisis_events bookkeeping — but with proxy-derived metadata (confidence
// 0.95 parity with routeCrisis inline; no C-SSRS level; proxy_input_red tag
// distinguishes the server-gate catch in the restricted ledger).
async function advisorProxyCrisisResult(
  input: AdvisorInput,
  promptHash: string,
  vertexBackend: boolean,
  confirmedMarker: boolean,
  // The vendor whose server gate fired — threaded from callAdvisor's resolved
  // routing (Phase 2 seat or legacy seam), NOT re-derived from the env, so the
  // restricted trail attributes the catch to the proxy that actually rejected.
  reasoningProvider: "gemini" | "claude" | "openai",
): Promise<AdvisorResult> {
  const fixed = fixedCrisisResponse(input.locale, input.minor);
  const proxyTrigger = confirmedMarker ? "proxy_input_red" : "proxy_input_red_unconfirmed";
  const audit = {
    promptHash,
    outputHash: djb2(fixed.text),
    modelUsed: `none-crisis-routed-proxy:${fixed.version}`,
    vertexBackend,
    safetyZone: "red" as const,
    latencyMs: 0,
    // Advisor is the reasoning path; record the provider for a complete trail.
    reasoningProvider,
  };
  await writeAiAuditLog(input.userId, audit, "[advisor] proxy-crisis audit failed");
  if (confirmedMarker) {
    await writeCrisisEvent(
      input.userId,
      {
        classifierConfidence: 0.95,
        triggerCategories: [proxyTrigger],
        cssrsLevel: null,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      },
      "[advisor] proxy-crisis crisis_events failed",
    );
  }
  return {
    text: fixed.text,
    zone: "red",
    triggers: [proxyTrigger],
    cssrsLevel: null,
    fixedTemplate: true,
    matchedBatches: ["crisis-detection"],
    evidence: [],
    audit,
  };
}

// --- Embeddings (wiki STEP 4) ---------------------------------------------

// P0-2 (D-26 A19): text-embedding-004 was SHUT DOWN 2026-01-14 — the old live
// path was dead. gemini-embedding-2 with outputDimensionality=768 keeps the
// pgvector column shape (MRL; non-default dims are auto-normalized by the
// model). Vectors from the two models are DIFFERENT SPACES — migration 0068
// nulls every stored 004 vector so old and new never mix in kNN; re-populate
// via the deep-space Data screen backfill.
export const EMBED_MODEL = "gemini-embedding-2";
export const EMBED_DIM = 768;

// Deterministic offline-preview embedding: a unit vector seeded from the text,
// so the same text always maps to the same vector. NOT semantic — it exercises
// the storage + kNN plumbing (mock mode, CI, demos) without a live model.
function mockEmbedding(text: string): number[] {
  let seed = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const v = new Array<number>(EMBED_DIM);
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = (seed / 0xffffffff) * 2 - 1;
    v[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] /= norm;
  return v;
}

export interface EmbedTextsInput {
  userId: string;
  texts: string[];
  locale: "en" | "ko";
  minor?: boolean;
  signal?: AbortSignal;
}

export interface EmbedTextsResult {
  /** One vector per input text (zero vector for skipped red-zone texts). */
  vectors: number[][];
  audit: AuditMeta;
}

const zeroVector = (): number[] => new Array<number>(EMBED_DIM).fill(0);

/**
 * Embed texts via gemini-embedding-2 (wiki STEP 4).
 *
 * Constraints held the same way as callGemini:
 *   C1   only this file imports @google/genai (embedContent lives here).
 *   C9   each text is classified first; a red-zone text is NEVER embedded
 *        (zero vector) so crisis content never leaves the device for the model.
 *   C3   one ai_audit_log row per batch (mock + live).
 *   Cost live egress goes through gemini-proxy when the edge flag is on
 *        (spend-capped, the only path that works on the keyless web build) or
 *        the Vertex client; a direct API-key path is rejected
 *        (assertDirectEgressAllowed), so the $0/mo promise holds.
 */
export async function embedTexts(input: EmbedTextsInput): Promise<EmbedTextsResult> {
  throwIfAborted(input.signal);
  const env = getEnv();

  if (input.texts.length === 0) {
    return {
      vectors: [],
      audit: {
        promptHash: "",
        outputHash: "",
        modelUsed: `none:${EMBED_MODEL}`,
        vertexBackend: env.EXPO_PUBLIC_USE_VERTEX,
        safetyZone: "green",
        latencyMs: 0,
      },
    };
  }

  const t0 = Date.now();
  // C9: classify each text; red ones are skipped (never embedded). Scans BOTH
  // locales: wiki pages carry mixed-language content and the proxy's server
  // gate checks the EN+KO lists on every text — a single-locale client scan
  // would let a cross-locale term through only to have the proxy 422 the
  // whole batch (one poisoned page would wedge every backfill run).
  const skip = input.texts.map(
    (text) =>
      classifyInput(text, "en", { minor: input.minor }).zone === "red" ||
      classifyInput(text, "ko", { minor: input.minor }).zone === "red",
  );
  const anyRed = skip.some(Boolean);

  if (env.EXPO_PUBLIC_LLM_MODE === "mock") {
    const vectors = input.texts.map((text, i) => (skip[i] ? zeroVector() : mockEmbedding(text)));
    const audit: AuditMeta = {
      promptHash: djb2(input.texts.join(" ")),
      outputHash: djb2(String(vectors.length)),
      modelUsed: `mock:${EMBED_MODEL}`,
      vertexBackend: env.EXPO_PUBLIC_USE_VERTEX,
      safetyZone: anyRed ? "red" : "green",
      latencyMs: Date.now() - t0,
    };
    await writeAiAuditLog(input.userId, audit, "[ai_audit_log] embed insert failed (mock)");
    return { vectors, audit };
  }

  const toEmbed = input.texts.filter((_, i) => !skip[i]);
  let embedded: number[][] = [];
  let vertexBackend = false;
  let modelUsedForAudit: string = EMBED_MODEL;
  let proxyAudited = false;

  if (env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION) {
    // Edge path (P0-2): the proxy owns the key + spend cap; this is the ONLY
    // live embedding route on the keyless web build. One batch = one call.
    if (toEmbed.length > 0) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke("gemini-proxy", {
        body: { op: "embed", texts: toEmbed, purpose: "embed_index" },
        signal: input.signal,
      });
      if (error) throw error;
      const payload = data as { vectors?: number[][]; modelUsed?: string; audited?: boolean } | null;
      embedded = Array.isArray(payload?.vectors) ? payload.vectors : [];
      modelUsedForAudit = payload?.modelUsed ?? EMBED_MODEL;
      proxyAudited = payload?.audited === true;
    }
  } else {
    // Direct path: Vertex-only live egress passes the cost guard.
    assertDirectEgressAllowed(env);
    const { client, vertex } = getClient();
    vertexBackend = vertex;
    if (toEmbed.length > 0) {
      const res = await client.models.embedContent({
        model: EMBED_MODEL,
        contents: toEmbed,
        // 768-dim MRL slice - keeps the pgvector column shape (0047) unchanged.
        config: { outputDimensionality: EMBED_DIM },
      });
      embedded = (res.embeddings ?? []).map((e) => e.values ?? []);
    }
  }

  // Re-interleave: red-zone texts get zeros, the rest take the next live vector.
  let k = 0;
  const vectors = input.texts.map((_, i) => (skip[i] ? zeroVector() : embedded[k++] ?? zeroVector()));
  const audit: AuditMeta = {
    promptHash: djb2(input.texts.join(" ")),
    outputHash: djb2(String(vectors.length)),
    modelUsed: modelUsedForAudit,
    vertexBackend,
    safetyZone: anyRed ? "red" : "green",
    latencyMs: Date.now() - t0,
  };
  // C3: skip the client insert when the proxy already audited the batch —
  // UNLESS the batch carried withheld red-zone texts: the proxy only saw the
  // green remainder and audits 'green', so the client row is the only honest
  // record that crisis content was withheld from embedding.
  if (!proxyAudited || anyRed) {
    await writeAiAuditLog(input.userId, audit, "[ai_audit_log] embed insert failed");
  }
  return { vectors, audit };
}

// --- Audio transcription (voice capture) ----------------------------------

export interface TranscribeAudioInput {
  userId: string;
  locale: "en" | "ko";
  /** Base64 audio bytes (no `data:` prefix). */
  base64: string;
  /** Source mime, e.g. "audio/m4a", "audio/mp4", "audio/webm". */
  mimeType: string;
  // C10: a minor's crisis output-swap routes to the youth hotline. Defaults adult.
  minor?: boolean;
  signal?: AbortSignal;
}

export interface TranscribeAudioResult {
  /** The spoken words as text. Empty string when nothing intelligible. */
  text: string;
  safety: SafetyResult;
  audit: AuditMeta;
}

// transcribeAudio - turn a recorded voice memo into its transcript.
//
// Constraints held exactly like callGemini / embedTexts:
//   C1   only this file imports @google/genai (the transcription call lives here).
//   C2   the @google/genai client is Vertex when EXPO_PUBLIC_USE_VERTEX=true
//        (getClient()), the only permitted live egress here.
//   C3   one ai_audit_log row on EVERY path (mock + live + output-swap).
//   C9   the model's transcript is re-classified; a red-zone transcript is
//        swapped for the fixed crisis template + crisis_events (input is audio,
//        so the pre-call text classifier has nothing to scan — output gating is
//        the C9 equivalent, mirroring callGemini's output swap).
//   Cost a live API-key direct path is rejected (assertDirectEgressAllowed);
//        mock and Vertex are the only paths, preserving the $0/mo promise.
//
// NOTE (device verification PENDING): the recorder + real Gemini audio
// transcription cannot be exercised in this environment (no microphone). Mock
// mode is fully wired and tested; the live branch follows the same inline-data
// client pattern as the image path in callGemini but has NOT been run on a real
// recording yet.
export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  throwIfAborted(input.signal);
  const env = getEnv();
  const model = MODELS.flash;
  const promptHash = djb2(`transcribe:${input.mimeType}:${input.base64.length}`);

  // Offline-preview / CI / no-key: never touch the network. Returns a sensible
  // placeholder transcript so the voice flow works end-to-end offline. C3 audit
  // + C9 output classification still run (parity with callGemini mock).
  if (env.EXPO_PUBLIC_LLM_MODE === "mock") {
    const t0 = Date.now();
    const text =
      input.locale === "ko"
        ? "오프라인 미리보기 음성 받아쓰기입니다. 들은 내용을 검토하고 다듬은 뒤 담아 주세요."
        : "This is an offline preview voice transcript. Review and edit what you heard, then save it.";
    const outputSafety = classifyInput(text, input.locale, { minor: input.minor });
    const audit: AuditMeta = {
      promptHash,
      outputHash: djb2(text),
      modelUsed: `mock:${model}`,
      vertexBackend: env.EXPO_PUBLIC_USE_VERTEX,
      safetyZone: outputSafety.zone,
      latencyMs: Date.now() - t0,
    };
    await writeAiAuditLog(input.userId, audit, "[ai_audit_log] transcribe insert failed (mock)");
    return { text, safety: outputSafety, audit };
  }

  // Live: only Vertex (or any non-direct-API-key) egress passes the cost guard.
  // The gemini-proxy edge function only forwards image inline-data, so audio is
  // sent on the direct/Vertex client path (the same inlineData mechanism the
  // image path uses in callGemini).
  assertDirectEgressAllowed(env);
  const { client, vertex } = getClient();
  const prompt =
    input.locale === "ko"
      ? "이 음성 메모를 한국어로 그대로 받아쓰세요. 들은 말만 적고, 다른 설명이나 머리말은 붙이지 마세요. 알아들을 수 없으면 빈 줄로 두세요."
      : "Transcribe this voice memo verbatim in English. Write only the spoken words, no preface or commentary. If nothing is intelligible, return an empty line.";
  const t0 = Date.now();
  const res = await client.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: input.mimeType, data: input.base64 } },
          { text: prompt },
        ],
      },
    ],
    config: input.signal ? { abortSignal: input.signal } : undefined,
  });
  const latencyMs = Date.now() - t0;
  const text = (res.text ?? "").trim();

  // C9 equivalent for an audio-input call: classify the transcript. A red-zone
  // transcript is never returned verbatim — swap in the fixed crisis template,
  // write an HONEST audit row (real model + latency + a +swap marker) and a
  // categorical crisis_event, exactly like callGemini's output swap.
  const lexical = classifyInput(text, input.locale, { minor: input.minor });
  const semantic = await classifySafety(text, input.locale, { userId: input.userId });
  const outputZone: "green" | "yellow" | "red" =
    lexical.zone === "red" || semantic.zone === "red"
      ? "red"
      : lexical.zone === "yellow" || semantic.zone === "yellow"
        ? "yellow"
        : "green";
  const outputSafety: SafetyResult = { ...lexical, zone: outputZone };

  if (outputZone === "red") {
    const fixed = fixedCrisisResponse(input.locale, input.minor);
    const swapAudit: AuditMeta = {
      promptHash,
      outputHash: djb2(fixed.text),
      modelUsed: `${model}+swap:${fixed.version}`,
      vertexBackend: vertex,
      safetyZone: "red",
      latencyMs,
    };
    await writeAiAuditLog(input.userId, swapAudit, "[ai_audit_log] transcribe output-swap insert failed");
    await writeCrisisEvent(
      input.userId,
      {
        classifierConfidence: semantic.confidence,
        triggerCategories: [...semantic.triggers, "output_swap"],
        cssrsLevel: semantic.cssrsLevel,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      },
      "[crisis_events] transcribe output-swap insert failed",
    );
    return { text: fixed.text, safety: outputSafety, audit: swapAudit };
  }

  const audit: AuditMeta = {
    promptHash,
    outputHash: djb2(text),
    modelUsed: model,
    vertexBackend: vertex,
    safetyZone: outputSafety.zone,
    latencyMs,
  };
  await writeAiAuditLog(input.userId, audit, "[ai_audit_log] transcribe insert failed");
  return { text, safety: outputSafety, audit };
}

export async function callAdvisor(input: AdvisorInput): Promise<AdvisorResult> {
  const env = getEnv();
  const promptHash = djb2(input.userMessage);
  // Advisor is the reasoning (pro) path: honor effort (default high). Vendor:
  // the D-26 Phase 2 advisor seat (claude, when EXPO_PUBLIC_LLM_PHASE=2) wins;
  // otherwise the legacy C1-safe reasoning-provider seam applies. Recorded in
  // every advisor audit row (C3).
  const effort: ReasoningEffort = input.effort ?? DEFAULT_EFFORT;
  const advisorSeat = resolveVendorForPurpose("advisor", false);
  const reasoningProvider = advisorSeat !== "gemini" ? advisorSeat : resolveReasoningProvider();

  // Layer 1+2 safety: lexicon backstop + Gemini Flash classifier (semantic).
  const safety = await classifySafety(input.userMessage, input.locale, { userId: input.userId });

  if (safety.zone === "red") {
    const fixed = fixedCrisisResponse(input.locale, input.minor);
    const audit = {
      promptHash,
      outputHash: djb2(fixed.text),
      modelUsed: `none-crisis-routed:${fixed.version}`,
      vertexBackend: env.EXPO_PUBLIC_USE_VERTEX,
      safetyZone: "red" as const,
      latencyMs: 0,
      // No reasoning ran (crisis short-circuit), but record the provider for a
      // complete trail; effort omitted since the model was never invoked.
      reasoningProvider,
    };
    // C3: audit log.
    await writeAiAuditLog(input.userId, audit, "[advisor] audit insert failed");
    // Separate restricted log (crisis_events). Categorical only.
    await writeCrisisEvent(
      input.userId,
      {
        classifierConfidence: safety.confidence,
        triggerCategories: safety.triggers,
        cssrsLevel: safety.cssrsLevel,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      },
      "[advisor] crisis_events insert failed",
    );
    return {
      text: fixed.text,
      zone: "red",
      triggers: safety.triggers,
      cssrsLevel: safety.cssrsLevel,
      fixedTemplate: true,
      matchedBatches: ["crisis-detection"],
      evidence: [],
      audit,
    };
  }

  // YELLOW/GREEN: retrieve grounding evidence. Thread the user's per-domain
  // brightness so a DIM (under-fed) life-domain star pulls that domain's
  // evidence into scope even when the message did not keyword-route to it —
  // wiring the brightness layer to the advice layer. Best-effort: a failed
  // read must never block the advisor, so we fall back to message-only routing.
  const domainLevels = await loadDomainLevels(input.userId)
    .then((d) => d.domainLevels)
    .catch(() => undefined);
  const evidence = await retrieveEvidence({
    userMessage: input.userMessage,
    userLocale: input.locale,
    userAgeRange: input.userAgeRange,
    conversationContext: input.conversationContext,
    domainLevels,
  });

  let systemPrompt = evidence.assembledPrompt;
  if (safety.zone === "yellow") {
    systemPrompt +=
      `\n\n=== YELLOW-ZONE ADDENDUM ===\nThe user is in YELLOW (distress without crisis). ` +
      `Skip the pattern-citation sentence. Mirror + reflective question only. ` +
      `Maximum 3 sentences. Never use "should" or "have you tried". ` +
      `If a recurring pattern across entries, gently mention a professional resource at the very end.`;
  }

  const model = MODELS.pro; // Advisor uses Pro for nuance; Flash was the classifier.

  // Offline-preview short-circuit (still ran safety + retrieval).
  if (env.EXPO_PUBLIC_LLM_MODE === "mock") {
    const text =
      input.locale === "ko"
        ? `당신이 말한 것을 들었어요. 오늘 이 감정에 이름을 붙인다면 어떤 단어가 떠오르나요?`
        : `I heard what you wrote. If you named the feeling under it today, what word comes up?`;
    const audit = {
      promptHash: djb2(systemPrompt + input.userMessage),
      outputHash: djb2(text),
      modelUsed: `mock:${model}`,
      vertexBackend: env.EXPO_PUBLIC_USE_VERTEX,
      safetyZone: safety.zone,
      latencyMs: 0,
      effort,
      reasoningProvider,
    };
    await writeAiAuditLog(input.userId, audit, "[advisor] mock audit failed");
    return {
      text,
      zone: safety.zone,
      triggers: safety.triggers,
      cssrsLevel: safety.cssrsLevel,
      fixedTemplate: false,
      matchedBatches: evidence.matchedBatches,
      evidence: evidence.rows.map((r) => ({
        title: r.title,
        doi: r.doi,
        summary: input.locale === "ko" ? r.summary_ko : r.summary_en,
      })),
      audit,
    };
  }

  // Live mode: real Gemini Pro call. Route through the gemini-proxy Edge
  // Function (key stays server-side) when configured — REQUIRED for the public
  // web bundle, where a direct @google/genai client would need an inlined key.
  // Otherwise construct the client directly (native / Vertex).
  let text: string;
  let latencyMs: number;
  let vertex: boolean;
  // Which backend actually served the answer + the model it reported — both
  // reassigned by the D-26 outage failover / proxy response so the audit rows
  // never attribute a Claude answer to a Gemini id (or vice versa).
  let servedByProvider = reasoningProvider;
  let modelUsedForAudit: string = model;
  // When the proxy writes the audit row itself (C3 server-authoritative) it
  // returns audited:true; we then skip the client insert to avoid double-logging
  // (parity with callGemini).
  let proxyAudited = false;
  // Edge path when configured, OR whenever the vendor is non-Gemini
  // (server-side only). reasoningProxyFn picks the matching proxy.
  if (env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION || reasoningProvider !== "gemini") {
    const supabase = getSupabaseClient();
    // The curated RAG prompt rides in `system` (trusted, NOT crisis-scanned —
    // it legitimately quotes crisis-detection reference text); the genuine
    // journal entry rides in `user`, which the proxy DOES crisis-scan. This
    // fixes the prior false 422 AND keeps the server-side crisis gate effective
    // (a bypassed client can't smuggle crisis content through an unscanned
    // `user` channel — the gate scans exactly what is forwarded as the turn).
    // purpose:"advisor" puts this call behind the proxy's server-side
    // entitlement gate (brain tier) — the client's canUsePremium gate
    // mirrored on the server (#312 punch item).
    const proxyBody = {
      system: systemPrompt,
      user: input.userMessage,
      model,
      purpose: "advisor",
      // Reasoning effort -> each proxy maps it to its vendor's native ladder
      // server-side and clamps per purpose. The tier cap stays the ceiling.
      effort,
    };
    const primaryFn = reasoningProxyFn(reasoningProvider);
    const t0 = Date.now();
    let { data, error } = await supabase.functions.invoke(primaryFn, { body: proxyBody });
    // D-26 outage failover (parity with callGemini): a vendor-seat failure that
    // is NOT a crisis 422 retries ONCE on the Phase 1 route (gemini-proxy).
    if (error && primaryFn !== "gemini-proxy") {
      const vendorCrisis = await inspectProxyCrisisRejection(error);
      if (vendorCrisis.route) {
        return advisorProxyCrisisResult(
          input,
          promptHash,
          env.EXPO_PUBLIC_USE_VERTEX,
          vendorCrisis.confirmedMarker,
          reasoningProvider,
        );
      }
      if (typeof console !== "undefined") {
        console.warn(`[advisor] ${primaryFn} failed — falling back to gemini-proxy`);
      }
      servedByProvider = "gemini";
      ({ data, error } = await supabase.functions.invoke("gemini-proxy", { body: proxyBody }));
    }
    latencyMs = Date.now() - t0;
    if (error) {
      // C9 fallback, Advisor surface: mirror the input-RED UX (fixed template)
      // instead of leaking the raw 422. The proxy does not audit its rejection,
      // so the client writes the audit; crisis_events is marker-confirmed only.
      const proxyCrisis = await inspectProxyCrisisRejection(error);
      if (proxyCrisis.route) {
        return advisorProxyCrisisResult(
          input,
          promptHash,
          env.EXPO_PUBLIC_USE_VERTEX,
          proxyCrisis.confirmedMarker,
          servedByProvider,
        );
      }
      throw error;
    }
    const payload = data as { text?: string; modelUsed?: string; audited?: boolean } | null;
    text = payload?.text ?? "";
    // C3 honesty: the proxy reports which vendor model actually answered
    // (claude-sonnet-5 / claude-opus-4-8 / gemini-*). Falling back to the
    // client-side Gemini id would attribute Claude answers to Gemini.
    modelUsedForAudit = payload?.modelUsed ?? model;
    proxyAudited = payload?.audited === true;
    vertex = false;
  } else {
    assertDirectEgressAllowed(env);
    const c = getClient();
    const t0 = Date.now();
    const res = await c.client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      // Advisor is the reasoning tier: apply the effort -> thinking budget +
      // output cap config (effortToConfig). Pro-tier only; always set here.
      config: effortToConfig(effort),
    });
    latencyMs = Date.now() - t0;
    text = res.text ?? "";
    vertex = c.vertex;
  }

  // OUTPUT SAFETY RE-CLASSIFICATION. Per CSO audit: Pro can emit crisis content
  // (esp. when prompt-injected via knowledge_sources rows or conversationContext)
  // that bypasses input-time classifier. Re-classifying here closes that loop.
  const outputSafety = await classifySafety(text, input.locale, { userId: input.userId });

  if (outputSafety.zone === "red") {
    // Don't ship the Pro text. Substitute the verbatim crisis template, audit
    // both the swapped text and the original (to give judges a trail), and
    // log a crisis_event with categorical metadata.
    const fixed = fixedCrisisResponse(input.locale, input.minor);
    const audit = {
      promptHash: djb2(systemPrompt + input.userMessage),
      outputHash: djb2(fixed.text),
      modelUsed: `${modelUsedForAudit}+swap:${fixed.version}`,
      vertexBackend: vertex,
      safetyZone: "red" as const,
      latencyMs,
      effort,
      reasoningProvider: servedByProvider,
    };
    // Skip when the proxy already wrote the row (proxyAudited); the swap itself
    // is still recorded in crisis_events below regardless.
    if (!proxyAudited) {
      await writeAiAuditLog(input.userId, audit, "[advisor] output-swap audit failed");
    }
    await writeCrisisEvent(
      input.userId,
      {
        classifierConfidence: outputSafety.confidence,
        triggerCategories: [...outputSafety.triggers, "output_swap"],
        cssrsLevel: outputSafety.cssrsLevel,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      },
      "[advisor] output-swap crisis_events failed",
    );
    return {
      text: fixed.text,
      zone: "red",
      triggers: [...outputSafety.triggers, "output_swap"],
      cssrsLevel: outputSafety.cssrsLevel,
      fixedTemplate: true,
      matchedBatches: ["crisis-detection"],
      evidence: [],
      audit,
    };
  }

  // GREEN/YELLOW output — merge input + output zones (worst case wins).
  const finalZone: "green" | "yellow" =
    safety.zone === "yellow" || outputSafety.zone === "yellow" ? "yellow" : "green";

  const audit = {
    promptHash: djb2(systemPrompt + input.userMessage),
    outputHash: djb2(text),
    modelUsed: modelUsedForAudit,
    vertexBackend: vertex,
    safetyZone: finalZone,
    latencyMs,
    effort,
    reasoningProvider: servedByProvider,
  };
  if (!proxyAudited) {
    await writeAiAuditLog(input.userId, audit, "[advisor] audit failed");
  }
  return {
    text,
    zone: finalZone,
    triggers: [...new Set([...safety.triggers, ...outputSafety.triggers])],
    cssrsLevel: safety.cssrsLevel ?? outputSafety.cssrsLevel,
    fixedTemplate: false,
    matchedBatches: evidence.matchedBatches,
    evidence: evidence.rows.map((r) => ({
      title: r.title,
      doi: r.doi,
      summary: input.locale === "ko" ? r.summary_ko : r.summary_en,
    })),
    audit,
  };
}
