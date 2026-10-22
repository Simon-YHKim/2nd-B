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
// except this file and src/lib/llm/boundary.ts. The Gemini wrapper composes
// classifySafety() at the top of every Advisor call.

import { GoogleGenAI } from "@google/genai";
import { emergencyGuidance, emergencyHotlineForText } from "../safety/emergency-routing";
import { getEnv } from "../env";
import type { AuthenticatedAccountSessionLease } from "../auth/account-session-lease";
import { beforeOwnerDispatch, captureLiveOwnerCheck, observeLiveOwner, requestCancellationSignal, withLiveOwnerSignal } from "../auth/live-owner-guard";
import { enqueueAuditWrite } from "./audit-write-outbox";
import { abortError, throwIfAborted } from "../async/abort";
import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { classifyInput as lexiconClassify, crisisHotlines } from "../safety/classifier";
import { getSupabaseClient } from "../supabase/client";
import { proxyFnForVendor, safetyVendor } from "./routing";
import { MODELS, type CrisisObserver } from "./types";
// C3: the Flash classifier makes a real Gemini call client-side (not via the
// gemini-proxy), so the proxy never logs it. This module audits its own call.
// safety.ts is a sanctioned LLM-boundary module (already C1-allowlisted for
// @google/genai); the audit allowlist (check-llm-import-boundary.ts) covers it.
import { insertAiAuditLog } from "../supabase/audit";
import { invokeFunctionWithCapturedSession } from "../supabase/captured-session-client";

export type SafetyZone = "green" | "yellow" | "red";

export interface SafetyResult {
  zone: SafetyZone; hotline?: import("../safety/lexicon").HotlineId;
  triggers: string[];
  confidence: number;
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

HOW TO READ THE MESSAGE (apply this before the marker lists):
- Judge what the writer is saying about themselves, not which letters appear. A marker counts only
  when the message, read as a whole, expresses the writer's own wish, plan or act of suicide or self-harm.
- Words may be broken up by punctuation, symbols, spaces, line breaks or invisible characters.
  Read the message with those removed. If the restored sentence is a first-person risk statement,
  classify it exactly as if it had been written plainly (RED).
- If the restored text is not such a statement, the marker does not apply. These are not statements
  about the writer: source code, identifiers, variable or field names, file paths, URLs, e-mail
  addresses, titles, events in games or fiction, sports and other technical terms.
- Everyday sentences that merely share letters with a marker are not RED: finishing or ending a task,
  where or with whom someone wants to live, asking someone to look at something, a date or a name.
- A plain denial of suicidal thoughts is not RED by itself.

CONSERVATIVE RULE: when the writer does make a first-person statement about dying, disappearing or
harming themselves and its seriousness is unclear, choose RED over YELLOW. False-negative cost is
catastrophic. This rule does not turn text that is not about the writer into RED.

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
  "confidence": 0.0..1.0
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
// degradation. Surface it once per session in local logs and the queryable audit
// row below until the server-side classifier is wired. This only
// logs; it does NOT change any classification. (Full server-side safety_classify
// routing is the flag-gated safety follow-up, gated on a crisis eval set +
// safety-owner sign-off.)
let _semanticDarkWarned = false;
let _semanticDarkAudited = false;
function noteSemanticUnavailable(opts?: {
  userId?: string;
  lexiconZone?: SafetyZone;
  capturedSession?: AuthenticatedAccountSessionLease;
  assertCurrent?: () => void;
}): void {
  // Fast exit only when BOTH signals are already emitted this session.
  if (_semanticDarkWarned && _semanticDarkAudited) return;
  try {
    const env = getEnv();
    if (env.EXPO_PUBLIC_LLM_MODE !== "live" || env.EXPO_PUBLIC_USE_VERTEX) return;

    if (!_semanticDarkWarned) {
      _semanticDarkWarned = true;
      if (typeof console !== "undefined") {
        console.warn(
          "[safety] Layer-2 semantic classifier UNAVAILABLE on this live build " +
            "(keyless/non-Vertex): crisis detection is lexicon-only. Wire server-side " +
            "safety_classify to restore it (audit H1, D4).",
        );
      }
    }

    // R5: console.warn is ephemeral and is not an external telemetry channel while
    // third-party crash reporting is hard-disabled. Also record ONE best-effort,
    // queryable health row per session
    // in ai_audit_log (the ledger ops already monitor), marked modelUsed
    // 'lexicon-only', so "the Layer-2 classifier ran dark for real users" is
    // visible in prod (SELECT ... WHERE model_used='lexicon-only') without relying
    // on log capture. Needs a signed-in user to attribute to; latched separately so
    // an anon first-hit doesn't consume the once-per-session audit slot. Never
    // throws -- the safety path must not break on a telemetry failure.
    if (!_semanticDarkAudited && opts?.userId) {
      opts.assertCurrent?.();
      const liveOwner = opts.assertCurrent ? observeLiveOwner(opts.assertCurrent) : undefined;
      _semanticDarkAudited = true;
      void insertAiAuditLog({
        userId: opts.userId,
        promptHash: "",
        outputHash: "",
        modelUsed: "lexicon-only",
        vertexBackend: false,
        safetyZone: opts.lexiconZone ?? "green",
        latencyMs: 0,
        purpose: "safety_classify",
      }, opts.capturedSession?.accessToken, opts.capturedSession?.signal ?? liveOwner?.signal).catch(() => {
        // A cancelled dispatch did not spend the session's health slot.
        if ((opts.capturedSession?.signal ?? liveOwner?.signal)?.aborted) _semanticDarkAudited = false;
        // best-effort health signal; never surface
      }).finally(() => liveOwner?.release());
    }
  } catch {
    // The safety path must never throw.
  }
}

function lexiconToResult(text: string, locale: "en" | "ko"): SafetyResult {
  const r = lexiconClassify(text, locale);
  return {
    zone: r.zone, hotline: emergencyHotlineForText(text),
    triggers: r.categories.length > 0 ? r.categories : r.matched.length > 0 ? ["lexicon_match"] : [],
    confidence: r.zone === "red" ? 0.95 : r.zone === "yellow" ? 0.6 : 0.4,
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
    zone: winnerZone, hotline: a.hotline ?? b.hotline,
    triggers: [...new Set([...a.triggers, ...b.triggers])],
    confidence: Math.max(a.confidence, b.confidence),
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
  capturedSession?: AuthenticatedAccountSessionLease,
  signal?: AbortSignal,
): Promise<SafetyResult | null> {
  capturedSession?.assertCurrent();
  // Direct read: babel-preset-expo inlines this independent, default-off flag.
  if (process.env.EXPO_PUBLIC_SERVER_SAFETY !== "true") return null;
  return requestProxyClassification(userMessage, locale, capturedSession, signal);
}

// R1: 449 production-seat round trips on 2026-10-11 measured median 1.5s,
// p95 1.8s, max 4.2s. Allow 5s, then let this optional input check fail open.
const OBFUSCATION_TIMEOUT_MS = 5_000;

// Q-261011-05: this entry only asks for meaning; it never unions with lexicon.
// Transport/payload failures return null. Session invalidation/abort still escape.
export async function classifyObfuscatedInput(
  userMessage: string,
  locale: "en" | "ko",
  opts?: { capturedSession?: AuthenticatedAccountSessionLease; signal?: AbortSignal; assertCurrent?: () => void; onRedResult?: (result: SafetyResult) => void },
): Promise<SafetyResult | null> {
  const assertActive = (): void => {
    opts?.capturedSession?.assertCurrent();
    throwIfAborted(opts?.capturedSession?.signal);
    throwIfAborted(opts?.signal);
    opts?.assertCurrent?.();
  };
  assertActive();
  if (process.env.EXPO_PUBLIC_OBFUSCATION_SAFETY !== "true") return null;
  const controller = new AbortController();
  const liveOwner = opts?.assertCurrent ? observeLiveOwner(opts.assertCurrent, controller.signal) : undefined;
  let timedOut = false;
  const signals = [opts?.signal, opts?.capturedSession?.signal];
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort();
      reject(abortError());
    };
    for (const signal of signals) signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    // Bound the wait even if the transport ignores signal. Cancellation also
    // races independently so a stalled proxy cannot delay a user's abort.
    const result = await withTimeout(Promise.race([
      requestProxyClassification(userMessage, locale, opts?.capturedSession, liveOwner?.signal ?? controller.signal, true, opts?.onRedResult ? result => {
        // Retain only a validated received verdict, never a timeout guess. This
        // callback records for the original owner; it cannot authorize egress/UI.
        if (!timedOut) opts.onRedResult?.(result);
      } : undefined, () => !timedOut),
      cancelled,
    ]), OBFUSCATION_TIMEOUT_MS, "Obfuscated input classification");
    assertActive();
    return result;
  } catch (error) {
    // Abort the transport on timeout; the aborted signal also discards late
    // payloads before parsing. Recheck callers AFTER abort: cancellation wins
    // even when it arrives during the timeout's continuation.
    if (isTimeoutError(error)) { timedOut = true; controller.abort(); }
    assertActive();
    if (isTimeoutError(error)) return null;
    throw error;
  } finally {
    for (const signal of signals) signal?.removeEventListener("abort", onAbort);
    liveOwner?.release();
  }
}

// One best-effort health row for this failed gated attempt, without input text.
// The caller checks the flag and fences the completed request before recording.
export function noteObfuscationUnavailable(
  userId: string,
  lexiconZone: SafetyZone,
  capturedSession?: AuthenticatedAccountSessionLease,
  signal?: AbortSignal,
): void {
  const liveOwner = capturedSession ? undefined : observeLiveOwner(captureLiveOwnerCheck(userId), signal);
  try {
    liveOwner?.assertCurrent();
    void insertAiAuditLog({
      userId,
      promptHash: "",
      outputHash: "",
      modelUsed: "obfuscation-safety-unavailable",
      vertexBackend: false,
      safetyZone: lexiconZone,
      latencyMs: 0,
      purpose: "safety_classify",
    }, capturedSession?.accessToken, capturedSession?.signal ?? liveOwner?.signal ?? signal)
      .catch(() => {}).finally(() => liveOwner?.release());
  } catch {
    liveOwner?.release();
    // Best effort, like noteSemanticUnavailable; generation must remain available.
  }
}

async function requestProxyClassification(
  userMessage: string,
  locale: "en" | "ko",
  capturedSession?: AuthenticatedAccountSessionLease,
  signal?: AbortSignal,
  strictPayload = false,
  onRedResult?: (result: SafetyResult) => void,
  canRetainRed?: () => boolean,
): Promise<SafetyResult | null> {
  try {
    capturedSession?.assertCurrent();
    throwIfAborted(signal);
    // The vendor is a switch now, not a literal. See safetyVendor() for why the
    // September failure here is quieter than a break: this function catches
    // everything and returns null, so a dead key does not error - it silently
    // becomes lexicon-only while the flag still reads "on".
    const vendor = safetyVendor();
    const request = {
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
        // Gemini-only hint. Every other proxy owns its model server-side and
        // ignores this field, so it is sent only when it means something -
        // openai-proxy seats safety_classify on its own cheap tier.
        ...(vendor === "gemini" ? { model: MODELS.flash } : {}),
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
          },
        },
      },
      // Only the obfuscated-input caller supplies a composed request signal.
      // The legacy classifyViaProxy caller retains its captured session signal.
      signal: signal ?? capturedSession?.signal,
    };
    const { data, error } = capturedSession
      ? await invokeFunctionWithCapturedSession<Record<string, unknown>>(
          proxyFnForVendor(vendor),
          capturedSession.accessToken,
          request,
        )
      : await getSupabaseClient().functions.invoke(proxyFnForVendor(vendor), request);
    // The live callback may retain an already received RED for its owner, even
    // when delivery has become stale. Captured execution keeps its existing fence.
    capturedSession?.assertCurrent();
    if (!onRedResult || canRetainRed?.() === false) throwIfAborted(requestCancellationSignal(signal));
    if (error || !data) return null;
    const text = String((data as { text?: unknown }).text ?? "").trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as {
      zone: SafetyZone;
      triggers?: string[];
      confidence?: number;
    };
    if (parsed.zone !== "red" && parsed.zone !== "yellow" && parsed.zone !== "green") return null;
    // The new fail-open input check requires the complete wire shape. Keep the
    // legacy classifier's optional-field defaults unchanged for its own switch.
    if (strictPayload && (
      !Array.isArray(parsed.triggers) || !parsed.triggers.every((trigger) => typeof trigger === "string") ||
      typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence)
    )) return null;
    const result: SafetyResult = {
      zone: parsed.zone,
      triggers: parsed.triggers ?? [],
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5,
      source: "llm",
      routingTemplateVersion: ROUTING_TEMPLATE_VERSION,
    };
    if (result.zone === "red") onRedResult?.(result);
    throwIfAborted(requestCancellationSignal(signal));
    return result;
  } catch {
    capturedSession?.assertCurrent();
    throwIfAborted(requestCancellationSignal(signal));
    return null; // the safety path must never throw
  }
}

export async function classifySafety(
  userMessage: string,
  locale: "en" | "ko",
  opts?: { userId?: string; capturedSession?: AuthenticatedAccountSessionLease; onRed?: CrisisObserver;
    assertCurrent?: () => void; signal?: AbortSignal; retainResult?: boolean },
): Promise<SafetyResult> {
  const fence = () => { opts?.assertCurrent?.(); opts?.capturedSession?.assertCurrent(); if (opts?.signal) throwIfAborted(opts.signal); };
  fence();
  // A completed live call owns its result even after the screen owner leaves.
  // Keep the request gate above and on the transport; only defer UI ownership.
  const resultFence = () => { if (opts?.retainResult && !opts.capturedSession) throwIfAborted(opts.signal); else fence(); };
  const liveOwner = opts?.assertCurrent ? observeLiveOwner(opts.assertCurrent, opts.signal) : undefined;
  const requestSignal = liveOwner?.signal ?? opts?.signal;
  try {
  const notifyRed = (result: SafetyResult): void => {
    if (result.zone !== "red" || !opts?.onRed) return;
    resultFence();
    try { opts.onRed(result.hotline); } catch { /* Continue the classifier's audit/result. */ }
  };
  // Layer 1: lexicon. Always runs synchronously. Dual-locale: catch a crisis
  // term written in the other language than the UI locale (mirrors the proxy
  // EN+KO gate + classifyInputAnyLocale) - the largest single-locale blind spot.
  let lex = lexiconToResult(userMessage, locale);
  if (lex.zone !== "red") {
    const lexOther = lexiconToResult(userMessage, locale === "ko" ? "en" : "ko");
    if (lexOther.zone === "red") lex = lexOther;
  }

  notifyRed(lex);
  if (lex.hotline) return lex; // Explicit emergencies never wait for a model classification.
  const client = getFlashClient();
  if (!client) {
    // D4 (flag-gated): try the server-side classifier before degrading to lexicon.
    const viaProxy = await classifyViaProxy(userMessage, locale, opts?.capturedSession, requestSignal);
    resultFence();
    if (viaProxy) {
      const result = mergeResults(lex, viaProxy);
      notifyRed(result);
      return result;
    }
    noteSemanticUnavailable({
      userId: opts?.userId,
      lexiconZone: lex.zone,
      capturedSession: opts?.capturedSession,
      assertCurrent: opts?.assertCurrent,
    });
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
        ...(opts?.capturedSession || requestSignal ? { abortSignal: opts?.capturedSession?.signal ?? beforeOwnerDispatch(requestSignal) } : {}),
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          required: ["zone", "triggers", "confidence"],
          properties: {
            zone: { type: "string", enum: ["red", "yellow", "green"] },
            triggers: { type: "array", items: { type: "string" } },
            confidence: { type: "number" },
          },
        },
      },
    });
    resultFence();
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
          source: "llm",
          routingTemplateVersion: ROUTING_TEMPLATE_VERSION,
        };
        result = mergeResults(lex, llm);
      } catch {
        if (typeof console !== "undefined") console.warn("[safety] classifier payload unparseable, using lexicon");
      }
    }
    notifyRed(result);
    // C3: a real Gemini Flash call happened. The classifier runs client-side (not
    // via the gemini-proxy), so the proxy never logs it — audit it here,
    // best-effort, when attributable to a user. On the public web build the Flash
    // client has no key (getFlashClient() === null) so we never reach this; this
    // closes the C3 gap on native/Vertex live builds.
    if (opts?.userId) {
      const row = {
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
      };
      try {
        await withLiveOwnerSignal(opts.capturedSession ? undefined : opts.assertCurrent, opts.capturedSession?.signal ?? opts.signal,
          signal => insertAiAuditLog(row, opts.capturedSession?.accessToken, signal));
        opts.capturedSession?.assertCurrent();
      } catch {
        // A completed direct classifier also owns C3 when its audit cannot start.
        if (opts.retainResult && !opts.capturedSession && !opts.signal?.aborted) {
          await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: opts.userId, payload: row, warnLabel: "[safety] classifier audit failed" });
        }
        if (typeof console !== "undefined") console.warn("[safety] classifier audit failed");
      }
    }
    return result;
  } catch {
    resultFence();
    if (typeof console !== "undefined") console.warn("[safety] llm classifier failed, using lexicon");
    return lex;
  }
  } finally { liveOwner?.release(); }
}

// Fixed-string crisis templates per docs/research/batches/crisis-detection.md.
// Hotline numbers come from crisisHotlines() (single source of truth) so KO
// routing stays current (109 since 2024) and minors get the youth line (1388).
// Versions are referenced in the audit log: red-ko-v3 (adult), red-ko-minor-v2
// (14-17), red-en-v2 (988, all ages). 2026-09-06 removes the app's metaphorical
// farewell; the fixed hand-off, resources and emergency-room guidance remain.
//
// PROVENANCE NOTE. On 2026-09-07 (commit a8910a10) the em dash in the hotline lines
// became a hyphen, in all three templates, because they share one interpolated
// hotline block. DESIGN.md forbids em dashes in user-facing strings and these are
// drawn in a pixel face where the glyph is a risk. The versions were deliberately
// NOT bumped: the version identifies the GUIDANCE, and the numbers, labels,
// structure and routing are unchanged, so a bump would make the audit log read as
// if users had been told something different. So note it here instead: the bytes
// of v3 / minor-v2 / en-v2 differ by exactly that one glyph before and after that
// commit, and reconstructing "what did red-ko-v3 say" needs this line to be exact.
export function fixedCrisisResponse(
  locale: "en" | "ko",
  minor = false, hotline?: import("../safety/lexicon").HotlineId,
): { text: string; version: string } {
  const emergency = emergencyGuidance(hotline, locale); if (emergency) return emergency;
  const hotlineBlock = crisisHotlines(locale, minor)
    .map((h) => (locale === "ko" ? `📞 ${h.number} - ${h.label} (24시간, 무료)` : `📞 ${h.number} - ${h.label}`))
    .join("\n");
  if (locale === "ko") {
    return {
      text: `지금 많이 힘드신 것 같아요. 혼자 견디지 마세요.

지금 바로 도움을 받을 수 있는 곳이 있어요:

${hotlineBlock}

전화가 어려우시면, 가까운 응급실로 가셔도 됩니다.`,
      version: minor ? "red-ko-minor-v2" : "red-ko-v3",
    };
  }
  return {
    text: `It sounds like a lot right now. You don't have to carry it alone.

People are available right now to talk:

${hotlineBlock}
🌐 findahelpline.com - international directory

If calling is hard, you can go to your nearest emergency room.`,
    version: "red-en-v2",
  };
}

// Re-exported from here so boundary.ts can name them on the import line it already
// has. The legal document (DPIA) cites boundary.ts by line number, and a new
// import line there would move every cited line.
export { classifierReportedCategories, recordableCrisisCategories } from "../safety/crisis-event-categories";
export { replySwapCategories } from "../safety/model-reply-scan";
export { emergencyGuidance, emergencyRoute, parseEmergencyLane } from "../safety/emergency-routing";
