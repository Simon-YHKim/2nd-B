import { receiptScreenView } from "../deletion-receipt-view";
import type { DeletionReceiptHandoff } from "../deletion-receipt-handoff";
import type { ReceiptLookup } from "../deletion-receipt";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OP = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11";
const OTHER_OP = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e12";

const found: ReceiptLookup = {
  status: "found",
  receipt: {
    opId: OP,
    erasedAtIso: "2026-10-07T01:02:03.000Z",
    expiresAtIso: "2027-10-07T01:02:03.000Z",
    sweeps: { profileErased: true, deletionFenced: true, rawClippingsErased: null, rawClippingsEmptyAtCheck: true },
    sweepsReported: true,
    unrecorded: false,
  },
};
const handoff = (overrides: Partial<DeletionReceiptHandoff> = {}): DeletionReceiptHandoff => ({
  owner: A,
  opId: OP,
  observed: null,
  localPurge: "complete",
  localSignOut: "complete",
  at: 0,
  ...overrides,
});
const view = (overrides: Partial<Parameters<typeof receiptScreenView>[0]> = {}) => receiptScreenView({
  authLoading: false,
  userId: null,
  sessionUnavailable: false,
  transitionPending: false,
  opId: OP,
  handoff: null,
  lookup: found,
  ...overrides,
});

describe("a receipt is shown only while nobody is signed in (I6, X1-X3)", () => {
  test("any signed-in account, B included, gets no receipt", () => {
    expect(view({ userId: B }).kind).toBe("signed-in");
    expect(view({ userId: B, handoff: handoff() }).kind).toBe("signed-in");
  });

  test("the deleted account still signed in here waits, or is told its sign-out failed", () => {
    expect(view({ userId: A, handoff: handoff({ localSignOut: null }) }).kind).toBe("waiting");
    expect(view({ userId: A, handoff: handoff({ localSignOut: "unconfirmed" }) }).kind).toBe("signout-unconfirmed");
  });

  test("a held transition or a loading session waits; an unknown session is not signed out", () => {
    expect(view({ transitionPending: true }).kind).toBe("waiting");
    expect(view({ authLoading: true }).kind).toBe("waiting");
    expect(view({ sessionUnavailable: true }).kind).toBe("session-unknown");
  });
});

describe("signed out", () => {
  test("shows the server's receipt; local results only for this device's own request", () => {
    const mine = view({ handoff: handoff() });
    expect(mine).toMatchObject({ kind: "receipt", notice: { opId: OP, localPurge: "complete", localSignOut: "complete" } });
    const someoneElses = view({ handoff: handoff({ opId: OTHER_OP }) });
    expect(someoneElses).toMatchObject({ kind: "receipt", notice: { opId: OP, localPurge: null, localSignOut: null } });
    const typed = view();
    expect(typed).toMatchObject({ kind: "receipt", notice: { localPurge: null } });
  });

  test("keeps none, too many lookups and unknown apart", () => {
    expect(view({ lookup: null }).kind).toBe("loading");
    expect(view({ lookup: { status: "not-found" } }).kind).toBe("not-found");
    expect(view({ lookup: { status: "rate-limited" } }).kind).toBe("rate-limited");
    expect(view({ lookup: { status: "unavailable" } }).kind).toBe("unavailable");
  });

  test("no number: the lookup form, unless this device just finished an old-flow deletion", () => {
    expect(view({ opId: null, lookup: null }).kind).toBe("lookup");
    const old = view({
      opId: null,
      lookup: null,
      handoff: handoff({
        opId: null,
        observed: { profileErased: true, deletionFenced: true, rawClippingsErased: null, rawClippingsEmptyAtCheck: true },
      }),
    });
    expect(old).toMatchObject({ kind: "receipt", notice: { opId: null, sweeps: { profileErased: true } } });
  });
});
