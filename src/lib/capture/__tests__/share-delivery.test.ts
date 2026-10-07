// Android share -> /capture, signed in only (Simon 2026-10-07, Q-261005-05).
//
// The rule: a share fills the capture input only for someone signed in with a
// complete profile, with no password reset, encrypted-storage recovery or
// first-run avatar setup under way. Any other share is dropped, never kept or
// handed to the next account, and the person sees one line saying so.
// ../share-delivery.ts holds that rule as ids and verdicts (never text).

import {
  SHARE_DELIVERY_MAX_TRACKED,
  __resetShareDeliveriesForTests,
  dismissShareRefusedNotice,
  nativeShareGate,
  parseShareDeliveryId,
  registerShareDelivery,
  settleShareDeliveries,
  shareDeliveryState,
  shareRefusedNoticeVisible,
  subscribeShareDeliveries,
  verdictForAuth,
  type ShareDeliveryAuth,
} from "../share-delivery";

const READY: ShareDeliveryAuth = {
  loading: false,
  userId: "user-a",
  hasProfile: true,
  profileProbeFailed: false,
  recoveryReady: true,
  recoveryUserId: null,
  recoveryPendingGlobal: false,
  storageRecoveryRequired: false,
  avatarSetup: "allow",
};

const auth = (patch: Partial<ShareDeliveryAuth>): ShareDeliveryAuth => ({ ...READY, ...patch });

beforeEach(() => {
  __resetShareDeliveriesForTests();
});

describe("verdictForAuth: who a share may fill", () => {
  test("signed in, profile complete, nothing under way: accepted for that account", () => {
    expect(verdictForAuth(READY)).toEqual({ kind: "accepted", owner: "user-a" });
  });

  test.each<[string, Partial<ShareDeliveryAuth>]>([
    ["signed out", { userId: null }],
    ["profile not complete (a real server answer)", { hasProfile: false }],
    ["password reset for this account", { recoveryUserId: "user-a" }],
    ["password reset pending, owner unknown", { recoveryPendingGlobal: true, userId: null }],
    ["password reset pending over a signed-in account", { recoveryPendingGlobal: true }],
    ["encrypted storage unreadable", { storageRecoveryRequired: true, userId: null }],
    ["encrypted storage unreadable, even before anything else is known", {
      storageRecoveryRequired: true,
      recoveryReady: false,
      loading: true,
    }],
    ["first-run avatar setup redirects away from /capture", { avatarSetup: "setup" }],
  ])("%s: refused", (_label, patch) => {
    expect(verdictForAuth(auth(patch))).toEqual({ kind: "refused" });
  });

  test.each<[string, Partial<ShareDeliveryAuth>]>([
    ["recovery marker not reconciled yet", { recoveryReady: false }],
    ["session still loading", { loading: true }],
    ["profile still loading", { hasProfile: null }],
    ["profile probe failed (retry, not an answer)", { profileProbeFailed: true, hasProfile: false }],
    ["avatar check still running", { avatarSetup: "hold" }],
  ])("%s: not decided yet", (_label, patch) => {
    expect(verdictForAuth(auth(patch))).toBeNull();
  });
});

describe("registry: ids and verdicts only, decided once", () => {
  test("a registered share waits until the account state is known, then is decided once", () => {
    const id = registerShareDelivery();
    expect(settleShareDeliveries(auth({ loading: true }))).toBe(false);
    expect(shareDeliveryState().entries).toEqual([{ id, verdict: null }]);

    expect(settleShareDeliveries(auth({ userId: null }))).toBe(true);
    expect(shareDeliveryState().entries).toEqual([{ id, verdict: { kind: "refused" } }]);

    // Signing in later does not bring the refused share back.
    expect(settleShareDeliveries(READY)).toBe(false);
    expect(shareDeliveryState().entries).toEqual([{ id, verdict: { kind: "refused" } }]);
  });

  test("a later share settled after sign-in does not re-decide an earlier refused one", () => {
    const refused = registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    const later = registerShareDelivery();
    expect(settleShareDeliveries(READY)).toBe(true);
    expect(shareDeliveryState().entries).toEqual([
      { id: refused, verdict: { kind: "refused" } },
      { id: later, verdict: { kind: "accepted", owner: "user-a" } },
    ]);
    expect(nativeShareGate(shareDeliveryState(), String(refused), READY)).toBe("refused");
    expect(nativeShareGate(shareDeliveryState(), String(later), READY)).toBe("allowed");
  });

  test("the registry never holds text: entries are an id and a verdict", () => {
    registerShareDelivery();
    settleShareDeliveries(READY);
    const json = JSON.stringify(shareDeliveryState());
    expect(Object.keys(shareDeliveryState().entries[0]).sort()).toEqual(["id", "verdict"]);
    expect(json).not.toMatch(/text|title|content/);
  });

  test("ids are sequential and only the last SHARE_DELIVERY_MAX_TRACKED are kept", () => {
    const ids = Array.from({ length: SHARE_DELIVERY_MAX_TRACKED + 3 }, () => registerShareDelivery());
    expect(ids[0]).toBe(1);
    expect(shareDeliveryState().entries.map((entry) => entry.id)).toEqual(ids.slice(-SHARE_DELIVERY_MAX_TRACKED));
  });

  test("every change is a new snapshot and notifies subscribers", () => {
    const seen: unknown[] = [];
    const stop = subscribeShareDeliveries(() => seen.push(shareDeliveryState()));
    const before = shareDeliveryState();
    registerShareDelivery();
    settleShareDeliveries(READY);
    stop();
    registerShareDelivery();
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(before);
    expect(seen[1]).not.toBe(seen[0]);
  });
});

describe("the one-line notice", () => {
  test("a refusal raises it once per settle, and dismissing hides it", () => {
    registerShareDelivery();
    registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    const raised = shareDeliveryState();
    expect(raised.refusedNoticeSeq).toBe(1);
    expect(shareRefusedNoticeVisible(raised)).toBe(true);

    dismissShareRefusedNotice(raised.refusedNoticeSeq);
    expect(shareRefusedNoticeVisible(shareDeliveryState())).toBe(false);

    // A later refused share shows it again.
    registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    expect(shareRefusedNoticeVisible(shareDeliveryState())).toBe(true);
  });

  test("an accepted share raises nothing", () => {
    registerShareDelivery();
    settleShareDeliveries(READY);
    expect(shareRefusedNoticeVisible(shareDeliveryState())).toBe(false);
  });

  test("a stale dismiss (older seq) cannot hide a newer refusal", () => {
    registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    dismissShareRefusedNotice(1);
    expect(shareRefusedNoticeVisible(shareDeliveryState())).toBe(true);
    dismissShareRefusedNotice(2);
    expect(shareRefusedNoticeVisible(shareDeliveryState())).toBe(false);
  });
});

describe("parseShareDeliveryId", () => {
  test.each([
    ["1", 1],
    ["42", 42],
    ["0", null],
    ["01", null],
    ["-1", null],
    ["1.5", null],
    ["1e3", null],
    [" 1", null],
    ["9999999999", null],
    ["", null],
    [undefined, null],
    [["1"], null],
    [1, null],
  ])("%j -> %j", (raw, expected) => {
    expect(parseShareDeliveryId(raw)).toBe(expected);
  });
});

describe("nativeShareGate: what the capture screen may read", () => {
  test("no delivery param: not an Android share, behaves as before", () => {
    expect(nativeShareGate(shareDeliveryState(), undefined, auth({ userId: null }))).toBe("not-native");
  });

  test("accepted for this account and allowed now: read it", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("allowed");
  });

  test("not settled yet but the state already allows it: read it (same answer the settle will give)", () => {
    const id = registerShareDelivery();
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("allowed");
  });

  test("not settled and the state is unknown: wait", () => {
    const id = registerShareDelivery();
    expect(nativeShareGate(shareDeliveryState(), String(id), auth({ loading: true }))).toBe("pending");
  });

  test("refused while signed out stays refused after sign-in (the share is dropped, not resumed)", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("refused");
  });

  test("refused during a password reset stays refused after the reset", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(auth({ recoveryUserId: "user-a" }));
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("refused");
  });

  test("accepted for account A is refused for account B", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), String(id), auth({ userId: "user-b" }))).toBe("refused");
  });

  test("accepted, then a password reset starts: not read while it runs, not stripped", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), String(id), auth({ recoveryPendingGlobal: true }))).toBe("pending");
  });

  test("an id this app run never issued, or a malformed one, is refused", () => {
    registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), "999", READY)).toBe("refused");
    expect(nativeShareGate(shareDeliveryState(), "abc", READY)).toBe("refused");
    expect(nativeShareGate(shareDeliveryState(), ["1", "1"], READY)).toBe("refused");
  });

  test("an id that fell out of the window is refused", () => {
    const first = registerShareDelivery();
    for (let i = 0; i < SHARE_DELIVERY_MAX_TRACKED; i += 1) registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), String(first), READY)).toBe("refused");
  });
});
