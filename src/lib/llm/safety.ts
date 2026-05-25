// Engine 7 — Strong safety classifier.
//
// Layered design (defense in depth):
//   1. Lexicon backstop (src/lib/safety/classifier.ts) — synchronous, always runs.
//   2. Gemini Flash LLM classifier — async, semantic, when env.EXPO_PUBLIC_LLM_MODE === 'live'.
//   3. Conservative union: if EITHER returns RED, the result is RED.
//
// Per docs/research/batches/crisis-detection.md §"Classifier prompt scaffolding".
// The C-SSRS rubric (Posner 2011) is embedded in the prompt as the level reference.
// Korean markers from Suicide CARE 2.0 (Na et al. 2020) are surfaced for locale='ko'.
//
// IMPORTANT: this module imports @google/genai. ESLint forbids it everywhere
// except this file and src/lib/llm/gemini.ts. The Gemini wrapper composes
// classifySafety() at the top of every Advisor call.

import { GoogleGenAI } from "@google/genai";

import { getEnv } from "../env";
import { classifyInput as lexiconClassify } from "../safety/classifier";

export type SafetyZone = "green" | "yellow" | "red";

export interface SafetyResult {
  zone: SafetyZone;
  triggers: string[];
  confidence: number;
  cssrsLevel: 1 | 2 | 3 | 4 | 5 | 6 | null;
  source: "lexicon" | "llm" | "lexicon+llm" | "lexicon-fallback";
  routingTemplateVersion: string;
}

const ROUTING_TEMPLATE_VERSION = "rcv1-2026-05-25";

const SYSTEM_PROMPT = `You are a safety classifier for a self-reflection journaling app, NOT a clinical tool.
Classify the user message into exactly one of three zones using the C-SSRS rubric below.

ZONES:
- RED  → any C-SSRS level >= 1 (any suicidal ideation, any self-harm intent, any behavior).
         Categories: passive_ideation, active_ideation_no_method, active_ideation_with_method,
         intent_no_plan, intent_with_plan, behavior_past, behavior_preparation, behavior_recent,
         self_harm_non_suicidal.
- YELLOW → emotional distress without crisis signals. Burnout, breakup grief, family conflict,
         work overwhelm, identity confusion. NOT crisis.
- GREEN → neutral or positive content. Daily reflection, ideas, planning, gratitude.

CONSERVATIVE RULE: when in doubt between RED and YELLOW, choose RED. False-positive cost is low
(user sees a hotline they don't need). False-negative cost is catastrophic.

KOREAN markers (Suicide CARE 2.0, Na et al. 2020):
  Active RED: 자살, 죽고 싶, 죽고싶, 살고 싶지 않, 사라지고 싶, 더 이상 살, 끝내고 싶,
              자해, 칼, 약을 모, 유서, 마지막 인사
  Latent RED: 짐이 되, 없어지는 게 나아, 다음 생에는, 영영 잠들고 싶
  YELLOW: 너무 힘들, 지쳤, 우울하, 외로워, 번아웃, 무기력
  GREEN: 행복하, 즐거웠, 새로 배운, 운동, 책, 친구랑

ENGLISH markers:
  Active RED: kill myself, end my life, suicide, want to die, no reason to live,
              self-harm, cutting, overdose, suicide note, last goodbye
  Latent RED: burden to others, better off without me, won't be around, fade away
  YELLOW: exhausted, burned out, lonely, lost, broken up, fight with
  GREEN: happy, grateful, learned, enjoyed, planning

OUTPUT (strict JSON, no prose):
{
  "zone": "red" | "yellow" | "green",
  "triggers": ["category1", "category2"],
  "confidence": 0.0..1.0,
  "cssrsLevel": 1..6 | null
}`;

let cachedClient: GoogleGenAI | null = null;
function getFlashClient(): GoogleGenAI | null {
  try {
    const env = getEnv();
    if (env.EXPO_PUBLIC_LLM_MODE === "mock") return null;
    if (cachedClient) return cachedClient;
    if (env.EXPO_PUBLIC_USE_VERTEX) {
      cachedClient = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_CLOUD_PROJECT!,
        location: env.GOOGLE_CLOUD_LOCATION,
      });
    } else {
      cachedClient = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY ?? "" });
    }
    return cachedClient;
  } catch {
    return null;
  }
}

function lexiconToResult(text: string, locale: "en" | "ko"): SafetyResult {
  const r = lexiconClassify(text, locale);
  return {
    zone: r.zone,
    triggers: r.categories.length > 0 ? r.categories : r.matched.length > 0 ? ["lexicon_match"] : [],
    confidence: r.zone === "red" ? 0.95 : r.zone === "yellow" ? 0.6 : 0.4,
    cssrsLevel: null,
    source: "lexicon-fallback",
    routingTemplateVersion: ROUTING_TEMPLATE_VERSION,
  };
}

// Strongest result wins. RED > YELLOW > GREEN.
function mergeResults(a: SafetyResult, b: SafetyResult): SafetyResult {
  const order: SafetyZone[] = ["red", "yellow", "green"];
  const winner = order.indexOf(a.zone) <= order.indexOf(b.zone) ? a : b;
  return {
    zone: winner.zone,
    triggers: [...new Set([...a.triggers, ...b.triggers])],
    confidence: Math.max(a.confidence, b.confidence),
    cssrsLevel: a.cssrsLevel ?? b.cssrsLevel,
    source: "lexicon+llm",
    routingTemplateVersion: ROUTING_TEMPLATE_VERSION,
  };
}

export async function classifySafety(userMessage: string, locale: "en" | "ko"): Promise<SafetyResult> {
  // Layer 1: lexicon. Always runs synchronously.
  const lex = lexiconToResult(userMessage, locale);

  // Layer 2: Gemini Flash, only when we have a real client.
  const client = getFlashClient();
  if (!client) {
    return lex;
  }

  try {
    const res = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nUser message (locale=${locale}):\n"""\n${userMessage}\n"""\n\nClassify now. Output JSON only, no prose.` }] },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          required: ["zone", "triggers", "confidence"],
          properties: {
            zone: { type: "string", enum: ["red", "yellow", "green"] },
            triggers: { type: "array", items: { type: "string" } },
            confidence: { type: "number" },
            cssrsLevel: { type: ["number", "null"] },
          },
        },
      },
    });
    const text = (res.text ?? "").trim();
    if (!text) return lex;
    const parsed = JSON.parse(text) as {
      zone: SafetyZone;
      triggers?: string[];
      confidence?: number;
      cssrsLevel?: number | null;
    };
    const llm: SafetyResult = {
      zone: parsed.zone,
      triggers: parsed.triggers ?? [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      cssrsLevel: (parsed.cssrsLevel as SafetyResult["cssrsLevel"]) ?? null,
      source: "llm",
      routingTemplateVersion: ROUTING_TEMPLATE_VERSION,
    };
    return mergeResults(lex, llm);
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[safety] llm classifier failed, using lexicon", e);
    return lex;
  }
}

// Fixed-string crisis templates per docs/research/batches/crisis-detection.md.
// Keep verbatim — these are referenced as "red-ko-v1" / "red-en-v1" in the audit log.
export function fixedCrisisResponse(locale: "en" | "ko"): { text: string; version: string } {
  if (locale === "ko") {
    return {
      text: `지금 많이 힘드신 것 같아요. 혼자 견디지 마세요.

지금 바로 도움을 받을 수 있는 곳이 있어요:

📞 1393 — 자살예방상담전화 (24시간, 무료)
📞 1577-0199 — 정신건강위기상담전화

전화가 어려우시면, 가까운 응급실로 가셔도 됩니다.
당신의 안전이 가장 중요해요. 두번째 뇌는 지금 잠시 한 발 물러나 있을게요.`,
      version: "red-ko-v1",
    };
  }
  return {
    text: `It sounds like a lot right now. You don't have to carry it alone.

People are available right now to talk:

📞 988 — Suicide & Crisis Lifeline (24/7, free, US)
🌐 findahelpline.com — international directory

If calling is hard, you can go to your nearest emergency room.
Your safety matters most. 2nd-Brain is going to step back for a moment.`,
    version: "red-en-v1",
  };
}
