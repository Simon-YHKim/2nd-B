// Engine 7 — Strong safety classifier.
//
// Layered design (defense in depth):
//   1. Lexicon backstop (src/lib/safety/classifier.ts) — synchronous, always runs.
//   2. Gemini Flash LLM classifier — async, semantic, when env.EXPO_PUBLIC_LLM_MODE !== 'mock' (i.e. live).
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
import { classifyInput as lexiconClassify, crisisHotlines } from "../safety/classifier";
// C3: the Flash classifier makes a real Gemini call client-side (not via the
// gemini-proxy), so the proxy never logs it. This module audits its own call.
// safety.ts is a sanctioned LLM-boundary module (already C1-allowlisted for
// @google/genai); the audit allowlist (check-llm-import-boundary.ts) covers it.
import { insertAiAuditLog } from "../supabase/audit";

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
    // H4-residual (round-5): the direct API-key Flash client is an UNCAPPED Gemini
    // egress — it bypasses the gemini-proxy per-user/day spend cap, the same hole
    // assertDirectEgressAllowed (gemini.ts) closes for the two main branches. On a
    // LIVE build that means uncapped billing of the Gemini free tier on every
    // classify turn, so refuse it and degrade to the lexicon-only backstop (return
    // null -> classifySafety returns the lexicon result; it must NEVER throw).
    // Mirror the guard's condition exactly (live && !Vertex), and check it BEFORE
    // the cache so a previously-built client can't defeat it. Vertex is exempt
    // (GCP-billed); dev/test (non-live) keeps the direct client; the keyless web
    // build is already mock -> null above.
    if (env.EXPO_PUBLIC_LLM_MODE === "live" && !env.EXPO_PUBLIC_USE_VERTEX) return null;
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

// djb2 hash for the ai_audit_log prompt/output (mirrors gemini.ts / gemini-proxy
// so the classifier's audit row hashes consistently with the rest of C3).
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export async function classifySafety(
  userMessage: string,
  locale: "en" | "ko",
  opts?: { userId?: string },
): Promise<SafetyResult> {
  // Layer 1: lexicon. Always runs synchronously.
  const lex = lexiconToResult(userMessage, locale);

  // Layer 2: Gemini Flash, only when we have a real client.
  const client = getFlashClient();
  if (!client) {
    return lex;
  }

  try {
    const t0 = Date.now();
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
    const latencyMs = Date.now() - t0;
    const text = (res.text ?? "").trim();
    let result: SafetyResult = lex;
    if (text) {
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
      result = mergeResults(lex, llm);
    }
    // C3: a real Gemini Flash call happened. The classifier runs client-side (not
    // via the gemini-proxy), so the proxy never logs it — audit it here,
    // best-effort, when attributable to a user. On the public web build the Flash
    // client has no key (getFlashClient() === null) so we never reach this; this
    // closes the C3 gap on native/Vertex live builds.
    if (opts?.userId) {
      try {
        await insertAiAuditLog({
          userId: opts.userId,
          promptHash: djb2(`${SYSTEM_PROMPT}${userMessage}`),
          outputHash: djb2(text),
          modelUsed: "gemini-2.5-flash",
          vertexBackend: getEnv().EXPO_PUBLIC_USE_VERTEX,
          safetyZone: result.zone,
          latencyMs,
        });
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[safety] classifier audit failed", e);
      }
    }
    return result;
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[safety] llm classifier failed, using lexicon", e);
    return lex;
  }
}

// Fixed-string crisis templates per docs/research/batches/crisis-detection.md.
// Hotline numbers come from crisisHotlines() (single source of truth) so KO
// routing stays current (109 since 2024) and minors get the youth line (1388).
// Versions are referenced in the audit log: red-ko-v2 (adult), red-ko-minor-v1
// (14-17), red-en-v1 (988, all ages).
export function fixedCrisisResponse(
  locale: "en" | "ko",
  minor = false,
): { text: string; version: string } {
  const hotlineBlock = crisisHotlines(locale, minor)
    .map((h) => (locale === "ko" ? `📞 ${h.number} — ${h.label} (24시간, 무료)` : `📞 ${h.number} — ${h.label}`))
    .join("\n");
  if (locale === "ko") {
    return {
      text: `지금 많이 힘드신 것 같아요. 혼자 견디지 마세요.

지금 바로 도움을 받을 수 있는 곳이 있어요:

${hotlineBlock}

전화가 어려우시면, 가까운 응급실로 가셔도 됩니다.
당신의 안전이 가장 중요해요. 두번째 뇌는 지금 잠시 한 발 물러나 있을게요.`,
      version: minor ? "red-ko-minor-v1" : "red-ko-v2",
    };
  }
  return {
    text: `It sounds like a lot right now. You don't have to carry it alone.

People are available right now to talk:

${hotlineBlock}
🌐 findahelpline.com — international directory

If calling is hard, you can go to your nearest emergency room.
Your safety matters most. 2nd-Brain is going to step back for a moment.`,
    version: "red-en-v1",
  };
}
