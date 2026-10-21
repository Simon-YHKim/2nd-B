import { beginTurnAttempt, canPrepareTurn, createTurnResultState, endTurnWait, finishTurnFailure,
  markTurnDispatched, nextTurnAction, receiveTurnAdmission, receiveTurnCrisis, receiveTurnReceipt,
  retireTurnRetry, selectTurnResult, startTurnReservation, turnHistoryValue } from "../turn-result-state";
import type { TurnAdmission } from "../../llm/types";

const owner = { ownerId: "a", ownerEpoch: 1, conversationId: "c", pairId: "p" };
const route = { vendor: "openai" as const, reservationSupported: true };
const day = "2026-10-21", receipt = { count: 5, turnId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const first: TurnAdmission = { mode: "enforce", allowed: true, kind: "first", attempt: 1,
  quotaCharged: true, bindingEligible: true, reaskAvailable: true };
const unknown: TurnAdmission = { mode: "enforce", allowed: null, kind: null, attempt: null,
  quotaCharged: false, bindingEligible: null, reaskAvailable: null };
function pending() {
  let state = beginTurnAttempt(createTurnResultState<string>(owner, "question"), day, route);
  const ticket = state.attempts[0].ticket;
  state = startTurnReservation(state, ticket);
  return { state, ticket };
}
function sent() {
  let { state, ticket } = pending();
  state = receiveTurnReceipt(state, ticket, receipt);
  state = markTurnDispatched(state, ticket);
  return { state, ticket };
}

test("T14 repeated admission-before failures retain the same reask candidate at 5/5", () => {
  let { state, ticket } = sent();
  for (let i = 0; i < 3; i++) {
    state = receiveTurnAdmission(state, ticket, unknown);
    state = finishTurnFailure(state, ticket);
    expect(nextTurnAction(state)).toBe("reask");
    state = beginTurnAttempt(state, "2026-10-22", route);
    ticket = state.attempts.at(-1)!.ticket;
    expect(ticket).toMatchObject({ generation: 1, day });
    expect(state.receipt).toEqual(receipt);
    state = markTurnDispatched(state, ticket);
  }
  expect(state.attempts.map(a => a.intent)).toEqual(["first", "reask", "reask", "reask"]);
});

test.each(["ownerId", "ownerEpoch", "conversationId", "pairId", "generation", "day"] as const)(
  "T15 ignores a late receipt with a different %s", key => {
    const { state, ticket } = pending();
    const altered = { ...ticket, [key]: typeof ticket[key] === "number" ? 99 : "other" };
    expect(receiveTurnReceipt(state, altered, receipt)).toBe(state);
  },
);

test("T15 late receipt preserves ID/count without dispatch or restoring a retired retry", () => {
  let { state, ticket } = pending();
  state = endTurnWait(state, ticket);
  state = receiveTurnReceipt(state, ticket, receipt);
  expect(state.receipt).toEqual(receipt);
  expect(canPrepareTurn(state, ticket)).toBe(false);
  expect(nextTurnAction(state)).toBe("first");
  expect(state.attempts[0].dispatched).toBe(false);
  const other = pending();
  state = receiveTurnReceipt(retireTurnRetry(other.state), other.ticket, receipt);
  expect(state.receipt).toEqual(receipt);
  expect(nextTurnAction(state)).toBe("closed");
});

test.each(["original", "reask"])("T16 first checked %s wins once; late failure cannot erase it", winner => {
  let { state, ticket } = sent();
  state = endTurnWait(state, ticket);
  state = beginTurnAttempt(state, day, route);
  const retry = state.attempts[1].ticket;
  state = markTurnDispatched(state, retry);
  const winning = winner === "original" ? ticket : retry, losing = winner === "original" ? retry : ticket;
  state = selectTurnResult(state, winning, winner);
  const selected = state.selected;
  state = selectTurnResult(state, losing, "late");
  state = finishTurnFailure(state, losing);
  expect(state.selected).toBe(selected);
  expect(turnHistoryValue(state)).toBe(winner);
});

test("T16 a new send retires retry but keeps the original answer eligible", () => {
  const { state, ticket } = sent();
  expect(selectTurnResult(retireTurnRetry(state), ticket, "answer").selected?.value).toBe("answer");
});

test("T17 crisis closes both retries and excludes a selected pair from history", () => {
  const { state, ticket } = sent();
  const crisis = receiveTurnCrisis(selectTurnResult(state, ticket, "answer"), ticket);
  expect(nextTurnAction(crisis)).toBe("closed");
  expect(turnHistoryValue(crisis)).toBeNull();
  expect(crisis.selected?.value).toBe("answer");
  expect(receiveTurnCrisis(state, { ...ticket, ownerEpoch: 2 })).toBe(state);
});

test("T18 ineligible becomes charge immediately; next begin retains pair/message with a new generation", () => {
  const { state, ticket } = sent();
  const ended = finishTurnFailure(state, ticket, "ineligible");
  expect(nextTurnAction(ended)).toBe("charge");
  const next = beginTurnAttempt(ended, day, route);
  expect(next).toMatchObject({ owner, message: "question", generation: 2, reservation: "idle", receipt: null, waiting: 2 });
  expect(next.attempts[1].intent).toBe("first");
  expect(endTurnWait(next, ticket)).toBe(next);
  expect(receiveTurnReceipt(startTurnReservation(next, next.attempts[1].ticket), ticket, receipt).receipt).toBeNull();
});

test.each([
  { ...first, allowed: false }, { ...first, attempt: 2 }, { ...first, quotaCharged: false },
  { ...first, bindingEligible: false }, { ...first, mode: "legacy" },
] as TurnAdmission[])("contradictory admission never grants free eligibility: %j", admission => {
  const { state, ticket } = sent();
  expect(nextTurnAction(finishTurnFailure(receiveTurnAdmission(state, ticket, admission), ticket))).toBe("charge");
});

test("a late first admission cannot restore a consumed server slot", () => {
  const { state, ticket } = sent();
  const second = { ...first, kind: "reask" as const, attempt: 2 as const, quotaCharged: false, reaskAvailable: false };
  expect(receiveTurnAdmission(receiveTurnAdmission(state, ticket, second), ticket, first).reaskAvailable).toBe(false);
});

test.each(["consent", "limit"] as const)("T17 late %s failure cannot reopen crisis history", reason => {
  let { state, ticket } = sent();
  state = endTurnWait(state, ticket);
  state = beginTurnAttempt(state, day, route);
  const retry = state.attempts[1].ticket;
  state = selectTurnResult(state, ticket, "original");
  state = receiveTurnCrisis(state, retry);
  state = finishTurnFailure(state, retry, reason);
  expect(state.terminal).toBe("crisis");
  expect(state.selected?.value).toBe("original");
  expect(turnHistoryValue(state)).toBeNull();
  expect(nextTurnAction(state)).toBe("closed");
});

test.each(["consent", "limit"] as const)("T16 %s closes new attempts but cannot discard an issued original", reason => {
  let { state, ticket } = sent();
  state = endTurnWait(state, ticket);
  state = beginTurnAttempt(state, day, route);
  const retry = state.attempts[1].ticket;
  state = finishTurnFailure(state, retry, reason);
  expect(nextTurnAction(state)).toBe("closed");
  expect(canPrepareTurn(state, retry)).toBe(false);
  state = selectTurnResult(state, ticket, "paid original");
  expect(state.selected?.value).toBe("paid original");
  expect(state.terminal).toBeNull();
});

test.each(["consent", "limit"] as const)("T16 a late %s cannot coexist with a selected answer", reason => {
  let { state, ticket } = sent();
  state = endTurnWait(state, ticket);
  state = beginTurnAttempt(state, day, route);
  const retry = state.attempts[1].ticket;
  state = selectTurnResult(state, ticket, "original");
  state = finishTurnFailure(state, retry, reason);
  expect(state.selected?.value).toBe("original");
  expect(state.terminal).toBeNull();
});

test.each(["consent", "limit", "ineligible"] as const)("T15 old-generation %s cannot terminate a new reservation", reason => {
  let { state, ticket } = sent();
  state = receiveTurnAdmission(state, ticket, { ...first, kind: "reask", attempt: 2, quotaCharged: false, reaskAvailable: false });
  state = endTurnWait(state, ticket);
  state = beginTurnAttempt(state, day, route);
  const current = state.attempts[1].ticket;
  state = startTurnReservation(state, current);
  state = finishTurnFailure(state, ticket, reason);
  expect(state).toMatchObject({ generation: 2, terminal: null, reservation: "pending", waiting: current.attemptId, reaskAvailable: null });
  state = receiveTurnReceipt(state, current, receipt);
  state = markTurnDispatched(state, current);
  state = finishTurnFailure(state, current);
  expect(nextTurnAction(state)).toBe("reask");
});

test("T15 old-generation admission cannot close a fresh free candidate", () => {
  let { state, ticket } = sent();
  state = finishTurnFailure(state, ticket, "ineligible");
  state = beginTurnAttempt(state, day, route);
  const current = state.attempts[1].ticket;
  state = receiveTurnReceipt(startTurnReservation(state, current), current, receipt);
  const late = { ...unknown, allowed: false, kind: "rejected", bindingEligible: false, reaskAvailable: false } as const;
  expect(receiveTurnAdmission(state, ticket, late)).toBe(state);
  state = markTurnDispatched(state, current);
  expect(nextTurnAction(finishTurnFailure(state, current))).toBe("reask");
});
