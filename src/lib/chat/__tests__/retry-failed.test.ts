import { canRetryFailedTurn, createChatSendLock, type RetryTurn } from "../retry-failed";
import { beginTurnAttempt, createTurnResultState, finishTurnFailure, markTurnDispatched, receiveTurnAdmission,
  receiveTurnCrisis, receiveTurnReceipt, selectTurnResult, startTurnReservation, type TurnResultState } from "../turn-result-state";
import type { LiveChatTurn } from "../conversation-turn";
import type { SendMessageOk } from "../conversation";
import type { TurnAdmission } from "../../llm/types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const owner = { ownerId: "a", ownerEpoch: 1, conversationId: "c", pairId: "p" };
const route = { vendor: "openai" as const, reservationSupported: true };
const first: TurnAdmission = { mode: "enforce", allowed: true, kind: "first", attempt: 1,
  quotaCharged: true, bindingEligible: true, reaskAvailable: true };
const unknown: TurnAdmission = { mode: "enforce", allowed: null, kind: null, attempt: null,
  quotaCharged: false, bindingEligible: null, reaskAvailable: null };
const pair: RetryTurn[] = [{ role: "user", pairId: "p", text: "question" },
  { role: "secondb", pairId: "p", text: "failed", retryText: "question" }];
function pending() {
  const s = beginTurnAttempt(createTurnResultState<SendMessageOk>(owner, "question"), "2026-10-24", route);
  return startTurnReservation(s, s.attempts[0].ticket);
}
function ready(dispatched = true) {
  let s = pending();
  s = receiveTurnReceipt(s, s.attempts[0].ticket, { count: 5, turnId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  return dispatched ? markTurnDispatched(s, s.attempts[0].ticket) : s;
}
function failed(s = ready()) { return finishTurnFailure(s, s.attempts.at(-1)!.ticket); }
function admitted(a: TurnAdmission) {
  const s = ready();
  return failed(receiveTurnAdmission(s, s.attempts[0].ticket, a));
}
function permitted(s: TurnResultState<SendMessageOk>, underLimit = true, turns = pair) {
  return canRetryFailedTurn(turns, turns.length - 1, { read: () => s } as LiveChatTurn, underLimit);
}

test.each([
  ["reserved, never dispatched", () => failed(ready(false)), true, true],
  ["dispatched failure", () => failed(), true, true],
  ["pre-admission 503", () => admitted(unknown), true, true],
  ["lost admission response", () => admitted({ ...unknown, quotaCharged: null }), true, true],
  ["first admitted with one remaining", () => admitted(first), true, true],
  ["second admitted with none remaining", () => admitted({ ...first, kind: "reask", attempt: 2, quotaCharged: false, reaskAvailable: false }), true, false],
  ["409 ineligible", () => finishTurnFailure(ready(), ready().attempts[0].ticket, "ineligible"), true, false],
  ["unbound", () => admitted({ ...first, kind: "unbound", attempt: null, bindingEligible: false, reaskAvailable: false }), true, false],
  ["confirmed legacy", () => admitted({ ...unknown, mode: "legacy", allowed: true, quotaCharged: true }), true, false],
  ["legacy key-missing before admission", () => admitted({ ...unknown, mode: "legacy" }), true, true],
  ["issuance unknown without ID", () => failed(pending()), false, false],
  ["still pending", pending, false, false],
  ["proxy not settled", ready, false, false],
] as const)("B1 table: %s (under cap / at cap)", (_name, build, belowCap, atCap) => {
  expect(permitted(build(), true)).toBe(belowCap);
  expect(permitted(build(), false)).toBe(atCap);
});

test.each(["crisis", "consent", "limit", "answer"])("terminal %s cannot retry", terminal => {
  const s = ready(), ticket = s.attempts[0].ticket;
  const closed = terminal === "crisis" ? receiveTurnCrisis(s, ticket)
    : terminal === "answer" ? selectTurnResult(s, ticket, {} as SendMessageOk)
      : finishTurnFailure(s, ticket, terminal as "consent" | "limit");
  expect(permitted(closed)).toBe(false);
});

test("old pair, another question and stale owner cannot reuse a candidate", () => {
  expect(permitted(failed(), true, pair.map(t => ({ ...t, pairId: "other" })))).toBe(false);
  expect(permitted({ ...failed(), message: "other" })).toBe(false);
  expect(canRetryFailedTurn(pair, 1, { read: () => { throw new Error("stale"); } } as unknown as LiveChatTurn, true)).toBe(false);
  expect(canRetryFailedTurn(pair, 1, null, true)).toBe(false);
});

test("send and retry share a synchronous lock; stale finally cannot release the next owner", () => {
  const lock = createChatSendLock();
  let current = true;
  const a = { ownerId: "a", epoch: 1, isCurrent: () => current };
  const requestA = lock.acquire(a, 0)!;
  expect(lock.acquire(a, 0)).toBeNull();
  current = false;
  expect(lock.acquire(a, 0)).toBeNull();
  const b = { ownerId: "b", epoch: 2, isCurrent: () => true };
  const requestB = lock.acquire(b, 0)!;
  expect(lock.release(requestA)).toBe(false);
  expect(lock.busy()).toBe(true);
  expect(lock.acquire(b, 0)).toBeNull();
  expect(lock.release(requestB)).toBe(true);
  expect(lock.busy()).toBe(false);
  expect(lock.acquire(b, 0)).not.toBeNull();
});

test("a new conversation cannot be unlocked by the old conversation's finally", () => {
  const lock = createChatSendLock(), lease = { ownerId: "a", epoch: 1, isCurrent: () => true };
  const old = lock.acquire(lease, 0)!;
  const next = lock.acquire(lease, 1)!;
  expect(next).not.toBeNull();
  expect(lock.release(old)).toBe(false);
  expect(lock.busy()).toBe(true);
  expect(lock.release(next)).toBe(true);
});

test("T26 ledger separates the same-line hold, new sends, rollout gates and the T38 H port", () => {
  const ledger = JSON.parse(readFileSync(resolve("docs/handoff/CODEX-TASK-LEDGER-261016.json"), "utf8")) as {
    tasks: { id: string; conditions: string }[];
  };
  const t39 = ledger.tasks.find(task => task.id === "T39")!.conditions;
  expect(t39).not.toContain("보류 턴 확인 전 새 보내기 차단");
  for (const clause of ["같은 실패 줄은 새 bump 금지", "새 보내기 자체는 허용", "enforce", "두 카운터", "별도 검증 뒤 B2", "S0a 양성은 적용 증거와 별도"]) {
    expect(t39).toContain(clause);
  }
  expect(ledger.tasks.find(task => task.id === "T38")!.conditions).toContain("H captured 활성화 전 T39");
});
