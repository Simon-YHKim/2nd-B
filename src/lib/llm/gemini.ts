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

// Mock responses keyed by purpose + locale. Used when LLM_MODE=mock so the
// UI can be exercised end-to-end without a Gemini API key. Safety classifier
// still runs (C9 invariant) and audit log still records the call (C3).
const MOCK_RESPONSES: Record<
  "journal_reflect" | "audit_qa" | "knowledge_lookup" | "persona_chat" | "jarvis_chat" | "interview_probe" | "imagine" | "import_ingest",
  Record<"en" | "ko", string>
> = {
  journal_reflect: {
    en: "[MOCK] What feeling came up most strongly in that moment? Try naming it in a single word.",
    ko: "[MOCK] 그 순간 가장 또렷이 떠오른 감정이 무엇이었나요? 한 단어로 이름 붙여볼까요?",
  },
  audit_qa: {
    en: "[MOCK] Looking back, who did you lean on most during that period — and what did they offer you?",
    ko: "[MOCK] 그 시기를 돌아보면, 가장 의지했던 사람은 누구였고, 그 사람은 당신에게 무엇을 주었나요?",
  },
  knowledge_lookup: {
    en: "[MOCK] Curator stub — psychology references will appear here once a Gemini key is configured.",
    ko: "[MOCK] 큐레이터 임시 응답 — Gemini 키 연결 후 검증된 자료가 표시됩니다.",
  },
  persona_chat: {
    en: "[MOCK] I'm noticing a pattern across your recent entries. Tell me more about how you decided.",
    ko: "[MOCK] 최근 기록에서 반복되는 흐름이 보여요. 그 결정을 어떻게 내렸는지 더 들려주세요.",
  },
  jarvis_chat: {
    en: "[MOCK] SecondB stub — once Gemini is connected I'll consult your captured pages and answer with citations. For now I'm echoing the prompt structure.",
    ko: "[MOCK] 세컨비 임시 응답 — Gemini 연결 후엔 캡처한 페이지를 참고해 인용과 함께 답해 드려요. 지금은 프롬프트 구조만 흉내내요.",
  },
  interview_probe: {
    en: "[MOCK] What part of what you just said feels most alive to you right now?",
    ko: "[MOCK] 방금 말한 것 중에서 지금 가장 살아 있는 느낌이 드는 부분은 무엇인가요?",
  },
  // Structured "공상" stub in the :: delimited format parseImagineResult expects,
  // so the result cards render in mock mode (the default deployed build).
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
  // Structured JSON stub for the external-import ingest so /import works in
  // the default mock build (parseIngestResult reads this shape).
  import_ingest: {
    en: JSON.stringify({
      summary: "[MOCK] A reflective, curious person who values growth and close relationships.",
      track: "daily",
      tags: ["imported", "growth", "reflection"],
      items: [
        { section: "trait", title: "Openness", detail: "Drawn to new ideas and perspectives.", confidence: "medium" },
        { section: "value", title: "Growth", detail: "Frames experiences as chances to learn.", confidence: "medium" },
        { section: "relationship", title: "Close ties", detail: "Leans on a small circle of trusted people.", confidence: "low" },
      ],
    }),
    ko: JSON.stringify({
      summary: "[MOCK] 성장과 가까운 관계를 중요하게 여기는, 호기심 많고 성찰적인 사람.",
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

async function routeCrisis(
  result: SafetyResult,
  locale: "en" | "ko",
  userId: string,
  promptHash: string,
  minor = false,
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

  // Mock mode: skip network. Useful for offline dev, CI, and demos without
  // a Gemini API key. C3 audit log + C9 safety classifier still apply.
  if (env.EXPO_PUBLIC_LLM_MODE === "mock") {
    const t0 = Date.now();
    // 'advisor' purpose flows through callAdvisor(), not callGemini(). For
    // any unknown purpose, fall back to a generic mock reply.
    const mockTable = MOCK_RESPONSES as Record<string, Record<"en" | "ko", string>>;
    const text =
      mockTable[input.purpose]?.[input.locale] ??
      (input.locale === "ko" ? "[MOCK] 응답 준비 중이에요." : "[MOCK] Reply pending.");
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
        // Optional image payload for multimodal OCR / vision prompts.
        ...(input.image ? { image: input.image } : {}),
        // Structured-output schema (e.g. phase1). The proxy sets
        // responseMimeType=application/json + responseSchema when present so
        // edge-routed callers reach parity with the direct-client path.
        ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
      },
    });
    latencyMs = Date.now() - t0;
    if (error) throw error;
    const payload = data as { text?: string; modelUsed?: string; audited?: boolean } | null;
    text = payload?.text ?? "";
    modelUsedForAudit = payload?.modelUsed ?? model;
    vertexBackend = false;
    proxyAudited = payload?.audited === true;
  } else {
    // C2 client constructed with Vertex when configured.
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

  // Re-classify the output to record the final zone in audit log.
  const outputSafety = classifyInput(text, input.locale, { minor: input.minor });

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
// Mock mode: GREEN/YELLOW returns a templated [MOCK] string but still routes through
// retrieveEvidence so the system prompt assembly is exercised. RED still uses
// fixedCrisisResponse and still inserts crisis_events.
export async function callAdvisor(input: AdvisorInput): Promise<AdvisorResult> {
  const env = getEnv();
  const promptHash = djb2(input.userMessage);

  // Layer 1+2 safety: lexicon backstop + Gemini Flash classifier (semantic).
  const safety = await classifySafety(input.userMessage, input.locale);

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
        userIdHash: djb2(input.userId),
        zone: "red",
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

  // Mock mode short-circuit (still ran safety + retrieval).
  if (env.EXPO_PUBLIC_LLM_MODE === "mock") {
    const text =
      input.locale === "ko"
        ? `[MOCK 어드바이저] 당신이 말한 것을 들었어요. 오늘 이 감정에 이름을 붙인다면 어떤 단어가 떠오르나요?`
        : `[MOCK Advisor] I heard what you wrote. If you named the feeling under it today, what word comes up?`;
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
  if (env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION) {
    const supabase = getSupabaseClient();
    const t0 = Date.now();
    const { data, error } = await supabase.functions.invoke("gemini-proxy", {
      body: { system: null, user: systemPrompt, model },
    });
    latencyMs = Date.now() - t0;
    if (error) throw error;
    text = (data as { text?: string } | null)?.text ?? "";
    vertex = false;
  } else {
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
  const outputSafety = await classifySafety(text, input.locale);

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
    try {
      await insertAiAuditLog({ userId: input.userId, ...audit });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[advisor] output-swap audit failed", e);
    }
    try {
      await insertCrisisEvent({
        userIdHash: djb2(input.userId),
        zone: "red",
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
  try {
    await insertAiAuditLog({ userId: input.userId, ...audit });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[advisor] audit failed", e);
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
