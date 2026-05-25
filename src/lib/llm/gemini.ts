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
import { classifyInput, type SafetyResult } from "../safety/classifier";
import { HOTLINES } from "../safety/lexicon";
import { insertAiAuditLog } from "../supabase/audit";
import { MODELS, type GeminiResult, type PromptInput } from "./types";

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
  "journal_reflect" | "audit_qa" | "knowledge_lookup" | "persona_chat",
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
};

function routeCrisis(result: SafetyResult, locale: "en" | "ko"): GeminiResult<string> {
  const h = result.crisisRouting;
  const number = h?.number ?? HOTLINES.GLOBAL_988.number;
  const text =
    locale === "ko"
      ? `지금 많이 힘드신 것 같아요. 혼자 견디지 마시고 ${number}로 연락해 주세요. 전문가가 24시간 함께합니다.`
      : `It sounds like you're going through a lot right now. Please reach out to ${number} — trained responders are available 24/7.`;
  return {
    text,
    safety: result,
    audit: {
      promptHash: "",
      outputHash: djb2(text),
      modelUsed: "none-crisis-routed",
      vertexBackend: false,
      safetyZone: "red",
      latencyMs: 0,
    },
  };
}

export async function callGemini<T = string>(input: PromptInput): Promise<GeminiResult<T>> {
  // C9: pre-call classification of user input. Red zone never reaches the LLM.
  const inputSafety = classifyInput(input.user, input.locale);
  if (inputSafety.zone === "red") {
    return routeCrisis(inputSafety, input.locale) as unknown as GeminiResult<T>;
  }

  const env = getEnv();
  const model = MODELS[input.model ?? "flash"];

  // Mock mode: skip network. Useful for offline dev, CI, and demos without
  // a Gemini API key. C3 audit log + C9 safety classifier still apply.
  if (env.EXPO_PUBLIC_LLM_MODE === "mock") {
    const t0 = Date.now();
    const text = MOCK_RESPONSES[input.purpose][input.locale];
    const latencyMs = Date.now() - t0;
    const outputSafety = classifyInput(text, input.locale);
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

  // Live mode: C2 client constructed with Vertex when configured.
  const { client, vertex } = getClient();

  const t0 = Date.now();
  const res = await client.models.generateContent({
    model,
    contents: [
      ...(input.system ? [{ role: "user", parts: [{ text: `[SYSTEM]\n${input.system}` }] }] : []),
      { role: "user", parts: [{ text: input.user }] },
    ],
    config: input.responseSchema
      ? { responseMimeType: "application/json", responseSchema: input.responseSchema }
      : undefined,
  });
  const latencyMs = Date.now() - t0;
  const text = res.text ?? "";

  // Re-classify the output to record the final zone in audit log.
  const outputSafety = classifyInput(text, input.locale);

  const audit = {
    promptHash: djb2(`${input.system ?? ""}${input.user}`),
    outputHash: djb2(text),
    modelUsed: model,
    vertexBackend: vertex,
    safetyZone: outputSafety.zone,
    latencyMs,
  };

  // C3: best-effort audit. We must not block UX on logging failure.
  try {
    await insertAiAuditLog({ userId: input.userId, ...audit });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[ai_audit_log] insert failed", e);
  }

  return {
    text: text as unknown as T,
    safety: outputSafety,
    audit,
  };
}
