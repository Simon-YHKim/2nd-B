// finishAccountDeletion: the local half of a CONFIRMED account erasure.
//
// This file used to pin an in-memory notice store (createAccountDeletionCompletion
// and friends). Simon decided on 2026-10-05 (Q-261004-42 = A) that the app must
// not be the one delivering the deletion receipt: the server records it (0217)
// and the app only opens /account-deleted with the receipt NUMBER. What is left
// to pin is the order of the local steps and the rule that another account
// never ends up on A's receipt (PR #2054 gates DEL-N1-01 / DEL-N2-01).
//
// The local results now travel through a one-time outcome bound to the route
// token, never as URL claims (gates DEL2-R1-05 / D2A-06), and a failed
// sign-out can be retried for that exact owner only (D2A-07).
import {
  finishAccountDeletion,
  retryDeletedOwnerSignOut,
  type FinishAccountDeletionDeps,
} from "../deletion-completion";
import {
  __resetLocalDeletionOutcomeForTests,
  localDeletionOutcomeSnapshot,
} from "../deletion-local-outcome";
import { parseAccountDeletedParams } from "../deletion-receipt";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const RECEIPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OP = "33333333-3333-4333-8333-333333333333";

beforeEach(() => __resetLocalDeletionOutcomeForTests());

const receipt = (receiptId: string | null = RECEIPT_ID) => ({
  deleted: true as const,
  receiptId,
  profileErased: true,
  deletionFenced: true,
  rawClippingsErased: true,
  rawClippingsEmptyAtCheck: true,
  rawClippingsRemoved: 0,
  incomplete: [],
  unconfirmed: [],
  complete: true,
  observedAtIso: "2026-10-05T12:00:00.000Z",
});

class OwnerChanged extends Error {}

type Owner = { published: string | null; pending: string | null | undefined };

function deps(overrides: Partial<FinishAccountDeletionDeps> = {}, owners: Owner[] = []) {
  const calls: string[] = [];
  const opened: string[] = [];
  let readCount = 0;
  const base: FinishAccountDeletionDeps = {
    owner: OWNER,
    receipt: receipt(),
    purgeLocal: jest.fn(async () => {
      calls.push("purge");
      return "complete" as const;
    }),
    signOut: jest.fn(async () => {
      calls.push("signOut");
    }),
    isOwnerChangedError: (error) => error instanceof OwnerChanged,
    clearPending: jest.fn(async () => {
      calls.push("clearPending");
      return true;
    }),
    notePending: jest.fn(async () => {
      calls.push("notePending");
      return true;
    }),
    // Successive reads return the listed snapshots; the last one repeats.
    readOwner: () => owners[Math.min(readCount++, owners.length - 1)] ?? { published: null, pending: undefined },
    openReceipt: jest.fn((href: string) => {
      calls.push("open");
      opened.push(href);
    }),
    leaveReceipt: jest.fn(() => {
      calls.push("leave");
    }),
    newToken: () => OP,
  };
  return { deps: { ...base, ...overrides }, calls, opened };
}

const params = (href: string) =>
  parseAccountDeletedParams(Object.fromEntries(new URLSearchParams(href.split("?")[1])));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("purges, opens the receipt route, then signs out and reports how it ended", async () => {
  let atOpen: unknown = undefined;
  const { deps: d, calls, opened } = deps({
    openReceipt: jest.fn((href: string) => {
      calls.push("open");
      opened.push(href);
      atOpen = localDeletionOutcomeSnapshot();
    }),
  });
  const result = await finishAccountDeletion(d);
  await flush();
  expect(calls.filter((call) => call !== "clearPending")).toEqual(["purge", "open", "signOut"]);
  expect(calls).toContain("clearPending");
  expect(d.purgeLocal).toHaveBeenCalledWith(OWNER);
  expect(opened[0].startsWith("/account-deleted?")).toBe(true);
  expect(params(opened[0])).toEqual({ receiptId: RECEIPT_ID, op: OP });
  // The route opens before sign-out, so it cannot claim the sign-out yet.
  expect(atOpen).toEqual({ token: OP, owner: OWNER, receiptId: RECEIPT_ID, localPurge: "complete", localSignOut: null });
  expect(localDeletionOutcomeSnapshot()).toEqual({
    token: OP, owner: OWNER, receiptId: RECEIPT_ID, localPurge: "complete", localSignOut: "complete",
  });
  expect(result.kind).toBe("show-receipt");
  if (result.kind !== "show-receipt") return;
  expect(params(result.href)).toEqual({ receiptId: RECEIPT_ID, op: OP });
});

test("the route carries only the receipt number and an opaque token, never the owner or a claim", async () => {
  const { deps: d, opened } = deps();
  const result = await finishAccountDeletion(d);
  if (result.kind !== "show-receipt") throw new Error("expected the receipt route");
  for (const href of [opened[0], result.href]) {
    expect(href).not.toContain(OWNER);
    expect([...new URLSearchParams(href.split("?")[1]).keys()].sort()).toEqual(["op", "receipt"]);
  }
});

test("a local purge failure never turns a confirmed erasure into a failure", async () => {
  const { deps: d, opened } = deps({
    purgeLocal: jest.fn(async () => {
      throw new Error("storage");
    }),
  });
  const result = await finishAccountDeletion(d);
  expect(d.signOut).toHaveBeenCalledTimes(1);
  expect(result.kind).toBe("show-receipt");
  // A server receipt exists, so the note keeps it for the next signed-out screen.
  expect(d.notePending).toHaveBeenCalledWith(OWNER, RECEIPT_ID);
  expect(params(opened[0]).receiptId).toBe(RECEIPT_ID);
  expect(localDeletionOutcomeSnapshot()?.localPurge).toBe("retry-scheduled");
  expect(d.clearPending).not.toHaveBeenCalled();
});

test("without a server receipt an unfinished purge is reported as unconfirmed, not scheduled", async () => {
  const { deps: d, opened } = deps({ receipt: receipt(null), purgeLocal: jest.fn(async () => "unconfirmed" as const) });
  await finishAccountDeletion(d);
  expect(d.notePending).not.toHaveBeenCalled();
  expect(localDeletionOutcomeSnapshot()).toMatchObject({ receiptId: null, localPurge: "unconfirmed" });
  expect(opened[0]).not.toContain("receipt=");
});

test("a number whose receipt could not be checked goes to the route as unconfirmed (D2A-03)", async () => {
  // The erasure is confirmed; only the receipt lookup failed. The route asks the
  // server again instead of being told no receipt was recorded.
  const unconfirmed = { ...receipt(null), unconfirmedReceiptId: RECEIPT_ID };
  const { deps: d, opened } = deps({ receipt: unconfirmed });
  const result = await finishAccountDeletion(d);
  expect(params(opened[0])).toEqual({ receiptId: RECEIPT_ID, op: OP });
  expect(localDeletionOutcomeSnapshot()).toMatchObject({ receiptId: RECEIPT_ID, receiptUnconfirmed: true });
  expect(result.kind === "show-receipt" && params(result.href).receiptId).toBe(RECEIPT_ID);

  // An unproven number never backs a "retry recorded" claim for an unfinished purge.
  __resetLocalDeletionOutcomeForTests();
  const { deps: d2 } = deps({ receipt: unconfirmed, purgeLocal: jest.fn(async () => "unconfirmed" as const) });
  await finishAccountDeletion(d2);
  expect(d2.notePending).not.toHaveBeenCalled();
  expect(localDeletionOutcomeSnapshot()?.localPurge).toBe("unconfirmed");

  // A proven number is never marked unconfirmed, even if both fields arrive.
  __resetLocalDeletionOutcomeForTests();
  const { deps: d3 } = deps({ receipt: { ...receipt(), unconfirmedReceiptId: OTHER } });
  await finishAccountDeletion(d3);
  expect(localDeletionOutcomeSnapshot()?.receiptId).toBe(RECEIPT_ID);
  expect(localDeletionOutcomeSnapshot()?.receiptUnconfirmed).toBeUndefined();
});

test("a sign-out failure is reported, not retried, and the receipt stays open", async () => {
  const { deps: d, calls } = deps({
    signOut: jest.fn(async () => {
      throw new Error("lock timeout");
    }),
  });
  const result = await finishAccountDeletion(d);
  expect(result).toMatchObject({ kind: "show-receipt", localSignOut: "unconfirmed" });
  expect(calls).not.toContain("leave");
  expect(localDeletionOutcomeSnapshot()?.localSignOut).toBe("unconfirmed");
  expect(d.leaveReceipt).not.toHaveBeenCalled();
});

test("B owning local auth keeps B signed in and takes B off A's receipt", async () => {
  const { deps: d, calls } = deps({
    signOut: jest.fn(async () => {
      throw new OwnerChanged();
    }),
  });
  const result = await finishAccountDeletion(d);
  expect(result.kind).toBe("owner-changed");
  // (this signOut override does not log into `calls`)
  expect(calls.filter((call) => call !== "clearPending")).toEqual(["purge", "open", "leave"]);
  expect(d.signOut).toHaveBeenCalledTimes(1);
  // A's local outcome is forgotten: nothing of A stays for B's screens.
  expect(localDeletionOutcomeSnapshot()).toBeNull();
  // A's local data is still purged: it is owner-scoped and A is gone.
  expect(d.purgeLocal).toHaveBeenCalledWith(OWNER);
});

test.each([
  ["published B", { published: OTHER, pending: undefined }],
  ["a held login for B (DEL-N2-01)", { published: null, pending: OTHER }],
])("%s before the route opens: A's receipt is never opened", async (_label, owner) => {
  const { deps: d } = deps({}, [owner]);
  const result = await finishAccountDeletion(d);
  expect(result.kind).toBe("owner-changed");
  expect(d.openReceipt).not.toHaveBeenCalled();
  expect(d.leaveReceipt).not.toHaveBeenCalled();
  expect(localDeletionOutcomeSnapshot()).toBeNull();
  // A's own session is still ended if it is A's; signOutExpected refuses B's.
  expect(d.signOut).toHaveBeenCalledTimes(1);
});

test.each([
  ["published B", { published: OTHER, pending: undefined }],
  ["a held login for B (DEL-N2-01)", { published: null, pending: OTHER }],
])("%s appearing during sign-out takes the route back down", async (_label, owner) => {
  const { deps: d } = deps({}, [{ published: OWNER, pending: undefined }, owner]);
  const result = await finishAccountDeletion(d);
  expect(result.kind).toBe("owner-changed");
  expect(d.openReceipt).toHaveBeenCalledTimes(1);
  expect(d.leaveReceipt).toHaveBeenCalledTimes(1);
});

test.each([
  ["signed out", { published: null, pending: undefined }],
  ["a sign-out hold", { published: OWNER, pending: null }],
  ["A still published (sign-out not landed yet)", { published: OWNER, pending: undefined }],
])("%s keeps the receipt route", async (_label, owner) => {
  const { deps: d } = deps({}, [owner]);
  const result = await finishAccountDeletion(d);
  expect(result.kind).toBe("show-receipt");
  expect(d.leaveReceipt).not.toHaveBeenCalled();
});

test("a hanging pending-note cleanup cannot hold the result (DEL-BL-05)", async () => {
  const { deps: d } = deps({ clearPending: () => new Promise(() => undefined) });
  await expect(finishAccountDeletion(d)).resolves.toMatchObject({ kind: "show-receipt" });
});

test("a throwing navigation never turns the erasure into a failure", async () => {
  const { deps: d } = deps({
    openReceipt: () => {
      throw new Error("router not ready");
    },
  });
  await expect(finishAccountDeletion(d)).resolves.toMatchObject({ kind: "show-receipt" });
  expect(d.signOut).toHaveBeenCalledTimes(1);
});

describe("retrying the deleted account's sign-out from the receipt route (D2A-07)", () => {
  const outcome = () => ({
    token: OP, owner: OWNER, receiptId: RECEIPT_ID, localPurge: "complete" as const, localSignOut: "unconfirmed" as const,
  });

  test("signs out exactly that owner and records the sign-out", async () => {
    const { deps: d } = deps({ signOut: jest.fn(async () => { throw new Error("lock timeout"); }) });
    await finishAccountDeletion(d);
    const signOut = jest.fn(async () => undefined);
    await expect(retryDeletedOwnerSignOut({
      outcome: localDeletionOutcomeSnapshot()!,
      captureExpectation: async () => ({ userId: OWNER, sessionId: "s" }),
      signOut,
    })).resolves.toBe("complete");
    expect(signOut).toHaveBeenCalledWith({ userId: OWNER, sessionId: "s" });
    expect(localDeletionOutcomeSnapshot()?.localSignOut).toBe("complete");
  });

  test("never signs out another account", async () => {
    const signOut = jest.fn(async () => undefined);
    await expect(retryDeletedOwnerSignOut({
      outcome: outcome(),
      captureExpectation: async () => ({ userId: OTHER }),
      signOut,
    })).resolves.toBe("owner-changed");
    expect(signOut).not.toHaveBeenCalled();
  });

  test("a failure stays unconfirmed and throws nothing", async () => {
    await expect(retryDeletedOwnerSignOut({
      outcome: outcome(),
      captureExpectation: async () => { throw new Error("offline"); },
      signOut: jest.fn(),
    })).resolves.toBe("unconfirmed");
    await expect(retryDeletedOwnerSignOut({
      outcome: outcome(),
      captureExpectation: async () => ({ userId: OWNER }),
      signOut: async () => { throw new Error("lock timeout"); },
    })).resolves.toBe("unconfirmed");
  });
});
