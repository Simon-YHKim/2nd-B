import { abortError } from "../async/abort";
import { subscribeAccountTransition, type AccountOwnerLease } from "../auth/account-epoch";
import { beginAccountSessionLease, type AuthenticatedAccountSessionLease, type PendingAccountSessionLease } from "../auth/account-session-lease";
import type { createContentWipeLedger, ContentMutationTicket } from "../account/content-wipe";
import { auditChatLocalRed, sendChatMessage } from "./conversation";
import type { CapturedChatInput, ChatOperationSupervisor, ChatSessionDeps } from "./session-deps";
import type { createChatSessionRegistry } from "./session-registry";
import type { ChatRetirementReason } from "./session-types";
import type { CapturedChatUsageExecution } from "./usage";

type Registry = ReturnType<typeof createChatSessionRegistry>;
type Ledger = ReturnType<typeof createContentWipeLedger>;
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value);
const validGeneration = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Dormant B adapter. No singleton, UI wiring, disk state or transport at construction.
 * A body capability can close while an already-issued quota receipt is still pending.
 * The shared ledger, not this supervisor or its ACK, decides whether deletion can run. */
export function createChatOperationFactory(registry: Registry, ledger: Ledger): ChatSessionDeps["beginOperation"] {
  const isSessionCurrent = registry.isCurrent.bind(registry);
  const subscribeSession = registry.subscribe.bind(registry);
  const read = ledger.read.bind(ledger);
  const acquire = ledger.acquireMutation.bind(ledger);
  const issue = ledger.issueMutation.bind(ledger);
  const settle = ledger.settleMutation.bind(ledger);

  return (sourceOwner, sourceSession, operationId): ChatOperationSupervisor => {
    const owner: AccountOwnerLease = Object.freeze({ ownerId: sourceOwner.ownerId, epoch: sourceOwner.epoch,
      isCurrent: sourceOwner.isCurrent.bind(sourceOwner) });
    // Retain identifiers only; a session snapshot also carries the conversation body.
    const token = Object.freeze({ ownerId: sourceSession.ownerId, ownerEpoch: sourceSession.ownerEpoch,
      contentGeneration: sourceSession.contentGeneration, sessionId: sourceSession.sessionId,
      sessionGeneration: sourceSession.sessionGeneration });
    const contentCurrent = () => { const state = read(owner); return state.phase === "open" && state.generation === token.contentGeneration; };
    const originalCurrent = () => owner.isCurrent() && isSessionCurrent(token) && contentCurrent();
    if (!validId(owner.ownerId) || !validId(token.sessionId) || !validId(operationId)
      || !validGeneration(owner.epoch) || !validGeneration(token.contentGeneration) || !validGeneration(token.sessionGeneration)
      || token.ownerId !== owner.ownerId || token.ownerEpoch !== owner.epoch || !originalCurrent()) throw abortError();

    const raw = beginAccountSessionLease(owner.ownerId);
    let closed = false, releaseRequested = false, released = false, started = false;
    let issuedPending = false;
    let usageTicket: ContentMutationTicket | null = null;
    let authenticated: AuthenticatedAccountSessionLease | null = null;
    let authentication: Promise<AuthenticatedAccountSessionLease> | null = null;
    let stopAccount: (() => void) | null = null, stopSession: (() => void) | null = null;

    const finishRelease = () => {
      if (!releaseRequested || released || issuedPending) return;
      released = true;
      stopAccount?.(); stopAccount = null;
      stopSession?.(); stopSession = null;
      raw.release();
    };
    const assertCurrent = () => {
      if (closed || released || !originalCurrent()) throw abortError();
      raw.assertCurrent();
      if (raw.userId !== owner.ownerId || raw.epoch !== owner.epoch) throw abortError();
    };
    const retire = (reason: ChatRetirementReason): boolean => {
      closed = true;
      // Only content wipe retains an issued request's original signal. Auth/terminal
      // cancellation still aborts immediately; this never removes an unknown ticket.
      if (reason !== "content-wipe" || !issuedPending || !owner.isCurrent()) raw.abort();
      return true;
    };
    const release = () => {
      releaseRequested = true; closed = true;
      finishRelease();
    };
    const abort = () => { closed = true; raw.abort(); };
    const reconcile = () => {
      if (!owner.isCurrent()) retire("account");
      else if (!contentCurrent()) retire("content-wipe");
      else if (!isSessionCurrent(token)) retire("replaced");
    };
    try {
      stopAccount = subscribeAccountTransition(reconcile);
      stopSession = subscribeSession(reconcile);
      assertCurrent();
    } catch (error) { release(); throw error; }

    const lease: PendingAccountSessionLease = Object.freeze({ userId: owner.ownerId, epoch: owner.epoch,
      signal: raw.signal, assertCurrent, abort, release,
      authenticate() {
        authentication ??= (async () => {
          assertCurrent();
          const session = await raw.authenticate();
          assertCurrent();
          if (session.userId !== owner.ownerId || session.epoch !== owner.epoch || session.signal !== raw.signal) throw abortError();
          const accessToken = session.accessToken;
          assertCurrent();
          authenticated = Object.freeze({ userId: owner.ownerId, epoch: owner.epoch, signal: raw.signal,
            get accessToken() { assertCurrent(); return accessToken; }, assertCurrent, abort, release });
          return authenticated;
        })();
        return authentication;
      },
    });
    const observedLedger = Object.freeze({
      read,
      acquireMutation(candidate, generation, input) {
        assertCurrent();
        if (usageTicket || candidate.ownerId !== owner.ownerId || candidate.epoch !== owner.epoch
          || generation !== token.contentGeneration || input.operationId !== operationId || input.stepId !== "quota" || input.kind !== "usage") throw abortError();
        usageTicket = acquire(owner, generation, input);
        return usageTicket;
      },
      issueMutation(candidate, ticket, dispatch, gate) {
        if (ticket !== usageTicket || candidate.ownerId !== owner.ownerId || candidate.epoch !== owner.epoch) throw abortError();
        return issue(owner, ticket, () => {
          // Installed before dispatch can synchronously reenter a wipe. Do not await
          // or publish between this flag and the original transport invocation.
          issuedPending = true;
          return dispatch();
        }, () => { assertCurrent(); return gate?.() ?? true; });
      },
      settleMutation(ticket, proof) {
        if (ticket !== usageTicket) return false;
        // Deliberately no body/owner gate: only this original ticket may receive its
        // verified late outcome, including after a wipe or an A -> B -> A transition.
        try { return settle(ticket, proof); }
        finally { issuedPending = false; finishRelease(); }
      },
    } satisfies CapturedChatUsageExecution["observer"]["ledger"]);
    const mutationObserver = Object.freeze({ owner, generation: token.contentGeneration, operationId, stepId: "quota", ledger: observedLedger });
    const inputFor = (input: CapturedChatInput): CapturedChatInput => {
      assertCurrent();
      if (started || !authenticated || input.session !== authenticated || input.signal !== raw.signal
        || input.userId !== owner.ownerId || typeof input.onCrisisDetected !== "function") throw abortError();
      started = true;
      const captured = { ...input, history: input.history?.map(turn => ({ ...turn })),
        session: authenticated, signal: raw.signal, mutationObserver };
      assertCurrent();
      return captured;
    };
    return Object.freeze({ lease, retire, release,
      send: async (input: CapturedChatInput) => sendChatMessage(inputFor(input)),
      auditLocalRed: async (input: CapturedChatInput) => auditChatLocalRed(inputFor(input)),
    });
  };
}
