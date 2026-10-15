import { randomUUID } from "expo-crypto";
import { captureAccountOwnerLease, type AccountOwnerLease } from "../auth/account-epoch";
import { classifyInputAnyLocale } from "../safety/classifier";
import type { HotlineId } from "../safety/lexicon";
import type { SendMessageInput, SendMessageResult } from "./conversation";
import { retryableMessage } from "./retry-failed";
import type { createChatSessionRegistry } from "./session-registry";
import type { ChatRetirementReason, ChatSessionToken, ChatWorkToken, SessionTurn } from "./session-types";
import type {
  ChatCompletionEvent, ChatControllerSnapshot, ChatOperationSupervisor, ChatSendAcceptance,
  ChatSendAdmission, ChatSendCommand, ChatSendOperation, ChatSessionDeps,
} from "./session-deps";
import { parseSourceCitations } from "./sources";
import { parseTwiBranches } from "./twi-branches";

type Registry = ReturnType<typeof createChatSessionRegistry>;
interface Running {
  session: ChatSessionToken; owner: AccountOwnerLease; work: ChatWorkToken | null;
  meta: ChatSendOperation; admission: ChatSendAdmission; input: SendMessageInput;
  supervisor: ChatOperationSupervisor | null; retired: ChatRetirementReason | null;
  supervisorPhase: "unstarted" | "creating" | "ready" | "retiring" | "retired";
  persona: SessionTurn["persona"]; acknowledged: boolean; releaseThinking: (() => void) | null; answered: boolean;
}
interface State { session: ChatSessionToken; snapshot: ChatControllerSnapshot }
const refused = (reason: Extract<ChatSendAcceptance, { accepted: false }>["reason"]): ChatSendAcceptance => ({ accepted: false, reason });

/** Dormant, memory-only factory. No engine adapter, singleton or screen consumer.
 * Registry owns bodies. Private running closures last only until their I/O settles.
 * The injected supervisor, not this controller, owns mutation drain/unknown proof. */
export function createChatSessionController(registry: Registry, deps: ChatSessionDeps, newId = randomUUID) {
  let state: State | null = null;
  let stopped = false;
  let admitting = false;
  let handoffFailed = false;
  const running = new Set<Running>();
  const listeners = new Set<() => void>();
  const completions = new Set<(event: ChatCompletionEvent) => void>();

  function notify() {
    for (const listener of [...listeners]) { try { listener(); } catch { /* Observer effects never retry an answer. */ } }
  }
  function current(op: Running): boolean {
    return !stopped && !op.retired && op.owner.isCurrent() && registry.isCurrent(op.session)
      && op.work !== null && registry.getSessionSnapshot(op.session)?.work.includes(op.work) === true;
  }
  function releaseThinking(op: Running) {
    const release = op.releaseThinking; op.releaseThinking = null;
    try { release?.(); } catch { /* No request retry for an effect failure. */ }
  }
  function forgetInvalidState() {
    if (state && !registry.isCurrent(state.session)) { state = null; notify(); }
  }
  const unsubscribe = registry.subscribe(forgetInvalidState);
  function failedHandoff(op: Running): false {
    op.acknowledged = false; handoffFailed = true;
    return false;
  }
  function handoff(op: Running): boolean {
    // A reentrant caller needs an ACK now; a constructor/retire still on the
    // stack has not supplied it. A later true cannot undo that negative ACK.
    if (op.supervisorPhase === "creating" || op.supervisorPhase === "retiring") return failedHandoff(op);
    if (op.supervisorPhase === "ready") {
      op.supervisorPhase = "retiring";
      try { if (!op.supervisor!.retire(op.retired!)) failedHandoff(op); }
      catch { failedHandoff(op); }
      finally { op.supervisorPhase = "retired"; }
    }
    return op.acknowledged;
  }
  function retire(op: Running, reason: ChatRetirementReason): boolean {
    op.retired ??= reason; // Close all body/effect gates before calling external code.
    handoff(op);
    releaseThinking(op);
    forgetInvalidState();
    return op.acknowledged;
  }
  function update(op: Running, patch: Partial<ChatSendOperation> = {}, facts: Partial<ChatControllerSnapshot> = {}): boolean {
    if (!current(op) || state?.session.sessionId !== op.session.sessionId) return false;
    op.meta = Object.freeze({ ...op.meta, ...patch });
    const old = state.snapshot;
    state.snapshot = Object.freeze({ ...old, ...facts, revision: old.revision + 1,
      send: op.meta.kind === "send" ? op.meta : old.send,
      safety: Object.freeze(op.meta.kind === "safety"
        ? [...old.safety.filter(item => item.id !== op.meta.id), op.meta] : [...old.safety]),
    });
    notify();
    return current(op);
  }
  function replaceReply(op: Running, patch: Omit<SessionTurn, "id" | "exchangeId" | "sequence">): boolean {
    if (!current(op)) return false;
    const snapshot = registry.getSessionSnapshot(op.session)!;
    const slot = snapshot.turns.find(turn => turn.id === op.meta.responseTurnId && turn.exchangeId === op.meta.exchangeId);
    if (!slot) return false;
    return registry.replaceTurns(op.session, snapshot.turns.map(turn => turn === slot
      ? { ...patch, id: slot.id, exchangeId: slot.exchangeId, sequence: slot.sequence } : turn)) && current(op);
  }
  function emitRed(op: Running, hotline: HotlineId | undefined) {
    if (!current(op) || op.meta.redNoticeEmitted) return;
    // Set before publication: a notice observer may synchronously reenter.
    op.meta = Object.freeze({ ...op.meta, redNoticeEmitted: true });
    const fallback = op.admission.locale === "ko" ? (op.admission.minor !== false ? "KR_1388" : "KR_109") : "GLOBAL_988";
    try { deps.publishCrisisNotice(op.owner, hotline ?? fallback); } catch { /* The notice store may have already published. */ }
    if (!current(op)) return;
    const snapshot = registry.getSessionSnapshot(op.session)!;
    if (!registry.replaceTurns(op.session, snapshot.turns.map(turn => turn.exchangeId === op.meta.exchangeId
      ? { ...turn, safetyZone: "red", ...(turn.id === op.meta.responseTurnId ? { crisisNotice: true as const } : {}) } : turn))) return;
    update(op);
  }
  function complete(op: Running) {
    if (!current(op) || !op.meta.outcome) return;
    const event: ChatCompletionEvent = Object.freeze({ session: op.session, operation: op.meta });
    for (const listener of [...completions]) {
      if (!current(op)) break;
      try { listener(event); } catch { /* Keep/autosave/UI observers cannot resend the model request. */ }
    }
  }
  function acceptResult(op: Running, result: SendMessageResult) {
    if (!current(op)) return;
    op.answered = true;
    const usage = op.meta.kind === "safety" || result.used === null ? state!.snapshot.usage : Object.freeze({ used: result.used,
      limit: result.limit, remaining: result.status === "ok" ? result.remaining : null });
    // Mark answered BEFORE any formatter, notification or presentation callback.
    if (!update(op, { stage: "answered", retry: "none" }, {
      usage, ...(op.meta.kind === "send" ? { limitRefused: result.status === "blocked", upgradeTo: result.status === "blocked" ? result.upgradeTo : null } : {}),
    })) return;
    if (op.meta.kind === "safety" && (result.status !== "ok" || result.reply.safety.zone !== "red"
      || result.used !== null || result.limit !== null || result.remaining !== null)) throw new Error("chat_local_red_contract");
    if (result.status === "blocked") {
      if (op.meta.redNoticeEmitted) throw new Error("chat_red_result_required");
      if (!replaceReply(op, { role: "secondb", persona: op.persona, text: result.hint, synthetic: true })) return;
      update(op, { outcome: "blocked" });
    } else if (result.reply.safety.zone === "red") {
      emitRed(op, result.reply.safety.crisisRouting?.hotline);
      // Fixed guidance remains non-synthetic for the existing opt-in autosave policy.
      if (!replaceReply(op, { role: "secondb", persona: op.persona,
        text: result.reply.text, safetyZone: "red", crisisNotice: true })) return;
      update(op, { outcome: "red" });
    } else {
      if (op.meta.redNoticeEmitted) throw new Error("chat_red_result_required");
      const parsed = parseSourceCitations(result.reply.text);
      const twi = op.input.mode === "divergent" ? parseTwiBranches(parsed.display) : { display: parsed.display, branches: [] };
      if (!replaceReply(op, { role: "secondb", persona: op.persona,
        text: twi.display, chips: parsed.chips, branches: twi.branches, safetyZone: result.reply.safety.zone,
        citationText: op.input.mode === "divergent" ? parseTwiBranches(result.reply.text).display : result.reply.text })) return;
      update(op, { outcome: "reply" });
    }
    complete(op);
  }
  function fail(op: Running, error: unknown) {
    if (!current(op)) return;
    // A confirmed RED never turns into an error bubble or an ordinary retry.
    if (op.meta.redNoticeEmitted) { update(op, { outcome: "red", retry: "none" }); return; }
    let consent: ReturnType<ChatSessionDeps["consentError"]> = null;
    let classified = true;
    try { consent = deps.consentError(error); } catch { classified = false; }
    if (!current(op)) return;
    const retry = !op.answered && classified && !consent;
    const text = op.answered ? op.admission.errors.presentation : consent ? op.admission.errors[consent] : op.admission.errors.request;
    if (!replaceReply(op, { role: "secondb", text, synthetic: true,
      ...(consent ? { consentError: consent } : {}), ...(retry ? { retryText: op.input.message } : {}),
    })) return;
    update(op, { outcome: op.answered ? "presentation-error" : "request-error", retry: retry ? "legacy-explicit" : "none" });
  }
  async function run(op: Running) {
    try {
      if (!current(op)) return;
      const release = deps.holdThinking(); op.releaseThinking = release;
      if (!current(op)) { releaseThinking(op); return; }
      op.supervisorPhase = "creating";
      try { op.supervisor = deps.beginOperation(op.owner, op.session, op.meta.id); }
      finally { op.supervisorPhase = op.supervisor ? "ready" : "unstarted"; }
      const supervisor = op.supervisor;
      if (!current(op)) { retire(op, op.retired ?? "disposed"); return; }
      const lease = supervisor.lease;
      lease.assertCurrent();
      if (lease.userId !== op.owner.ownerId || lease.epoch !== op.owner.epoch) throw new Error("chat_session_mismatch");
      const session = await lease.authenticate();
      if (!current(op)) return;
      session.assertCurrent();
      if (session.userId !== op.owner.ownerId || session.epoch !== op.owner.epoch || session.signal !== lease.signal) throw new Error("chat_session_mismatch");
      if (!update(op, { stage: "requesting" })) return;
      const input = { ...op.input, session, signal: session.signal, onCrisisDetected: (hotline: HotlineId | undefined) => emitRed(op, hotline) };
      session.assertCurrent();
      if (!current(op)) return;
      const result = await (op.meta.kind === "safety" ? supervisor.auditLocalRed(input) : supervisor.send(input));
      op.answered = true; // Even a later capability assertion must not make this request retryable.
      if (!current(op)) return;
      session.assertCurrent();
      acceptResult(op, result);
    } catch (error) { fail(op, error); }
    finally {
      releaseThinking(op);
      // release is not a rollback/settlement receipt. The supervisor retains unknown tickets.
      try { op.supervisor?.release(); } catch { /* Private cleanup cannot trigger another request. */ }
      if (current(op)) update(op, { stage: "settled" });
      running.delete(op);
      // Keep a failed handoff registered so a later wipe still observes its negative ACK.
      if (op.work && op.acknowledged) registry.settleWork(op.work);
      if (state?.session.sessionId === op.session.sessionId && op.meta.kind === "safety" && registry.isCurrent(op.session)) {
        state.snapshot = Object.freeze({ ...state.snapshot, revision: state.snapshot.revision + 1,
          safety: Object.freeze(state.snapshot.safety.filter(item => item.id !== op.meta.id)),
        }); notify();
      }
    }
  }

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeCompletion(listener: (event: ChatCompletionEvent) => void) { completions.add(listener); return () => { completions.delete(listener); }; },
    getSnapshot(session: ChatSessionToken): ChatControllerSnapshot | null {
      return !stopped && registry.isCurrent(session) && state?.session.sessionId === session.sessionId ? state.snapshot : null;
    },
    send(command: ChatSendCommand): ChatSendAcceptance {
      if (stopped || !registry.isCurrent(command.session)) return refused("stale");
      if (admitting) return refused("busy");
      admitting = true;
      let op: Running | null = null;
      let launched = false;
      try {
        const owner = captureAccountOwnerLease(command.session.ownerId);
        if (!owner || owner.epoch !== command.session.ownerEpoch) return refused("stale");
        const snapshot = registry.getSessionSnapshot(command.session)!;
        const admission = deps.readAdmission(snapshot);
        if (!owner.isCurrent() || !registry.isCurrent(command.session)) return refused("stale");
        const text = command.text.trim();
        if (!text) return refused("empty");
        const local = classifyInputAnyLocale(text, admission.locale, { minor: admission.minor !== false });
        const safety = local.zone === "red";
        const draft = registry.getDraftSnapshot(command.session);
        if (!draft || draft.revision !== command.expectedDraftRevision || (!command.retryExchangeId && draft.text.trim() !== text)) return refused("draft-changed");
        if (!admission.ready || (!safety && (!admission.ordinaryAllowed || admission.recovery !== "legacy"))) return refused("unavailable");
        let prior: readonly SessionTurn[] = snapshot.turns;
        let prompt: SessionTurn; let response: SessionTurn;
        if (command.retryExchangeId) {
          const last = prior.at(-1); const asked = prior.at(-2);
          if (safety || !last || !asked || last.exchangeId !== command.retryExchangeId || asked.exchangeId !== last.exchangeId
            || retryableMessage(prior, prior.length - 1) !== text) return refused("retry-unavailable");
          prompt = asked; response = { id: last.id, exchangeId: last.exchangeId, sequence: last.sequence, role: "secondb", text: "", synthetic: true };
          prior = prior.slice(0, -2);
        } else {
          const exchangeId = newId(); const sequence = (prior.at(-1)?.sequence ?? -1) + 1;
          prompt = { id: newId(), exchangeId, sequence, role: "user", text, ...(safety ? { safetyZone: "red" as const } : {}) };
          response = { id: newId(), exchangeId, sequence: sequence + 1, role: "secondb", text: "", synthetic: true };
        }
        const meta: ChatSendOperation = Object.freeze({ id: newId(), exchangeId: prompt.exchangeId, promptTurnId: prompt.id,
          responseTurnId: response.id, kind: safety ? "safety" : "send", stage: "preparing", retry: "none", redNoticeEmitted: false });
        // Copy primitive admission facts and history; neither observes later UI edits.
        const captured = Object.freeze({ ...admission, errors: Object.freeze({ ...admission.errors }) });
        const session: ChatSessionToken = Object.freeze({ ownerId: snapshot.ownerId, ownerEpoch: snapshot.ownerEpoch,
          contentGeneration: snapshot.contentGeneration, sessionId: snapshot.sessionId, sessionGeneration: snapshot.sessionGeneration });
        op = { session, owner, work: null, meta, admission: captured, supervisor: null, supervisorPhase: "unstarted", retired: null,
          persona: snapshot.persona, acknowledged: true, releaseThinking: null, answered: false,
          input: { userId: owner.ownerId, message: text, locale: captured.locale, tier: captured.tier,
            displayName: captured.displayName, personaHint: captured.personaHint, mode: snapshot.mode, minor: captured.minor !== false,
            history: safety ? [] : prior.filter(turn => !turn.synthetic && turn.safetyZone !== "red")
              .map(turn => ({ role: turn.role === "user" ? "user" : "assistant", text: turn.text })),
          },
        };
        const pending = op;
        const work = registry.claimWork(session, meta.kind, safety ? `draft:${command.expectedDraftRevision}` : meta.id, reason => retire(pending, reason));
        op.work = work;
        if (!work || !current(op)) return refused(registry.isCurrent(session) ? "busy" : "stale");
        running.add(op);
        // Work publication may synchronously mutate turns through another observer.
        if (registry.getSessionSnapshot(session)?.turns !== snapshot.turns) return refused("stale");
        if (!state || state.session.sessionId !== session.sessionId) state = { session, snapshot: Object.freeze({ sessionId: session.sessionId,
          revision: 0, send: null, safety: Object.freeze([]), usage: null, limitRefused: false, upgradeTo: null }) };
        // Reserve both sequence slots now so a concurrent safety pair cannot strand a late reply.
        if (!registry.replaceTurns(session, [...prior, prompt, response]) || !current(op)) return refused("stale");
        if (!command.retryExchangeId) registry.editDraft(session, "", command.expectedDraftRevision);
        if (!current(op) || !update(op)) return refused("stale");
        if (safety) emitRed(op, local.crisisRouting?.hotline);
        if (!current(op)) return refused("stale");
        launched = true;
        void Promise.resolve().then(() => run(pending));
        return { accepted: true, operationId: meta.id, exchangeId: meta.exchangeId };
      } catch { return refused("unavailable"); }
      finally {
        admitting = false;
        if (op && !launched) {
          retire(op, "disposed");
          running.delete(op);
          if (op.work && op.acknowledged) registry.settleWork(op.work);
        }
      }
    },
    /** Owner shutdown, never route detach. A false handoff stays registered for wipe ACK. */
    dispose(): boolean {
      if (!stopped) { stopped = true; unsubscribe(); state = null; }
      let acknowledged = !handoffFailed;
      for (const op of running) {
        if (!retire(op, "disposed")) acknowledged = false;
        else if (op.work) registry.settleWork(op.work);
      }
      listeners.clear(); completions.clear(); return acknowledged && !handoffFailed;
    },
  };
}
