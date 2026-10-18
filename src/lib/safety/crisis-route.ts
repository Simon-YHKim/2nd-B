// The shared crisis route: from "is this RED?" to the guidance a person sees.
//
// Simon 2026-10-18 12:00 (Q-261018-48 가): this path lives in a file that reads no configuration.
// Simon 2026-10-18 21:18 (Q-261018-57 가): the claim is exactly two things, no setting-reaching
// import and a crisis result returned at once; record saves show the guidance first as well, and
// callLlm's failover order stays as it was.
// boundary.ts re-exports the entry points (callers are unchanged) and hands in the two ledger
// writers, because the audit transport reaches the Supabase client and its settings. A crisis
// result is decided and returned without waiting for either ledger; the two writes follow it in
// their old order (routeCrisis). callLlm opens one gate per call (openPromptCrisisGate): its input
// judgment, hash, observer and fence are made here, and the proxy 422 and meaning-check RED answers
// of the same call go through that gate.
// __tests__/crisis-route-config-free.test.ts walks this file's import closure (the guarantee) and
// checks that every entry point returns the guidance while the ledgers never settle.

import { throwIfAborted } from "../async/abort";
import type { AuthenticatedAccountSessionLease } from "../auth/account-session-lease";
import type { AuditMeta, CrisisObserver, LlmResult } from "../llm/types";
import { classifyInputAnyLocale, crisisHotlines, type SafetyResult } from "./classifier";
import { emergencyGuidance, emergencyRoute, parseEmergencyLane, type EmergencyLane } from "./emergency-routing";

/** The categorical crisis_events row (same fields as supabase/crisis-events CrisisEventInsert, which
 *  this file may not import: only the boundary reaches that module). */
export interface CrisisEventFields {
  classifierConfidence: number;
  triggerCategories: string[];
  routingTemplateVersion: string;
  locale: "en" | "ko";
}

/** The two ledgers every crisis routing writes: ai_audit_log (C3) and the restricted crisis_events.
 *  routeCrisis hands both writes on and returns without waiting for them. */
export interface CrisisLedger {
  writeAiAuditLog(userId: string, audit: AuditMeta, warnLabel: string, session?: AuthenticatedAccountSessionLease): Promise<void>;
  writeCrisisEvent(userId: string, payload: CrisisEventFields, warnLabel: string, session?: AuthenticatedAccountSessionLease): Promise<void>;
}

// Optional UI guidance runs once, after the same ownership/cancellation fence
// as the result. Only routing metadata crosses this callback; UI exceptions
// cannot skip the audit path or change the standard result.
export function crisisObserver(observer: CrisisObserver | undefined, fence: () => void): CrisisObserver | undefined {
  if (!observer) return undefined;
  let notified = false;
  return (hotline) => {
    fence();
    if (notified) return;
    notified = true;
    try { observer(hotline); } catch { /* The audited result still follows. */ }
  };
}

// Same hash as boundary.ts and llm/safety.ts (each keeps its own copy): audit hashes are for
// traceability, not security.
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

// A ledger write that rejects is reported with its label, as the outbox does for a failed delivery.
// It never reaches the result: the guidance has already been returned.
function warnLedger(label: string): void {
  if (typeof console !== "undefined") console.warn(label);
}

export type ProxyCrisisDecision = {
  route: boolean;
  confirmedMarker: boolean; lane?: EmergencyLane | null;
};

// C9 fallback (2026-06-10 audit follow-up): gemini-proxy is the second,
// server-authoritative crisis gate. When a crisis phrasing slips past the
// client lexicon but the proxy's hasCrisisTerm catches it, functions.invoke
// rejects with a FunctionsHttpError (status 422). Treat unreadable 422 bodies
// as a UX fail-safe (show the fixed hotline template) but only write the
// restricted crisis_events row when the proxy marker is explicit.
export async function inspectProxyCrisisRejection(error: unknown): Promise<ProxyCrisisDecision> {
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
    const body = (await target.json()) as { error?: unknown; crisis_lane?: unknown } | null;
    if (body?.error === "safety_red_zone") return { route: true, confirmedMarker: true, lane: parseEmergencyLane(body.crisis_lane) };
    return noRoute;
  } catch {
    return { route: true, confirmedMarker: false };
  }
}

// RED SafetyResult for a proxy-detected crisis. The client classifier
// returned green/yellow, so there is no matched-term list — the proxy body
// intentionally never echoes the matched term (no oracle).
function proxyCrisisSafetyResult(locale: "en" | "ko", minor = false, lane?: unknown): SafetyResult {
  const h = crisisHotlines(locale, minor)[0];
  return {
    zone: "red",
    matched: [],
    categories: ["crisis"],
    crisisRouting: emergencyRoute(lane) ?? { hotline: h.id, label: h.label, number: h.number },
  };
}

export interface InterviewCrisisRoutingInput {
  text: string;
  locale: "en" | "ko";
  userId: string;
  minor?: boolean;
}

/** What callLlm hands its crisis gate: the prompt, the caller's observer and identity. */
export interface PromptCrisisInput {
  user: string;
  system?: string;
  locale: "en" | "ko";
  minor?: boolean;
  userId: string;
  purpose?: string;
  session?: AuthenticatedAccountSessionLease;
  onCrisisDetected?: CrisisObserver;
}

export interface InterviewCrisisRoutingRun {
  started: boolean;
  done: Promise<LlmResult<string> | null>;
}

/** Binds the crisis route to the ledgers. The returned object is frozen: nothing can swap a router. */
export function createCrisisRouting(ledger: CrisisLedger) {
  const { writeAiAuditLog, writeCrisisEvent } = ledger;
  // C9 fallback for record saves that do NOT pass through callAdvisor/callLlm
  // at all (free-tier journal, advisor toggle off, plain notes — persona sim
  // P1-1): classify locally (zero LLM cost) and, on red, run the SAME audited
  // crisis routing as every LLM surface (ai_audit_log + crisis_events + the
  // fixed hotline text). Returns null when the text is not red.
  async function classifyRecordTextForCrisis(
    text: string,
    locale: "en" | "ko",
    userId: string,
    minor = false,
    session?: AuthenticatedAccountSessionLease,
  ): Promise<LlmResult<string> | null> {
    session?.assertCurrent();
    // Dual-locale, same as the chat input path (callLlm): catch a crisis term
    // written in a language other than the UI locale (a ko-UI user typing English
    // self-harm text, or vice versa). The note-save path previously used the
    // single-locale classifier, so cross-locale crisis captures were missed here
    // while the chat path caught them (persona-validate: crisis-lexicon parity).
    const safety = classifyInputAnyLocale(text, locale, { minor });
    if (safety.zone !== "red") return null;
    return routeCrisis(safety, locale, userId, djb2(text), minor, "record_save_red", { session });
  }

  // Interview answers are classified by the screen before any non-answer or
  // coverage logic. RED still needs the same C3/DPIA ledgers as an LLM boundary
  // interception, with an honest interview source and purpose. GREEN returns
  // null and therefore performs no write and no model call.
  async function classifyInterviewTextForCrisis(
    text: string,
    locale: "en" | "ko",
    userId: string,
    minor = false,
  ): Promise<LlmResult<string> | null> {
    const safety = classifyInputAnyLocale(text, locale, { minor });
    if (safety.zone !== "red") return null;
    return routeCrisis(safety, locale, userId, djb2(text), minor, "interview_input_red", {
      purpose: "interview_probe",
    });
  }

  // The screen owns the synchronous classifier and calls this only for RED.
  // Guard + visibility happen synchronously before either ledger can wait on the
  // network. The returned promise settles with the result (it no longer waits
  // for the ledgers) and stays observable for a rejected routing.
  function startInterviewCrisisRouting(
    guard: { current: boolean },
    input: InterviewCrisisRoutingInput,
    onVisible: () => void,
    onSettled: () => void,
  ): InterviewCrisisRoutingRun {
    if (guard.current) return { started: false, done: Promise.resolve(null) };
    guard.current = true;
    onVisible();
    const done = classifyInterviewTextForCrisis(
      input.text,
      input.locale,
      input.userId,
      input.minor,
    ).finally(() => {
      guard.current = false;
      onSettled();
    });
    return { started: true, done };
  }

  async function routeCrisis(
    result: SafetyResult,
    locale: "en" | "ko",
    userId: string,
    promptHash: string,
    minor = false,
    sourceTag = "input_red",
    opts: {
      recordCrisisEvent?: boolean;
      purpose?: string;
      session?: AuthenticatedAccountSessionLease;
      classifierConfidence?: number;
    } = {},
  ): Promise<LlmResult<string>> {
    if (opts.session?.userId !== undefined && opts.session.userId !== userId) {
      throw new Error("llm_session_owner_mismatch");
    }
    opts.session?.assertCurrent();
    // Same hotline set as the Advisor path (single source of truth):
    // KO adult -> 109, KO minor -> 1388 + 109, EN -> 988.
    const numbers = crisisHotlines(locale, minor).map((hl) => hl.number);
    const joined = locale === "ko" ? numbers.join(" 또는 ") : numbers.join(" or ");
    const text = emergencyGuidance(result.crisisRouting?.hotline, locale)?.text ?? (
      locale === "ko"
        ? `지금 많이 힘드신 것 같아요. 혼자 견디지 마시고 ${joined}로 연락해 주세요. 전문가가 24시간 함께합니다.`
        : `It sounds like you're going through a lot right now. Please reach out to ${joined} - trained responders are available 24/7.`);
    const audit = {
      promptHash,
      outputHash: djb2(text),
      modelUsed: "none-crisis-routed",
      vertexBackend: false,
      safetyZone: "red" as const,
      latencyMs: 0,
      // 0095: attribute the intercepted call's purpose when the caller had one
      // (callLlm paths); record-save scans have no PromptPurpose — NULL row.
      ...(opts.purpose ? { purpose: opts.purpose } : {}),
    };
    // C3: crisis routing MUST be audited. The whole point of audit_log is an
    // audit trail proving the safety classifier intercepted dangerous input.
    // Separate restricted ledger (crisis_events), parity with callAdvisor's input-RED
    // path. Without this every callLlm surface (chat/journal/interview/persona/
    // import/clipper/phase1) intercepted a crisis but left NO categorical trace in the
    // restricted log. Map the classifier fields conservatively (RED confidence
    // 0.95 like lexiconToResult unless a semantic input supplied its measured value;
    // no C-SSRS level;
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
    const event: CrisisEventFields | null = opts.recordCrisisEvent === false ? null : {
      classifierConfidence: opts.classifierConfidence ?? 0.95,
      triggerCategories: [...lexCategories, sourceTag],
      routingTemplateVersion: emergencyGuidance(result.crisisRouting?.hotline, locale)?.version ?? "routecrisis-inline-v1",
      locale,
    };
    const session = opts.session;
    // Guidance first (Q-261018-57 가): the result is fixed above and returned now, without waiting
    // for either ledger. The audit row is handed on first and the restricted row after it settles,
    // the order they always ran in; a rejected audit write no longer drops the restricted row. A
    // write that never settles holds only the writes behind it, never the guidance.
    void writeAiAuditLog(userId, audit, "[ai_audit_log] crisis insert failed", session)
      .catch(() => warnLedger("[ai_audit_log] crisis insert failed"))
      .then(() => (event ? writeCrisisEvent(userId, event, "[crisis_events] crisis insert failed", session) : undefined))
      .catch(() => warnLedger("[crisis_events] crisis insert failed"));
    return { text, safety: result, audit };
  }

  // Chat turns are classified by the conversation engine before it reads any
  // context or counts the turn (Simon 2026-10-14, Q-261014-30). RED gets the same
  // ledgers and fixed guidance as callLlm's own short-circuit (same source tag,
  // same purpose). GREEN returns null: no write, no model call.
  async function classifyChatTextForCrisis(
    text: string,
    locale: "en" | "ko",
    userId: string,
    minor?: boolean,
    options?: {
      session: AuthenticatedAccountSessionLease;
      signal?: AbortSignal;
      onCrisisDetected?: CrisisObserver;
    },
  ): Promise<LlmResult<string> | null> {
    if (options && options.session.userId !== userId) throw new Error("llm_session_owner_mismatch");
    if (options?.signal && options.signal !== options.session.signal) throw new Error("llm_session_signal_mismatch");
    const fence = (): void => {
      throwIfAborted(options?.session.signal);
      options?.session.assertCurrent();
    };
    fence();
    const safety = classifyInputAnyLocale(text, locale, { minor });
    if (safety.zone !== "red") return null;
    const notifyCrisis = crisisObserver(options?.onCrisisDetected, fence);
    notifyCrisis?.(safety.crisisRouting?.hotline);
    // An observer can synchronously change owner or cancel without throwing.
    fence();
    const reply = await routeCrisis(safety, locale, userId, djb2(text), minor, "input_red", {
      purpose: "secondb_chat", session: options?.session,
    });
    fence();
    return reply;
  }

  // A proxy rejected the call. If it is the server crisis gate (422), answer with the same guidance
  // as a client-side RED: the fixed template for the lane the server named, both ledgers (the
  // restricted one only for an explicit marker). Anything else returns null and the caller goes on.
  async function routeProxyRejection(
    error: unknown,
    call: {
      locale: "en" | "ko";
      minor?: boolean;
      userId: string;
      promptHash: string;
      purpose?: string;
      session?: AuthenticatedAccountSessionLease;
      notifyCrisis?: CrisisObserver;
      fence: () => void;
    },
  ): Promise<LlmResult<string> | null> {
    const proxyCrisis = await inspectProxyCrisisRejection(error);
    call.fence();
    if (!proxyCrisis.route) return null;
    call.notifyCrisis?.(proxyCrisisSafetyResult(call.locale, call.minor, proxyCrisis.lane).crisisRouting?.hotline);
    return routeCrisis(
      proxyCrisisSafetyResult(call.locale, call.minor, proxyCrisis.lane),
      call.locale,
      call.userId,
      call.promptHash,
      call.minor,
      proxyCrisis.confirmedMarker ? "proxy_input_red" : "proxy_input_red_unconfirmed",
      {
        recordCrisisEvent: proxyCrisis.confirmedMarker,
        purpose: call.purpose,
        session: call.session,
      },
    );
  }

  // callLlm's own input gate (C9), opened before anything else of the call is read. The fence and
  // the observer are built here from the caller's own signal, session and callback; the prompt is
  // classified in both locales (a crisis term in the other language still counts) and hashed; a
  // RED prompt starts its routing at once. Classification is synchronous, so a green prompt goes on
  // without an extra await. The later crisis answers of the same call use the same gate.
  function openPromptCrisisGate(input: PromptCrisisInput, signal: AbortSignal | undefined) {
    // Each field is read once, here. The later answers of the same call use these copies, so a
    // change to the caller's object after the gate opened does not reach them.
    const { user, system, locale, minor, userId, purpose, session, onCrisisDetected } = input;
    const fence = (): void => {
      throwIfAborted(signal);
      session?.assertCurrent();
    };
    const notifyCrisis = crisisObserver(onCrisisDetected, fence);
    const inputSafety = classifyInputAnyLocale(user, locale, { minor });
    const promptHash = djb2(`${system ?? ""}${user}`);
    const routeInputRed = (): Promise<LlmResult<string>> => {
      notifyCrisis?.(inputSafety.crisisRouting?.hotline);
      return routeCrisis(inputSafety, locale, userId, promptHash, minor, "input_red", {
        purpose,
        session,
      });
    };
    return Object.freeze({
      safety: inputSafety,
      promptHash,
      notifyCrisis,
      routed: inputSafety.zone === "red" ? routeInputRed() : null,
      // A proxy rejected the call: the server crisis gate's 422 becomes the same guidance.
      routeProxyRejection: (error: unknown): Promise<LlmResult<string> | null> => routeProxyRejection(error, {
        locale,
        minor,
        userId,
        promptHash,
        purpose,
        session,
        notifyCrisis,
        fence,
      }),
      // The meaning check read the prompt as RED (no matched term: the classifier answers with meaning).
      routeSemanticRed: (classifierConfidence: number): Promise<LlmResult<string>> => {
        notifyCrisis?.(undefined);
        return routeCrisis(
          { zone: "red", matched: [], categories: ["crisis"] },
          locale,
          userId,
          promptHash,
          minor,
          "input_semantic_red",
          { purpose, session, classifierConfidence },
        );
      },
    });
  }

  return Object.freeze({
    openPromptCrisisGate,
    classifyRecordTextForCrisis,
    classifyInterviewTextForCrisis,
    startInterviewCrisisRouting,
    classifyChatTextForCrisis,
  });
}
