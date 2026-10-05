import {
  createAccountDeletionCompletion, dismissAccountDeletionNotice,
  getAccountDeletionNotice, subscribeAccountDeletionNotice,
} from "../deletion-completion";
import {
  __resetAccountEpochForTests, beginAccountOwnerTransition, currentAccountEpoch, noteResolvedOwner,
} from "../../auth/account-epoch";

const OWNER = "owner-a";
// main 의 AccountDeletionReceipt 는 이 테스트가 쓰이던 시점보다 넓다 - 서버가
// 끝내지 못했다고 보고한 sweep(incomplete), 아무 말도 안 한 sweep(unconfirmed),
// 그리고 전부 확인됐을 때만 참인 complete 가 더 있다. 좁은 옛 모양으로 두면
// 타입 체커가 막고, 억지로 맞추면 이 모듈이 실제로 받는 것과 달라진다.
const receipt = {
  deleted: true as const,
  profileErased: null,
  deletionFenced: true,
  rawClippingsErased: false,
  rawClippingsEmptyAtCheck: false,
  rawClippingsRemoved: 12,
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

// AuthContext publishes every sign-out as a pre-publication hold followed by the
// publication: beginAccountOwnerTransition(null) moves the epoch with no owner
// event, then noteResolvedOwner(null) moves it again with the only one. The
// cases above publish null with a bare noteResolvedOwner(null), the one path on
// which "epoch + 1" holds, so a rule that discarded the receipt on the real
// sequence passed them all (QA 261004 gates DEL-R3-01 / EXIST-DEL-01B).
function signOutLikeAuthContext() {
  beginAccountOwnerTransition(null);
  noteResolvedOwner(null);
}

describe("the receipt survives the sign-out AuthContext actually performs", () => {
  test("hold then publication: the receipt stays and its sign-out is recorded", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    expect(operation.beginSignOut(receipt, "complete")).toBe(true);
    signOutLikeAuthContext();
    expect(operation.finishSignOut(true)).toBe(true);
    operation.dispose();
    expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");
    expect(getAccountDeletionNotice()?.localPurge).toBe("complete");
  });

  test("sign-out settles between the hold and the publication", () => {
    // signOut() resolves while AuthContext still awaits its cleanup gate: the
    // hold is up, nothing is published yet. "pending" here would leave the
    // notice undismissable (the panel ignores dismiss while pending).
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    operation.beginSignOut(receipt, "complete");
    beginAccountOwnerTransition(null);
    expect(operation.finishSignOut(true)).toBe(true);
    noteResolvedOwner(null);
    operation.dispose();
    expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");
  });

  test("the next account still clears it synchronously after the real sequence", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    operation.beginSignOut(receipt, "complete");
    signOutLikeAuthContext();
    operation.finishSignOut(true);
    operation.dispose();
    beginAccountOwnerTransition("owner-b");
    expect(getAccountDeletionNotice()).not.toBeNull(); // a hold exposes no owner
    noteResolvedOwner("owner-b");
    expect(getAccountDeletionNotice()).toBeNull();
  });

  test("A -> B behind a hold still discards A's receipt", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    operation.beginSignOut(receipt, "complete");
    beginAccountOwnerTransition("owner-b");
    noteResolvedOwner("owner-b");
    expect(getAccountDeletionNotice()).toBeNull();
    expect(operation.finishSignOut(true)).toBe(false);
    operation.dispose();
  });
});

// The operation now starts with the deletion, before the Edge call, so an A ->
// null that lands while the request is in flight (another tab signed out, or
// the server-revoked session was dropped) is this account's own sign-out, not
// a reason to throw the receipt away.
describe("an A -> null before the receipt arrives", () => {
  test("publishes for the signed-out device, then clears on the next account", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    signOutLikeAuthContext();
    expect(operation.isCurrent()).toBe(true);
    expect(operation.beginSignOut(receipt, "unconfirmed")).toBe(true);
    expect(operation.finishSignOut(true)).toBe(true);
    operation.dispose();
    expect(getAccountDeletionNotice()?.localPurge).toBe("unconfirmed");
    expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");
    noteResolvedOwner("owner-b");
    expect(getAccountDeletionNotice()).toBeNull();
  });

  test("A -> null -> B before the receipt arrives publishes nothing", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    signOutLikeAuthContext();
    noteResolvedOwner("owner-b");
    expect(operation.beginSignOut(receipt, "complete")).toBe(false);
    expect(getAccountDeletionNotice()).toBeNull();
    operation.dispose();
  });

  test("a stale capture or a capture for an owner that is not published is dead on arrival", () => {
    const stale = createAccountDeletionCompletion(OWNER, currentAccountEpoch() - 1);
    expect(stale.beginSignOut(receipt, "complete")).toBe(false);
    const other = createAccountDeletionCompletion("owner-b", currentAccountEpoch());
    expect(other.beginSignOut(receipt, "complete")).toBe(false);
    expect(getAccountDeletionNotice()).toBeNull();
    stale.dispose(); other.dispose();
  });

  test("dispose stops following the account", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    operation.dispose();
    signOutLikeAuthContext();
    // Not following any more, so it never learned of the sign-out and the
    // published owner (null) no longer matches the owner it was bound to.
    expect(operation.beginSignOut(receipt, "complete")).toBe(false);
  });
});

// QA 261004 gate DEL-N1-01 (2026-10-05). A login holds B before publishing it;
// in between the published owner is still null, which is exactly what this
// operation accepts after A -> null. Every case here raises the hold and never
// calls noteResolvedOwner(B).
describe("a login that is held but not yet published ends the operation", () => {
  test("after A -> null: the receipt is not published and nothing can finish", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    signOutLikeAuthContext();
    beginAccountOwnerTransition("owner-b");
    expect(operation.isCurrent()).toBe(false);
    expect(operation.beginSignOut(receipt, "complete")).toBe(false);
    expect(operation.finishSignOut(true)).toBe(false);
    expect(getAccountDeletionNotice()).toBeNull();
    operation.dispose();
  });

  test("during the sign-out after publication: finishing is refused", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    expect(operation.beginSignOut(receipt, "complete")).toBe(true);
    signOutLikeAuthContext();
    beginAccountOwnerTransition("owner-b");
    expect(operation.isCurrent()).toBe(false);
    expect(operation.finishSignOut(false)).toBe(false);
    operation.dispose();
  });

  test("A -> B held while A is still published ends it too", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    beginAccountOwnerTransition("owner-b");
    expect(operation.beginSignOut(receipt, "complete")).toBe(false);
    operation.dispose();
  });

  test("dropping the held login does not bring the operation back", () => {
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    signOutLikeAuthContext();
    beginAccountOwnerTransition("owner-b");
    beginAccountOwnerTransition(null); // the login never published
    expect(operation.isCurrent()).toBe(false);
    expect(operation.beginSignOut(receipt, "complete")).toBe(false);
    operation.dispose();
  });

  test("an operation created while a login is held is dead on arrival", () => {
    beginAccountOwnerTransition("owner-b");
    const operation = createAccountDeletionCompletion(OWNER, currentAccountEpoch());
    expect(operation.beginSignOut(receipt, "complete")).toBe(false);
    operation.dispose();
  });
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
