// C1/C2/C3/C9: single LLM entry point.
//
//   C1: Only this file imports @google/genai (enforced by ESLint + boundary script).
//   C2: When EXPO_PUBLIC_USE_VERTEX=true, the @google/genai client is constructed
//       with vertexai:true, satisfying the XPRIZE "Google Cloud product" mandate.
//   C3: After every call, ai_audit_log receives an INSERT via insertAiAuditLog().
//   C9: classifyInput() runs BEFORE the network call. Red zone short-circuits.
//
// Tests in __tests__/gemini.test.ts assert the ordering.

import { GoogleGenAI } from "@google/genai";

import { getEnv } from "../env";
import { retrieveEvidence } from "../knowledge/retrieve";
import { classifyInput, crisisHotlines, type SafetyResult } from "../safety/classifier";
import { insertAiAuditLog } from "../supabase/audit";
import { getSupabaseClient } from "../supabase/client";
import { insertCrisisEvent } from "../supabase/crisis-events";
import { classifySafety, fixedCrisisResponse } from "./safety";
import {
  MODELS,
  type AdvisorInput,
  type AdvisorResult,
  type GeminiResult,
  type PromptInput,
} from "./types";

// Web Crypto SubtleCrypto fallback to a simple non-cryptographic hash when
// running outside a browser/RN runtime (e.g. node tests). Audit hashes are
// for traceability, not for security — collisions are acceptable here.
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
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

// Offline-preview responses keyed by purpose + locale. Used when LLM_MODE=mock
// so the UI can be exercised end-to-end without a live model connection. Safety
// classifier still runs (C9 invariant) and audit log still records the call (C3).
// NOTE: these strings are user-facing in the offline-preview build, so they read
// as ordinary product copy. The internal "mock"/no-key technical marker lives in
// this comment and in modelUsed audit fields only.
const MOCK_RESPONSES: Record<
  "journal_reflect" | "audit_qa" | "knowledge_lookup" | "persona_chat" | "secondb_chat" | "interview_probe" | "imagine" | "import_ingest",
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
  persona_chat: {
    en: "I'm noticing a pattern across your recent entries. Tell me more about how you decided.",
    ko: "최근 기록에서 반복되는 흐름이 보여요. 그 결정을 어떻게 내렸는지 더 들려주세요.",
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

// C9 fallback (2026-06-10 audit follow-up): gemini-proxy is the second,
// server-authoritative crisis gate. When a crisis phrasing slips past the
// client lexicon but the proxy's hasCrisisTerm catches it, functions.invoke
// rejects with a FunctionsHttpError (status 422, body
// { error: "safety_red_zone" }). Before this check the caller surfaced a
// generic failure modal — a user in crisis saw a raw error instead of
// hotline routing.
async function isProxyCrisisRejection(error: unknown): Promise<boolean> {
  if (!error || typeof error !== "object") return false;
  const ctx = (error as { context?: { status?: number; clone?: unknown; json?: unknown } })
    .context;
  if (!ctx || typeof ctx !== "object" || ctx.status !== 422) return false;
  // Confirm the marker when the body is readable. The proxy's only 422 source
  // today is the crisis gate, so an unreadable body still counts as crisis —
  // over-routing shows a dismissible hotline modal; under-routing shows a raw
  // error to someone in crisis. A readable body with a DIFFERENT error marker
  // (a future non-crisis 422) is rethrown by the callers.
  try {
    const target =
      typeof ctx.clone === "function"
        ? ((ctx.clone as () => { json?: () => Promise<unknown> })())
        : (ctx as { json?: () => Promise<unknown> });
    if (typeof target.json !== "function") return true;
    const body = (await target.json()) as { error?: unknown } | null;
    return body == null || typeof body.error !== "string" || body.error === "safety_red_zone";
  } catch {
    return true;
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
  try {
    await insertAiAuditLog({ userId, ...audit });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[ai_audit_log] crisis insert failed", e);
  }
  // Separate restricted ledger (crisis_events), parity with callAdvisor's input-RED
  // path. Without this every callGemini surface (chat/journal/interview/persona/
  // import/clipper/phase1) intercepted a crisis but left NO categorical trace in the
  // restricted log. routeCrisis only has the lexicon classifier's fields, so map
  // them conservatively (RED confidence 0.95 like lexiconToResult; no C-SSRS level;
  // categories else "lexicon_match", tagged with sourceTag — input_red for the
  // client short-circuit, proxy_input_red for the server-gate 422 fallback —
  // to distinguish from the output_swap path). Best-effort — never throw out
  // of routeCrisis.
  try {
    const lexCategories =
      result.categories.length > 0
        ? result.categories
        : result.matched.length > 0
          ? ["lexicon_match"]
          : [];
    await insertCrisisEvent({
      classifierConfidence: 0.95,
      triggerCategories: [...lexCategories, sourceTag],
      cssrsLevel: null,
      routingTemplateVersion: "routecrisis-inline-v1",
      locale,
    });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[crisis_events] crisis insert failed", e);
  }
  return { text, safety: result, audit };
}

export async function callGemini<T = string>(input: PromptInput): Promise<GeminiResult<T>> {
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
  const model = MODELS[input.model ?? "flash"];

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
    };
    try {
      await insertAiAuditLog({ userId: input.userId, ...audit });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[ai_audit_log] insert failed (mock)", e);
    }
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

  if (env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION) {
    const supabase = getSupabaseClient();
    const t0 = Date.now();
    const { data, error } = await supabase.functions.invoke("gemini-proxy", {
      body: {
        system: input.system ?? null,
        user: input.user,
        model,
        // Purpose label: lets the proxy apply purpose-aware policy (premium
        // entitlement gate) and gives server logs call attribution. Labels are
        // self-reported, so the proxy's tier-aware cap is the hard ceiling.
        purpose: input.purpose,
        // Optional image payload for multimodal OCR / vision prompts.
        ...(input.image ? { image: input.image } : {}),
        // Structured-output schema (e.g. phase1). The proxy sets
        // responseMimeType=application/json + responseSchema when present so
        // edge-routed callers reach parity with the direct-client path.
        ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
      },
    });
    latencyMs = Date.now() - t0;
    if (error) {
      // C9 fallback: the server gate caught what the client lexicon missed —
      // surface the same hotline routing as a client-side RED, never the raw
      // FunctionsHttpError. The proxy does not audit its 422 rejection (it
      // audits only successful Gemini calls), so routeCrisis writing the
      // audit + crisis_events rows here is the only record — no double-log.
      if (await isProxyCrisisRejection(error)) {
        return (await routeCrisis(
          proxyCrisisSafetyResult(input.locale, input.minor),
          input.locale,
          input.userId,
          promptHash,
          input.minor,
          "proxy_input_red",
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
      config: input.responseSchema
        ? { responseMimeType: "application/json", responseSchema: input.responseSchema }
        : undefined,
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
    };
    if (!proxyAudited) {
      try {
        await insertAiAuditLog({ userId: input.userId, ...swapAudit });
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[ai_audit_log] output-swap insert failed", e);
      }
    }
    try {
      await insertCrisisEvent({
        // Carry the semantic classifier's confidence / triggers / C-SSRS level
        // when present (Flash); on the lexicon-only fallback these are the
        // lexicon's conservative values.
        classifierConfidence: semantic.confidence,
        triggerCategories: [...semantic.triggers, "output_swap"],
        cssrsLevel: semantic.cssrsLevel,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[crisis_events] output-swap insert failed", e);
    }
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
  };

  // C3: best-effort audit. We must not block UX on logging failure. Skip when
  // the proxy already wrote the row server-side (proxyAudited) to avoid a
  // duplicate; we still write here on the direct path and whenever the proxy
  // did not confirm an audit (deploy-safe fallback).
  if (!proxyAudited) {
    try {
      await insertAiAuditLog({ userId: input.userId, ...audit });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[ai_audit_log] insert failed", e);
    }
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
): Promise<AdvisorResult> {
  const fixed = fixedCrisisResponse(input.locale, input.minor);
  const audit = {
    promptHash,
    outputHash: djb2(fixed.text),
    modelUsed: `none-crisis-routed-proxy:${fixed.version}`,
    vertexBackend,
    safetyZone: "red" as const,
    latencyMs: 0,
  };
  try {
    await insertAiAuditLog({ userId: input.userId, ...audit });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[advisor] proxy-crisis audit failed", e);
  }
  try {
    await insertCrisisEvent({
      classifierConfidence: 0.95,
      triggerCategories: ["proxy_input_red"],
      cssrsLevel: null,
      routingTemplateVersion: fixed.version,
      locale: input.locale,
    });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[advisor] proxy-crisis crisis_events failed", e);
  }
  return {
    text: fixed.text,
    zone: "red",
    triggers: ["proxy_input_red"],
    cssrsLevel: null,
    fixedTemplate: true,
    matchedBatches: ["crisis-detection"],
    evidence: [],
    audit,
  };
}

export async function callAdvisor(input: AdvisorInput): Promise<AdvisorResult> {
  const env = getEnv();
  const promptHash = djb2(input.userMessage);

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
    };
    // C3: audit log.
    try {
      await insertAiAuditLog({ userId: input.userId, ...audit });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[advisor] audit insert failed", e);
    }
    // Separate restricted log (crisis_events). Categorical only.
    try {
      await insertCrisisEvent({
        classifierConfidence: safety.confidence,
        triggerCategories: safety.triggers,
        cssrsLevel: safety.cssrsLevel,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[advisor] crisis_events insert failed", e);
    }
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

  // YELLOW/GREEN: retrieve grounding evidence.
  const evidence = await retrieveEvidence({
    userMessage: input.userMessage,
    userLocale: input.locale,
    userAgeRange: input.userAgeRange,
    conversationContext: input.conversationContext,
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
    };
    try {
      await insertAiAuditLog({ userId: input.userId, ...audit });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[advisor] mock audit failed", e);
    }
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
  // When the proxy writes the audit row itself (C3 server-authoritative) it
  // returns audited:true; we then skip the client insert to avoid double-logging
  // (parity with callGemini).
  let proxyAudited = false;
  if (env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION) {
    const supabase = getSupabaseClient();
    const t0 = Date.now();
    const { data, error } = await supabase.functions.invoke("gemini-proxy", {
      // The curated RAG prompt rides in `system` (trusted, NOT crisis-scanned —
      // it legitimately quotes crisis-detection reference text); the genuine
      // journal entry rides in `user`, which the proxy DOES crisis-scan. This
      // fixes the prior false 422 AND keeps the server-side crisis gate effective
      // (a bypassed client can't smuggle crisis content through an unscanned
      // `user` channel — the gate scans exactly what is forwarded as the turn).
      // purpose:"advisor" puts this call behind the proxy's server-side
      // entitlement gate (brain tier) — the client's canUsePremium gate
      // mirrored on the server (#312 punch item).
      body: { system: systemPrompt, user: input.userMessage, model, purpose: "advisor" },
    });
    latencyMs = Date.now() - t0;
    if (error) {
      // C9 fallback, Advisor surface: mirror the input-RED path (fixed
      // template + audit + crisis_events) instead of leaking the raw 422.
      // The proxy does not audit its rejection, so the client rows below are
      // the only record.
      if (await isProxyCrisisRejection(error)) {
        return advisorProxyCrisisResult(input, promptHash, env.EXPO_PUBLIC_USE_VERTEX);
      }
      throw error;
    }
    const payload = data as { text?: string; audited?: boolean } | null;
    text = payload?.text ?? "";
    proxyAudited = payload?.audited === true;
    vertex = false;
  } else {
    assertDirectEgressAllowed(env);
    const c = getClient();
    const t0 = Date.now();
    const res = await c.client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
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
      modelUsed: `${model}+swap:${fixed.version}`,
      vertexBackend: vertex,
      safetyZone: "red" as const,
      latencyMs,
    };
    // Skip when the proxy already wrote the row (proxyAudited); the swap itself
    // is still recorded in crisis_events below regardless.
    if (!proxyAudited) {
      try {
        await insertAiAuditLog({ userId: input.userId, ...audit });
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[advisor] output-swap audit failed", e);
      }
    }
    try {
      await insertCrisisEvent({
        classifierConfidence: outputSafety.confidence,
        triggerCategories: [...outputSafety.triggers, "output_swap"],
        cssrsLevel: outputSafety.cssrsLevel,
        routingTemplateVersion: fixed.version,
        locale: input.locale,
      });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[advisor] output-swap crisis_events failed", e);
    }
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
    modelUsed: model,
    vertexBackend: vertex,
    safetyZone: finalZone,
    latencyMs,
  };
  if (!proxyAudited) {
    try {
      await insertAiAuditLog({ userId: input.userId, ...audit });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[advisor] audit failed", e);
    }
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
