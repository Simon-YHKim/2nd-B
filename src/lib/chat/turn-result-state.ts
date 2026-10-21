// T39 A2: pure, in-memory turn selection. No clock, network or automatic retry.
import type { ChatTurnRoute, TurnAdmission } from "../llm/types";
import type { ChatTurnUsage } from "./turn-reservation";

export type TurnOwner = Readonly<{ ownerId: string; ownerEpoch: number; conversationId: string; pairId: string }>;
export type TurnTicket = TurnOwner & Readonly<{ generation: number; day: string; attemptId: number }>;
export type TurnAttempt = Readonly<{
  ticket: TurnTicket;
  intent: "first" | "reask";
  dispatched: boolean;
  settled: boolean;
}>;
export type TurnResultState<T> = Readonly<{
  owner: TurnOwner;
  message: string;
  generation: number;
  day: string;
  route: ChatTurnRoute | null;
  reservation: "idle" | "pending" | "unknown" | "ready" | "legacy";
  receipt: ChatTurnUsage | null;
  reaskAvailable: boolean | null;
  retryClosed: boolean;
  terminal: "crisis" | "consent" | "limit" | null;
  attempts: readonly TurnAttempt[];
  waiting: number | null;
  selected: Readonly<{ attemptId: number; value: T }> | null;
  crisisNotified: boolean;
}>;

export function createTurnResultState<T>(owner: TurnOwner, message: string): TurnResultState<T> {
  return { owner: { ...owner }, message, generation: 0, day: "", route: null,
    reservation: "idle", receipt: null, reaskAvailable: null, retryClosed: false,
    terminal: null, attempts: [], waiting: null, selected: null, crisisNotified: false };
}

function sameOwner(a: TurnOwner, b: TurnOwner): boolean {
  return a.ownerId === b.ownerId && a.ownerEpoch === b.ownerEpoch
    && a.conversationId === b.conversationId && a.pairId === b.pairId;
}

function attemptFor<T>(state: TurnResultState<T>, ticket: TurnTicket): TurnAttempt | undefined {
  return sameOwner(state.owner, ticket) ? state.attempts.find(a => a.ticket.attemptId === ticket.attemptId
    && a.ticket.generation === ticket.generation && a.ticket.day === ticket.day) : undefined;
}

export function nextTurnAction<T>(state: TurnResultState<T>): "charge" | "first" | "reask" | "wait" | "closed" {
  if (state.terminal || state.selected || state.retryClosed) return "closed";
  if (state.waiting !== null || state.reservation === "pending" || state.reservation === "unknown") return "wait";
  if (state.reservation === "idle" || state.reservation === "legacy" || state.reaskAvailable === false) return "charge";
  return state.attempts.some(a => a.ticket.generation === state.generation && a.dispatched) ? "reask" : "first";
}

/** Explicit user action only. B2 may end a wait without cancelling its attempt. */
export function beginTurnAttempt<T>(state: TurnResultState<T>, day: string, route: ChatTurnRoute): TurnResultState<T> {
  const action = nextTurnAction(state);
  if (action === "wait" || action === "closed") return state;
  const charge = action === "charge";
  const generation = state.generation + (charge ? 1 : 0);
  const attemptId = state.attempts.length + 1;
  const ticket = { ...state.owner, generation, day: charge ? day : state.day, attemptId };
  return { ...state, generation, day: ticket.day, route: charge ? { ...route } : state.route,
    ...(charge ? { reservation: "idle" as const, receipt: null, reaskAvailable: null } : {}),
    waiting: attemptId, attempts: [...state.attempts, { ticket, intent: action === "reask" ? "reask" : "first", dispatched: false, settled: false }] };
}

export function canPrepareTurn<T>(state: TurnResultState<T>, ticket: TurnTicket): boolean {
  const attempt = attemptFor(state, ticket);
  return !!attempt && !attempt.settled && ticket.generation === state.generation
    && ticket.day === state.day && !state.selected && !state.terminal && !state.retryClosed;
}

export function startTurnReservation<T>(state: TurnResultState<T>, ticket: TurnTicket): TurnResultState<T> {
  return canPrepareTurn(state, ticket) && state.reservation === "idle" ? { ...state, reservation: "pending" } : state;
}

/** Receipts can settle accounting after a new send, but cannot reopen its retry. */
export function receiveTurnReceipt<T>(state: TurnResultState<T>, ticket: TurnTicket, receipt: ChatTurnUsage): TurnResultState<T> {
  if (!attemptFor(state, ticket) || ticket.generation !== state.generation || ticket.day !== state.day
    || (state.reservation !== "pending" && state.reservation !== "unknown")) return state;
  return { ...state, receipt: { ...receipt }, reservation: receipt.turnId ? "ready" : "legacy" };
}

export function markTurnDispatched<T>(state: TurnResultState<T>, ticket: TurnTicket): TurnResultState<T> {
  if (!canPrepareTurn(state, ticket)) return state;
  return { ...state, attempts: state.attempts.map(a => a.ticket.attemptId === ticket.attemptId ? { ...a, dispatched: true } : a) };
}

/** Cross-field validation: malformed facts cannot grant a free attempt. */
export function consistentTurnAdmission(a: TurnAdmission): boolean {
  if (a.allowed === null) return a.kind === null && a.attempt === null
    && (a.quotaCharged === null || a.quotaCharged === false) && a.bindingEligible === null && a.reaskAvailable === null;
  if (a.kind === "rejected") return a.allowed === false && a.attempt === null
    && a.quotaCharged === false && a.bindingEligible === false && a.reaskAvailable !== true;
  if (a.mode === "legacy") return a.kind === null && a.attempt === null && a.bindingEligible === null && a.reaskAvailable === null;
  if (a.allowed !== true) return false;
  if (a.kind === "unbound") return a.attempt === null && a.quotaCharged === true && a.bindingEligible === false && a.reaskAvailable === false;
  if (a.kind === "first") return a.attempt === 1 && a.quotaCharged === true && a.bindingEligible === true && a.reaskAvailable === true;
  return a.kind === "reask" && a.attempt === 2 && a.quotaCharged === false && a.bindingEligible === true && a.reaskAvailable === false;
}

export function receiveTurnAdmission<T>(state: TurnResultState<T>, ticket: TurnTicket, admission?: TurnAdmission): TurnResultState<T> {
  if (!admission || !attemptFor(state, ticket) || ticket.generation !== state.generation) return state;
  const closed = !consistentTurnAdmission(admission) || (admission.mode === "legacy" && admission.allowed !== null)
    || admission.kind === "unbound" || admission.reaskAvailable === false;
  return { ...state, reaskAvailable: closed ? false : state.reaskAvailable === false ? false : admission.reaskAvailable ?? state.reaskAvailable };
}

export function endTurnWait<T>(state: TurnResultState<T>, ticket: TurnTicket): TurnResultState<T> {
  if (!attemptFor(state, ticket) || state.waiting !== ticket.attemptId) return state;
  return { ...state, waiting: null, ...(state.reservation === "pending" ? {
    attempts: state.attempts.map(a => a.ticket.attemptId === ticket.attemptId ? { ...a, settled: true } : a),
  } : {}) };
}

export function finishTurnFailure<T>(state: TurnResultState<T>, ticket: TurnTicket,
  reason?: "consent" | "limit" | "ineligible"): TurnResultState<T> {
  if (!attemptFor(state, ticket)) return state;
  const current = ticket.generation === state.generation;
  return { ...endTurnWait(state, ticket),
    ...(current && state.reservation === "pending" ? { reservation: "unknown" as const } : {}),
    ...(current && reason === "ineligible" ? { reaskAvailable: false } : {}),
    ...(state.terminal !== "crisis" && (reason === "consent" || reason === "limit") ? { terminal: reason } : {}),
    attempts: state.attempts.map(a => a.ticket.attemptId === ticket.attemptId ? { ...a, settled: true } : a) };
}

/** An already-dispatched original remains eligible even after a reask/new send. */
export function selectTurnResult<T>(state: TurnResultState<T>, ticket: TurnTicket, value: T): TurnResultState<T> {
  const attempt = attemptFor(state, ticket);
  if (!attempt || attempt.settled || state.selected || state.terminal) return state;
  return { ...endTurnWait(state, ticket), selected: { attemptId: ticket.attemptId, value },
    attempts: state.attempts.map(a => a.ticket.attemptId === ticket.attemptId ? { ...a, settled: true } : a) };
}

/** UI notification dedupe is deliberately separate from per-attempt C3 writes. */
export function receiveTurnCrisis<T>(state: TurnResultState<T>, ticket: TurnTicket): TurnResultState<T> {
  if (!attemptFor(state, ticket)) return state;
  return { ...state, terminal: "crisis", retryClosed: true, reaskAvailable: false, waiting: null, crisisNotified: true };
}

export function retireTurnRetry<T>(state: TurnResultState<T>): TurnResultState<T> {
  return { ...state, retryClosed: true, waiting: null };
}

export function turnHistoryValue<T>(state: TurnResultState<T>): T | null {
  return state.terminal === "crisis" ? null : state.selected?.value ?? null;
}
