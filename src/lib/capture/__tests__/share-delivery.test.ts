// Android share -> /capture, signed in only (Simon 2026-10-07, Q-261005-05).
//
// The rule: a share fills the capture input only for someone signed in with a
// complete profile, with no password reset, encrypted-storage recovery or
// first-run avatar setup under way. Any other share is dropped, never kept or
// handed to the next account, and the person sees one line saying so.
// ../share-delivery.ts holds that rule as ids and verdicts (never text).

import {
  __resetAccountEpochForTests,
  beginAccountOwnerTransition,
  noteResolvedOwner,
} from "../../auth/account-epoch";
import {
  SHARE_DELIVERY_MAX_TRACKED,
  __resetShareDeliveriesForTests,
  dismissShareRefusedNotice,
  markShareDeliveryFilled,
  nativeShareGate,
  parseShareDeliveryId,
  refuseShareDelivery,
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
  __resetAccountEpochForTests();
  __resetShareDeliveriesForTests();
});

const verdictOf = (id: number) => shareDeliveryState().entries.find((entry) => entry.id === id)?.verdict;
const noticeSeq = () => shareDeliveryState().refusedNoticeSeq;

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
    // A failed probe waits for a retry the person presses; holding the share
    // until then would bring it back later (gate SHARE-A1-01).
    ["profile probe failed", { profileProbeFailed: true, hasProfile: false }],
  ])("%s: refused", (_label, patch) => {
    expect(verdictForAuth(auth(patch))).toEqual({ kind: "refused" });
  });

  test.each<[string, Partial<ShareDeliveryAuth>]>([
    ["recovery marker not reconciled yet", { recoveryReady: false }],
    ["session still loading", { loading: true }],
    ["profile still loading", { hasProfile: null }],
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

  test("not settled yet, even when the account on screen could fill: wait for the settle (gate SG-01)", () => {
    const id = registerShareDelivery();
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("pending");
    settleShareDeliveries(READY);
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

  test("accepted, then a password reset starts: dropped for good, not read after the reset (gate SHARE-A1-01)", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    const resetting = auth({ recoveryPendingGlobal: true });
    expect(nativeShareGate(shareDeliveryState(), String(id), resetting)).toBe("refused");
    expect(settleShareDeliveries(resetting)).toBe(true);
    expect(verdictOf(id)).toEqual({ kind: "refused" });
    expect(noticeSeq()).toBe(1);
    // The reset is over and the same account is back: still refused.
    expect(settleShareDeliveries(READY)).toBe(false);
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("refused");
  });

  test("accepted, then the profile is read again: wait, then fill (a read is not a loss)", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    const rereading = auth({ hasProfile: null });
    expect(nativeShareGate(shareDeliveryState(), String(id), rereading)).toBe("pending");
    expect(settleShareDeliveries(rereading)).toBe(false);
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("allowed");
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

describe("a share belongs to the account it arrived under (gate SG-01)", () => {
  test("waiting under A, then the account switches straight to B: refused before B can read it", () => {
    noteResolvedOwner("user-a");
    const id = registerShareDelivery();
    expect(settleShareDeliveries(auth({ hasProfile: null }))).toBe(false);
    noteResolvedOwner("user-b");
    expect(verdictOf(id)).toEqual({ kind: "refused" });
    const readyB = auth({ userId: "user-b" });
    expect(nativeShareGate(shareDeliveryState(), String(id), readyB)).toBe("refused");
    expect(settleShareDeliveries(readyB)).toBe(false);
    expect(shareRefusedNoticeVisible(shareDeliveryState())).toBe(true);
  });

  test("accepted for A, then A -> B before it filled: refused, with the notice", () => {
    noteResolvedOwner("user-a");
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    noteResolvedOwner("user-b");
    expect(verdictOf(id)).toEqual({ kind: "refused" });
    expect(noticeSeq()).toBe(1);
  });

  test("waiting under A, then A signs out: refused", () => {
    noteResolvedOwner("user-a");
    const id = registerShareDelivery();
    noteResolvedOwner(null);
    expect(verdictOf(id)).toEqual({ kind: "refused" });
  });

  test("a switch still in progress holds the decision; the switch itself refuses it", () => {
    noteResolvedOwner("user-a");
    const id = registerShareDelivery();
    beginAccountOwnerTransition("user-b");
    // AuthContext still shows A as ready, but A is on its way out.
    expect(settleShareDeliveries(READY)).toBe(false);
    expect(verdictOf(id)).toBeNull();
    noteResolvedOwner("user-b");
    expect(verdictOf(id)).toEqual({ kind: "refused" });
  });

  test("boot: a share that arrives before any account is known waits for the first one", () => {
    const id = registerShareDelivery();
    expect(settleShareDeliveries(auth({ loading: true, userId: null }))).toBe(false);
    noteResolvedOwner("user-a");
    expect(verdictOf(id)).toBeNull();
    expect(settleShareDeliveries(READY)).toBe(true);
    expect(verdictOf(id)).toEqual({ kind: "accepted", owner: "user-a" });
  });

  test("a filled share is left alone by a later switch: it was added, no notice", () => {
    noteResolvedOwner("user-a");
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    markShareDeliveryFilled(String(id), "user-a");
    noteResolvedOwner("user-b");
    expect(verdictOf(id)).toEqual({ kind: "filled" });
    expect(noticeSeq()).toBe(0);
  });
});

describe("waiting is only for the state being read (gate SHARE-A1-01)", () => {
  test("the profile probe fails after the share arrived: refused, and a retry that succeeds does not bring it back", () => {
    const id = registerShareDelivery();
    expect(settleShareDeliveries(auth({ hasProfile: null }))).toBe(false);
    expect(settleShareDeliveries(auth({ profileProbeFailed: true, hasProfile: false }))).toBe(true);
    expect(verdictOf(id)).toEqual({ kind: "refused" });
    expect(settleShareDeliveries(READY)).toBe(false);
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("refused");
  });

  test.each<[string, Partial<ShareDeliveryAuth>]>([
    ["signed out", { userId: null }],
    ["profile no longer complete", { hasProfile: false }],
    ["profile probe failed", { profileProbeFailed: true, hasProfile: false }],
    ["encrypted storage became unreadable", { storageRecoveryRequired: true }],
    ["password reset for this account", { recoveryUserId: "user-a" }],
  ])("accepted, then %s: refused for good", (_label, patch) => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), String(id), auth(patch))).toBe("refused");
    expect(settleShareDeliveries(auth(patch))).toBe(true);
    expect(verdictOf(id)).toEqual({ kind: "refused" });
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("refused");
  });
});

describe("a delivery fills once (gate SHARE-A1-02)", () => {
  test("once the screen filled it, the same id is never read again, even by the same account", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("allowed");
    expect(markShareDeliveryFilled(String(id), "user-a")).toBe(true);
    expect(verdictOf(id)).toEqual({ kind: "filled" });
    expect(nativeShareGate(shareDeliveryState(), String(id), READY)).toBe("refused");
    // Dropping its route afterwards raises nothing: it was added.
    expect(refuseShareDelivery(String(id))).toBe(false);
    expect(noticeSeq()).toBe(0);
  });

  test("only an accepted delivery for that account can be marked filled", () => {
    const waiting = registerShareDelivery();
    expect(markShareDeliveryFilled(String(waiting), "user-a")).toBe(false);
    settleShareDeliveries(READY);
    expect(markShareDeliveryFilled(String(waiting), "user-b")).toBe(false);
    expect(markShareDeliveryFilled(undefined, "user-a")).toBe(false);
    expect(markShareDeliveryFilled("999", "user-a")).toBe(false);
    expect(verdictOf(waiting)).toEqual({ kind: "accepted", owner: "user-a" });
  });
});

describe("a refusal the screen decides shows the line once (gate SHARE-A1-03)", () => {
  test("an id this app run never issued", () => {
    registerShareDelivery();
    settleShareDeliveries(READY);
    expect(refuseShareDelivery("999")).toBe(true);
    expect(shareRefusedNoticeVisible(shareDeliveryState())).toBe(true);
    // A rerender of the same route does not raise it again.
    expect(refuseShareDelivery("999")).toBe(false);
    expect(noticeSeq()).toBe(1);
  });

  test("a malformed value (two values, or the entry point's unreadable 0)", () => {
    expect(refuseShareDelivery(JSON.stringify(["1", "0"]))).toBe(true);
    expect(refuseShareDelivery(JSON.stringify(["1", "0"]))).toBe(false);
    expect(refuseShareDelivery("0")).toBe(true);
    expect(noticeSeq()).toBe(2);
  });

  test("accepted for another account: refused on the spot, once", () => {
    const id = registerShareDelivery();
    settleShareDeliveries(READY);
    expect(nativeShareGate(shareDeliveryState(), String(id), auth({ userId: "user-b" }))).toBe("refused");
    expect(refuseShareDelivery(String(id))).toBe(true);
    expect(verdictOf(id)).toEqual({ kind: "refused" });
    expect(refuseShareDelivery(String(id))).toBe(false);
    expect(noticeSeq()).toBe(1);
  });

  test("already refused by the settle (notice raised then), or still waiting: nothing more", () => {
    const refused = registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    expect(noticeSeq()).toBe(1);
    expect(refuseShareDelivery(String(refused))).toBe(false);
    const waiting = registerShareDelivery();
    expect(refuseShareDelivery(String(waiting))).toBe(false);
    expect(noticeSeq()).toBe(1);
  });

  test("an id that left the window: announced if it left unanswered, silent if it was refused", () => {
    const refused = registerShareDelivery();
    settleShareDeliveries(auth({ userId: null }));
    const open = registerShareDelivery();
    for (let i = 0; i < SHARE_DELIVERY_MAX_TRACKED; i += 1) registerShareDelivery();
    expect(verdictOf(refused)).toBeUndefined();
    expect(verdictOf(open)).toBeUndefined();
    expect(noticeSeq()).toBe(1);
    expect(refuseShareDelivery(String(refused))).toBe(false);
    expect(refuseShareDelivery(String(open))).toBe(true);
    expect(refuseShareDelivery(String(open))).toBe(false);
    expect(noticeSeq()).toBe(2);
  });
});
