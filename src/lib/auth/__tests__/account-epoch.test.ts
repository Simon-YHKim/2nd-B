import {
  __resetAccountEpochForTests,
  accountEpochFromSnapshot,
  accountTransitionPendingFromSnapshot,
  accountTransitionSnapshot,
  beginAccountOwnerTransition,
  captureAccountOwnerLease,
  clearAccountTransition,
  currentAccountEpoch,
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

describe("account transition release proof", () => {
  test("releases only for the sole hydrated root index route", () => {
    expect(shouldReleaseAccountTransition([], appStack(home))).toBe(true);
    expect(
      shouldReleaseAccountTransition(["(auth)", "reset-password"], appStack({ name: "(auth)" })),
    ).toBe(false);
    expect(
      shouldReleaseAccountTransition([], appStack(home, { name: "record/[id]" })),
    ).toBe(false);
    expect(
      shouldReleaseAccountTransition(["record", "abc"], appStack(home)),
    ).toBe(false);
    expect(shouldReleaseAccountTransition([], undefined)).toBe(false);
  });

  // Same __root -> app Stack shape as gate-cover-loop and world-route-transition;
  // unlike those reduced visibility fixtures, ownership needs go-home's full
  // hydrated Stack metadata. Omitting it must never make a successful proof.
  type State = {
    key?: string;
    type?: string;
    index?: number;
    stale?: boolean;
    routeNames?: readonly string[];
    preloadedRoutes?: readonly unknown[];
    routes: readonly { key?: string; name: string; state?: State }[];
  };
  const home = { key: "home", name: "index" };
  const old = { key: "old-records", name: "records" };
  const appStack = (...routes: State["routes"]): State => ({
    key: "app-stack", type: "stack", stale: false, index: routes.length - 1, preloadedRoutes: [],
    routeNames: ["index", "records", "(auth)", "avatar-studio"], routes,
  });
  const wrapped = (state: State): State => ({
    key: "container", type: "stack", stale: false, index: 0, routeNames: ["__root"],
    preloadedRoutes: [], routes: [{ key: "generated", name: "__root", state }],
  });

  describe.each([
    ["direct app Stack", (state: State) => state],
    ["__root wrapper", wrapped],
  ] as const)("%s", (_label, shape) => {
    test("releases a sole home route", () => {
      expect(shouldReleaseAccountTransition([], shape(appStack(home)))).toBe(true);
    });
    test.each([
      ["old scene still retained after the URL changes", appStack(home, old)],
      ["duplicate home routes", appStack(home, home)],
      ["unfocused old scene beyond home index", { ...appStack(home, old), index: 0 }],
      ["reset requested but not committed", appStack(old)],
      ["no home stack", { ...appStack(old), routeNames: ["records"] }],
      ["auth-only stack", appStack({ name: "(auth)", state: { routes: [{ name: "sign-in" }] } })],
      ["empty stack", appStack()],
    ] as const)("holds: %s", (_case, state) => {
      expect(shouldReleaseAccountTransition([], shape(state))).toBe(false);
    });
    test.each([["(auth)", "sign-in"], ["avatar-studio"], ["records"]])(
      "holds until segments also prove home: %j", (...segments) => {
        expect(shouldReleaseAccountTransition(segments, shape(appStack(home)))).toBe(false);
      },
    );
    test.each([
      ["index retains nested old state", appStack({ ...home, state: appStack(old) })],
      ["preloaded old scene in home stack", { ...appStack(home), preloadedRoutes: [old] }],
      ["home stack omits type", { ...appStack(home), type: undefined }],
      ["home stack has empty type", { ...appStack(home), type: "" }],
      ["home is not a stack", { ...appStack(home), type: "tab" }],
      ["home stack is stale", { ...appStack(home), stale: true }],
      ["home hydration is unknown", { ...appStack(home), stale: undefined }],
      ["registered home but current route is different", appStack(old)],
      ["current home is not registered", { ...appStack(home), routeNames: ["records"] }],
      ["home routeNames unknown", { ...appStack(home), routeNames: undefined }],
      ["home key unknown", { ...appStack(home), key: undefined }],
      ["home index unknown", { ...appStack(home), index: undefined }],
      ["home index out of range", { ...appStack(home), index: 1 }],
      ["reduced home snapshot", { index: 0, routes: [home] }],
    ] as const)("rejects unproven home: %s", (_case, state) => {
      expect(shouldReleaseAccountTransition([], shape(state))).toBe(false);
    });
    test.each([
      ["preloaded old scene", { preloadedRoutes: [old] }],
      ["type omitted", { type: undefined }],
      ["empty type", { type: "" }],
      ["stale", { stale: true }],
      ["hydration unknown", { stale: undefined }],
      ["key unknown", { key: undefined }],
      ["index unknown", { index: undefined }],
      ["index out of range", { index: 1 }],
      ["routeNames unknown", { routeNames: undefined }],
      ["active route not registered", { routeNames: ["other"] }],
      ["missing child state", { routes: [{ name: "__root" }] }],
    ] as const)("rejects unproven wrapper: %s", (_case, override) => {
      // shape=wrapped checks another ancestor as well as the immediate wrapper.
      expect(shouldReleaseAccountTransition([], shape({ ...wrapped(appStack(home)), ...override }))).toBe(false);
    });
    test("preloadedRoutes may be absent, but a present collection must be empty", () => {
      const root = shape({ ...appStack(home), preloadedRoutes: undefined });
      expect(shouldReleaseAccountTransition([], { ...root, preloadedRoutes: undefined })).toBe(true);
    });
  });

  test("the old top-level index proof rejects the repository's __root fixture", () => {
    const root = wrapped(appStack(home));
    const oldProof = root.routes.length === 1 && root.routes[0].name === "index";
    expect(oldProof).toBe(false);
    expect(shouldReleaseAccountTransition([], root)).toBe(true);
    // Gate/motion fixtures prove visibility, not ownership/hydration.
    expect(shouldReleaseAccountTransition([], wrapped({ index: 0, routes: [home] }))).toBe(false);
  });

  test("every wrapper must contain exactly one route, including unfocused siblings", () => {
    const root = wrapped(appStack(home));
    expect(shouldReleaseAccountTransition([], wrapped(root))).toBe(true);
    for (const index of [0, 1]) {
      const retained = { ...root, index, routes: [...root.routes, old] };
      expect(shouldReleaseAccountTransition([], retained)).toBe(false);
      expect(shouldReleaseAccountTransition([], wrapped(retained))).toBe(false);
    }
  });

  test("unknown state and auth descendants cannot supply a home proof", () => {
    expect(shouldReleaseAccountTransition([], undefined)).toBe(false);
    expect(shouldReleaseAccountTransition([], { ...wrapped(appStack(home)), routes: [{ name: "__root" }] })).toBe(false);
    expect(shouldReleaseAccountTransition([], { routes: [] })).toBe(false);
    expect(shouldReleaseAccountTransition([], { ...wrapped(appStack(home)), routeNames: ["(auth)"], routes: [{ name: "(auth)", state: appStack(home) }] })).toBe(false);
    expect(shouldReleaseAccountTransition([], { ...appStack(home), type: "tab" })).toBe(false);
  });

  test("malformed collections and cyclic wrappers fail closed without throwing or hanging", () => {
    const cyclic = wrapped(appStack(home));
    cyclic.routes[0].state = cyclic;
    for (const state of [cyclic, { ...appStack(home), preloadedRoutes: null },
      { ...appStack(home), routes: undefined }, { ...appStack(home), routes: [null] },
      { ...appStack(home), routeNames: "index" }, { ...appStack(home), type: 1 }]) {
      expect(shouldReleaseAccountTransition([], state as State)).toBe(false);
    }
  });

  test("an empty hydrated route list cannot prove home even with index zero", () => {
    expect(shouldReleaseAccountTransition([], { ...appStack(), index: 0 })).toBe(false);
  });

  test("wrapped proof cannot clear an unpublished or newer owner; release changes the scene epoch", () => {
    __resetAccountEpochForTests();
    noteResolvedOwner("owner-a");
    const oldSceneEpoch = currentAccountEpoch();
    beginAccountOwnerTransition("owner-b");
    expect(shouldReleaseAccountTransition([], wrapped(appStack(home)))).toBe(true);
    expect(clearAccountTransition(currentAccountEpoch())).toBe(false);
    noteResolvedOwner("owner-b");
    const bEpoch = currentAccountEpoch();
    noteResolvedOwner("owner-c");
    expect(clearAccountTransition(bEpoch)).toBe(false);
    expect(isAccountTransitionPending()).toBe(true);
    expect(clearAccountTransition(currentAccountEpoch())).toBe(true);
    expect(currentAccountEpoch()).not.toBe(oldSceneEpoch);
  });
});
