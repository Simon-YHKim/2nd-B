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
import { getSupabaseClient } from "../supabase/client";
import { MODELS } from "./types";
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

// Observability for audit H1 / decision D4: on a LIVE non-Vertex build the Flash
// client is null, so crisis detection is permanently lexicon-only - a silent
// degradation. Surface it once per session (console.warn is captured by Sentry)
// so the gap is visible until the server-side classifier is wired. This only
// logs; it does NOT change any classification. (Full server-side safety_classify
// routing is the flag-gated clinical follow-up, gated on a crisis eval set +
// safety-owner sign-off.)
let _semanticDarkWarned = false;
function noteSemanticUnavailable(): void {
  if (_semanticDarkWarned) return;
  try {
    const env = getEnv();
    if (env.EXPO_PUBLIC_LLM_MODE === "live" && !env.EXPO_PUBLIC_USE_VERTEX) {
      _semanticDarkWarned = true;
      if (typeof console !== "undefined") {
        console.warn(
          "[safety] Layer-2 semantic classifier UNAVAILABLE on this live build " +
            "(keyless/non-Vertex): crisis detection is lexicon-only. Wire server-side " +
            "safety_classify to restore it (audit H1, D4).",
        );
      }
    }
  } catch {
    // The safety path must never throw.
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
  // Fail-closed ranking: an out-of-enum zone (e.g. an LLM hallucination not
  // matching the enum) gives indexOf === -1, which would otherwise rank as the
  // STRONGEST and let an unknown zone beat — and downgrade — a recognized RED.
  // Treat any unrecognized zone as the RED-most rank (0) so it can never win
  // over, nor downgrade, a recognized result; never fail open on a crisis.
  const rank = (z: SafetyZone): number => {
    const i = order.indexOf(z);
    return i === -1 ? 0 : i;
  };
  const winner = rank(a.zone) <= rank(b.zone) ? a : b;
  // If the winning result carries an unrecognized zone, emit the RED-most
  // recognized zone instead of leaking the unknown string downstream.
  const winnerZone: SafetyZone = order.includes(winner.zone) ? winner.zone : order[0];
  return {
    zone: winnerZone,
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

// The responseSchema declares cssrsLevel only as number|null — no range. The
// crisis ledger column is CHECK (cssrs_level BETWEEN 1 AND 6), so an off-scale
// or fractional value would violate the CHECK inside log_crisis_event and the
// swallowed insert error would silently drop the RED ledger row. Round
// in-range values; map off-scale ones to null (the column is nullable) rather
// than fabricating a C-SSRS level the model never validly produced.
function sanitizeCssrsLevel(v: unknown): SafetyResult["cssrsLevel"] {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= 1 && r <= 6 ? (r as SafetyResult["cssrsLevel"]) : null;
}

// D4 (audit H1): flag-gated server-side Layer-2 classifier. On a keyless build
// getFlashClient() is null and the semantic layer is otherwise dark; when
// EXPO_PUBLIC_SERVER_SAFETY === "true" we route the classification through the
// gemini-proxy safety_classify seat (the server holds the key + is exempt from
// the proxy's crisis short-circuit), restoring semantic crisis detection without
// an uncapped client-side egress. OFF BY DEFAULT and DELIBERATELY so: enabling it
// requires a crisis eval set + safety-owner sign-off, because a wrong classifier
// on this path affects vulnerable users. Returns null to fall back to lexicon;
// NEVER throws.
async function classifyViaProxy(
  userMessage: string,
  locale: "en" | "ko",
): Promise<SafetyResult | null> {
  try {
    // Direct process.env read so babel-preset-expo inlines the flag at build time
    // (default undefined -> off). Do not route through getEnv (not in its schema).
    if (process.env.EXPO_PUBLIC_SERVER_SAFETY !== "true") return null;
    const { data, error } = await getSupabaseClient().functions.invoke("gemini-proxy", {
      body: {
        purpose: "safety_classify",
        // Config-defect fix (cowork 발주2, 2026-07-21; docs/handoff/ai_260721.md
        // 회신2 C): this body used to omit model AND effort, so the proxy
        // defaulted to old-gen gemini-2.5-flash (base-key attribution under the
        // D-27 combo-key scheme) at effort high (2048 thinking tokens) for a
        // one-sentence JSON classification. Pin the env-routed flash tier (same
        // class the local client path uses; deployed pins resolve 3.5-flash,
        // unset env keeps today's 2.5-flash default) and the low effort rung
        // (proxy ladder: 512 thinking / 1024 out). Live-measured delta on the
        // deployed proxy: see the handoff's 발주2 전후 표. If a future crisis
        // eval shows the low rung hurts semantic recall, raise effort — that
        // eval is the D4 activation gate's job, not this cost fix.
        model: MODELS.flash,
        effort: "low",
        system: `${SYSTEM_PROMPT}\n\nClassify the user message below. Output JSON only, no prose.`,
        user: `User message (locale=${locale}):\n"""\n${userMessage}\n"""`,
        responseSchema: {
          type: "object",
          required: ["zone", "triggers", "confidence"],
          properties: {
            zone: { type: "string", enum: ["red", "yellow", "green"] },
            triggers: { type: "array", items: { type: "string" } },
            confidence: { type: "number" },
            // Single type, NOT the union ["number","null"]: the Gemini REST API
            // rejects union types in responseSchema with 400 Invalid JSON payload
            // (live-reproduced 2026-07-21, handoff 회신3 발주2) - which made BOTH
            // semantic paths silently degrade to lexicon-only via their catch
            // blocks. Nullability = omission: cssrsLevel is not in required, and
            // the zone gate below nulls it on every non-red verdict anyway.
            cssrsLevel: { type: "number" },
          },
        },
      },
    });
    if (error || !data) return null;
    const text = String((data as { text?: unknown }).text ?? "").trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as {
      zone: SafetyZone;
      triggers?: string[];
      confidence?: number;
      cssrsLevel?: number | null;
    };
    if (parsed.zone !== "red" && parsed.zone !== "yellow" && parsed.zone !== "green") return null;
    return {
      zone: parsed.zone,
      triggers: parsed.triggers ?? [],
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5,
      // Zone-gated: C-SSRS levels are only defined for crisis verdicts (rubric:
      // RED = level >= 1). The single-type schema above forces a number slot, and
      // live Gemini emitted cssrsLevel 6 on a benign GREEN walk note (observed
      // 2026-07-21) - an in-range junk value sanitize alone cannot distinguish.
      cssrsLevel: parsed.zone === "red" ? sanitizeCssrsLevel(parsed.cssrsLevel) : null,
      source: "llm",
      routingTemplateVersion: ROUTING_TEMPLATE_VERSION,
    };
  } catch {
    return null; // the safety path must never throw
  }
}

export async function classifySafety(
  userMessage: string,
  locale: "en" | "ko",
  opts?: { userId?: string },
): Promise<SafetyResult> {
  // Layer 1: lexicon. Always runs synchronously. Dual-locale: catch a crisis
  // term written in the other language than the UI locale (mirrors the proxy
  // EN+KO gate + classifyInputAnyLocale) - the largest single-locale blind spot.
  let lex = lexiconToResult(userMessage, locale);
  if (lex.zone !== "red") {
    const lexOther = lexiconToResult(userMessage, locale === "ko" ? "en" : "ko");
    if (lexOther.zone === "red") lex = lexOther;
  }

  // Layer 2: Gemini Flash, only when we have a real client.
  const client = getFlashClient();
  if (!client) {
    // D4 (flag-gated): try the server-side classifier before degrading to lexicon.
    const viaProxy = await classifyViaProxy(userMessage, locale);
    if (viaProxy) return mergeResults(lex, viaProxy);
    noteSemanticUnavailable();
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
            // Single type, NOT the union ["number","null"]: the Gemini REST API
            // rejects union types in responseSchema with 400 Invalid JSON payload
            // (live-reproduced 2026-07-21, handoff 회신3 발주2) - which made BOTH
            // semantic paths silently degrade to lexicon-only via their catch
            // blocks. Nullability = omission: cssrsLevel is not in required, and
            // the zone gate below nulls it on every non-red verdict anyway.
            cssrsLevel: { type: "number" },
          },
        },
      },
    });
    const latencyMs = Date.now() - t0;
    const text = (res.text ?? "").trim();
    let result: SafetyResult = lex;
    if (text) {
      // Inner try: a completed-but-malformed Flash payload must degrade to the
      // lexicon result WITHOUT skipping the C3 audit below — the call already
      // happened (and billed). Only transport errors (no completed call) may
      // reach the outer catch.
      try {
        const parsed = JSON.parse(text) as {
          zone: SafetyZone;
          triggers?: string[];
          confidence?: number;
          cssrsLevel?: number | null;
        };
        const llm: SafetyResult = {
          zone: parsed.zone,
          triggers: parsed.triggers ?? [],
          // Ledger column classifier_confidence is CHECK (0..1) — clamp so an
          // off-range model value can't void the crisis-ledger insert.
          confidence:
            typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
              ? Math.min(1, Math.max(0, parsed.confidence))
              : 0.5,
          // Zone-gated for the same reason as the proxy path above (C-SSRS is
          // only defined for crisis verdicts; live GREEN emitted junk level 6).
          cssrsLevel: parsed.zone === "red" ? sanitizeCssrsLevel(parsed.cssrsLevel) : null,
          source: "llm",
          routingTemplateVersion: ROUTING_TEMPLATE_VERSION,
        };
        result = mergeResults(lex, llm);
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[safety] classifier payload unparseable, using lexicon", e);
      }
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
          // 0095: the A18 seat name — same label the proxy path self-reports
          // (classifyViaProxy), so classifier rows aggregate under one purpose.
          purpose: "safety_classify",
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
