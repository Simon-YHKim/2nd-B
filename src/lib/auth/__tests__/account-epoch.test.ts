import {
  __resetAccountEpochForTests,
  accountEpochFromSnapshot,
  accountTransitionPendingFromSnapshot,
  accountTransitionSnapshot,
  clearAccountTransition,
  currentAccountEpoch,
  isAccountTransitionPending,
  isCurrentAccountEpoch,
  noteResolvedOwner,
  onAccountOwnerChange,
  shouldReleaseAccountTransition,
  subscribeAccountTransition,
  withAccountEpoch,
} from "../account-epoch";

describe("account epoch ownership boundary", () => {
  beforeEach(() => __resetAccountEpochForTests());

  test("direct A -> B raises an opaque transition before B is published", () => {
    const transitions: boolean[] = [];
    const owners: Array<string | null> = [];
    subscribeAccountTransition(() => transitions.push(isAccountTransitionPending()));
    onAccountOwnerChange((change) => owners.push(change.owner));

    noteResolvedOwner("owner-a");
    const aEpoch = currentAccountEpoch();
    noteResolvedOwner("owner-b");

    expect(owners).toEqual(["owner-a", "owner-b"]);
    expect(currentAccountEpoch()).toBe(aEpoch + 1);
    expect(isCurrentAccountEpoch(aEpoch)).toBe(false);
    expect(isAccountTransitionPending()).toBe(true);
    expect(transitions).toEqual([false, true]);
  });

  test("a second owner switch changes the primitive snapshot while held", () => {
    const snapshots: number[] = [];
    subscribeAccountTransition(() => snapshots.push(accountTransitionSnapshot()));

    noteResolvedOwner("owner-a");
    noteResolvedOwner("owner-b");
    const bSnapshot = accountTransitionSnapshot();
    noteResolvedOwner("owner-c");
    const cSnapshot = accountTransitionSnapshot();

    expect(snapshots).toEqual([2, 5, 7]);
    expect(cSnapshot).not.toBe(bSnapshot);
    expect(accountEpochFromSnapshot(cSnapshot)).toBe(currentAccountEpoch());
    expect(accountTransitionPendingFromSnapshot(cSnapshot)).toBe(true);
    expect(clearAccountTransition(accountEpochFromSnapshot(bSnapshot))).toBe(false);
    expect(clearAccountTransition(accountEpochFromSnapshot(cSnapshot))).toBe(true);
    expect(accountTransitionSnapshot()).toBe(6);
  });

  test("A -> null -> B is held, while signing back into A is not", () => {
    noteResolvedOwner("owner-a");
    noteResolvedOwner(null);
    noteResolvedOwner("owner-a");
    expect(isAccountTransitionPending()).toBe(false);

    noteResolvedOwner(null);
    noteResolvedOwner("owner-b");
    expect(isAccountTransitionPending()).toBe(true);
  });

  test("same-owner publications are idempotent and epoch guards fail closed", () => {
    noteResolvedOwner("owner-a");
    const captured = currentAccountEpoch();
    noteResolvedOwner("owner-a");
    expect(currentAccountEpoch()).toBe(captured);
    expect(withAccountEpoch(captured, () => "ran")).toBe("ran");

    noteResolvedOwner(null);
    const effect = jest.fn();
    expect(withAccountEpoch(captured, effect)).toBeUndefined();
    expect(effect).not.toHaveBeenCalled();
  });

  test("a stale resolver cannot clear a newer owner transition", () => {
    noteResolvedOwner("owner-a");
    const staleEpoch = currentAccountEpoch();
    noteResolvedOwner("owner-b");
    expect(clearAccountTransition(staleEpoch)).toBe(false);
    expect(isAccountTransitionPending()).toBe(true);

    expect(clearAccountTransition(currentAccountEpoch())).toBe(true);
    expect(isAccountTransitionPending()).toBe(false);
  });
});

describe("account transition release proof", () => {
  test("releases only for the sole root index route", () => {
    expect(shouldReleaseAccountTransition([], { routes: [{ name: "index" }] })).toBe(true);
    expect(
      shouldReleaseAccountTransition(["(auth)", "reset-password"], {
        routes: [{ name: "(auth)" }],
      }),
    ).toBe(false);
    expect(
      shouldReleaseAccountTransition([], {
        routes: [{ name: "index" }, { name: "record/[id]" }],
      }),
    ).toBe(false);
    expect(
      shouldReleaseAccountTransition(["record", "abc"], { routes: [{ name: "index" }] }),
    ).toBe(false);
    expect(shouldReleaseAccountTransition([], undefined)).toBe(false);
  });
});
