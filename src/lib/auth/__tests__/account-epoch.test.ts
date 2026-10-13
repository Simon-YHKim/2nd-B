import {
  __resetAccountEpochForTests,
  accountEpochFromSnapshot,
  accountTransitionPendingFromSnapshot,
  accountTransitionSnapshot,
  beginAccountOwnerTransition,
  captureAccountOwnerLease,
  clearAccountTransition,
  currentAccountEpoch,
  isAccountNavigationResetPending,
  isAccountTransitionPending,
  isCurrentAccountEpoch,
  currentResolvedAccountOwner,
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

  test("an observed B auth session hides A and invalidates its epoch before B publication", () => {
    noteResolvedOwner("owner-a");
    const aEpoch = currentAccountEpoch();

    beginAccountOwnerTransition("owner-b");

    expect(currentResolvedAccountOwner()).toBe("owner-a");
    expect(currentAccountEpoch()).toBe(aEpoch + 1);
    expect(isCurrentAccountEpoch(aEpoch)).toBe(false);
    expect(isAccountTransitionPending()).toBe(true);
    expect(clearAccountTransition(currentAccountEpoch())).toBe(false);

    noteResolvedOwner("owner-b");
    expect(currentResolvedAccountOwner()).toBe("owner-b");
    expect(currentAccountEpoch()).toBe(aEpoch + 2);
    expect(isAccountTransitionPending()).toBe(true);
    expect(clearAccountTransition(currentAccountEpoch())).toBe(true);
  });

  test("rapid B then C observations keep A hidden and only advance each distinct target once", () => {
    noteResolvedOwner("owner-a");
    const aEpoch = currentAccountEpoch();

    beginAccountOwnerTransition("owner-b");
    beginAccountOwnerTransition("owner-b");
    beginAccountOwnerTransition("owner-c");

    expect(currentResolvedAccountOwner()).toBe("owner-a");
    expect(currentAccountEpoch()).toBe(aEpoch + 2);
    expect(isAccountTransitionPending()).toBe(true);

    noteResolvedOwner("owner-c");
    expect(currentResolvedAccountOwner()).toBe("owner-c");
    expect(currentAccountEpoch()).toBe(aEpoch + 3);
  });

  test("owner mutation leases fail closed throughout a transition and reopen after navigation proof", () => {
    noteResolvedOwner("owner-a");
    const leaseA = captureAccountOwnerLease("owner-a");
    expect(leaseA?.isCurrent()).toBe(true);

    beginAccountOwnerTransition("owner-b");
    expect(leaseA?.isCurrent()).toBe(false);
    expect(captureAccountOwnerLease("owner-a")).toBeNull();

    noteResolvedOwner("owner-b");
    expect(captureAccountOwnerLease("owner-b")).toBeNull();
    expect(clearAccountTransition(currentAccountEpoch())).toBe(true);
    expect(captureAccountOwnerLease("owner-b")?.isCurrent()).toBe(true);
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

describe("a different owner awaiting its fresh start", () => {
  beforeEach(() => __resetAccountEpochForTests());

  test("the first sign-in of the realm has nothing retained", () => {
    expect(isAccountNavigationResetPending()).toBe(false);
    beginAccountOwnerTransition("owner-a");
    noteResolvedOwner("owner-a");
    expect(isAccountNavigationResetPending()).toBe(false);
  });

  test("direct A -> B: not while B is only observed, yes once B is published, no after the reset is proven", () => {
    noteResolvedOwner("owner-a");

    beginAccountOwnerTransition("owner-b");
    expect(isAccountTransitionPending()).toBe(true);
    expect(isAccountNavigationResetPending()).toBe(false);

    noteResolvedOwner("owner-b");
    expect(isAccountNavigationResetPending()).toBe(true);

    expect(clearAccountTransition(currentAccountEpoch())).toBe(true);
    expect(isAccountNavigationResetPending()).toBe(false);
  });

  test("A -> signed out -> B counts; signing out alone and signing back into A do not", () => {
    noteResolvedOwner("owner-a");
    beginAccountOwnerTransition(null);
    noteResolvedOwner(null);
    expect(isAccountNavigationResetPending()).toBe(false);

    beginAccountOwnerTransition("owner-a");
    noteResolvedOwner("owner-a");
    expect(isAccountNavigationResetPending()).toBe(false);

    beginAccountOwnerTransition(null);
    noteResolvedOwner(null);
    beginAccountOwnerTransition("owner-b");
    expect(isAccountNavigationResetPending()).toBe(false);
    noteResolvedOwner("owner-b");
    expect(isAccountNavigationResetPending()).toBe(true);
  });

  test("B -> C before B's fresh start: off while C is only observed, on again when C is published", () => {
    noteResolvedOwner("owner-a");
    noteResolvedOwner("owner-b");
    expect(isAccountNavigationResetPending()).toBe(true);

    beginAccountOwnerTransition("owner-c");
    expect(isAccountNavigationResetPending()).toBe(false);
    noteResolvedOwner("owner-c");
    expect(isAccountNavigationResetPending()).toBe(true);
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
