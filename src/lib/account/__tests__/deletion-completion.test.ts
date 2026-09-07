import {
  createAccountDeletionCompletion, dismissAccountDeletionNotice,
  getAccountDeletionNotice, subscribeAccountDeletionNotice,
} from "../deletion-completion";
import { __resetAccountEpochForTests, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

const OWNER = "owner-a";
// main 의 AccountDeletionReceipt 는 이 테스트가 쓰이던 시점보다 넓다 - 서버가
// 끝내지 못했다고 보고한 sweep(incomplete), 아무 말도 안 한 sweep(unconfirmed),
// 그리고 전부 확인됐을 때만 참인 complete 가 더 있다. 좁은 옛 모양으로 두면
// 타입 체커가 막고, 억지로 맞추면 이 모듈이 실제로 받는 것과 달라진다.
const receipt = {
  deleted: true as const,
  profileErased: null,
  rawClippingsErased: false,
  incomplete: [],
  unconfirmed: [],
  complete: false,
  observedAtIso: "2026-09-07T00:00:00.000Z",
};
beforeEach(() => {
  dismissAccountDeletionNotice(); __resetAccountEpochForTests(); noteResolvedOwner(OWNER);
});
afterEach(() => { dismissAccountDeletionNotice(); });

test("public notice copies only receipt fields, never additional account metadata", () => {
  const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
  operation.beginSignOut({ ...receipt, privateOwner: OWNER } as typeof receipt, "complete");
  expect(getAccountDeletionNotice()?.receipt).toEqual(receipt);
  expect(Object.isFrozen(getAccountDeletionNotice())).toBe(true);
  expect(Object.isFrozen(getAccountDeletionNotice()?.receipt)).toBe(true);
  operation.dispose();
});

test("a completed notice survives exactly A -> null and clears synchronously on another login", () => {
  const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
  expect(operation.beginSignOut(receipt, "retry-scheduled")).toBe(true);
  expect(operation.beginSignOut(receipt, "complete")).toBe(false);
  const pending = getAccountDeletionNotice();
  expect(getAccountDeletionNotice()).toBe(pending);
  noteResolvedOwner(null);
  expect(operation.finishSignOut(true)).toBe(true);
  operation.dispose();
  expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");
  noteResolvedOwner(OWNER);
  expect(getAccountDeletionNotice()).toBeNull();
});

test("a stale completion cannot overwrite a newer owner's notice", () => {
  const first = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
  first.beginSignOut(receipt, "complete");
  noteResolvedOwner("owner-b");
  const second = createAccountDeletionCompletion("owner-b", currentAccountEpoch());
  second.beginSignOut(receipt, "unconfirmed");
  expect(first.finishSignOut(true)).toBe(false);
  expect(getAccountDeletionNotice()?.localPurge).toBe("unconfirmed");
  expect(getAccountDeletionNotice()?.localSignOut).toBe("pending");
  first.dispose(); second.dispose();
});

test("an invalidated epoch cannot publish even when the original user returns", () => {
  const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
  noteResolvedOwner("owner-b"); noteResolvedOwner(OWNER);
  expect(operation.isCurrent()).toBe(false);
  expect(operation.beginSignOut(receipt, "complete")).toBe(false);
  expect(operation.finishSignOut(true)).toBe(false);
  expect(getAccountDeletionNotice()).toBeNull();
  operation.dispose();
});

test("subscriber failure cannot retain an invalid receipt or prevent another subscriber", () => {
  const stopBroken = subscribeAccountDeletionNotice(() => { throw new Error("subscriber fixture"); });
  const listener = jest.fn(); const stop = subscribeAccountDeletionNotice(listener);
  const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
  operation.beginSignOut(receipt, "complete");
  noteResolvedOwner("owner-b");
  expect(getAccountDeletionNotice()).toBeNull();
  expect(listener).toHaveBeenCalledTimes(2);
  stopBroken(); stop(); operation.dispose();
});
