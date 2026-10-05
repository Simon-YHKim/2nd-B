// finishAccountDeletion: the local half of a CONFIRMED account erasure.
//
// This file used to pin an in-memory notice store (createAccountDeletionCompletion
// and friends). Simon decided on 2026-10-05 (Q-261004-42 = A) that the app must
// not be the one delivering the deletion receipt: the server records it (0217)
// and the app only opens /account-deleted with the receipt NUMBER. What is left
// to pin is the order of the local steps and the rule that another account
// never gets routed to A's receipt (PR #2054 gates DEL-N1-01 / DEL-N2-01).
import { finishAccountDeletion, type FinishAccountDeletionDeps } from "../deletion-completion";
import { parseAccountDeletedParams } from "../deletion-receipt";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const RECEIPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

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

function deps(overrides: Partial<FinishAccountDeletionDeps> = {}) {
  const calls: string[] = [];
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
    readOwner: () => ({ published: null, pending: undefined }),
  };
  return { deps: { ...base, ...overrides }, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("purges first, then signs out exactly once, then opens the receipt route", async () => {
  const { deps: d, calls } = deps();
  const result = await finishAccountDeletion(d);
  await flush();
  expect(calls.slice(0, 2)).toEqual(["purge", "signOut"]);
  expect(calls).toContain("clearPending");
  expect(d.purgeLocal).toHaveBeenCalledWith(OWNER);
  expect(result.kind).toBe("show-receipt");
  if (result.kind !== "show-receipt") return;
  const query = Object.fromEntries(new URLSearchParams(result.href.split("?")[1]));
  expect(result.href.startsWith("/account-deleted?")).toBe(true);
  expect(parseAccountDeletedParams(query)).toEqual({
    receiptId: RECEIPT_ID,
    localPurge: "complete",
    localSignOut: "complete",
    fromDeletion: true,
  });
});

test("the route carries only the receipt number and two local observations, never the owner", async () => {
  const { deps: d } = deps();
  const result = await finishAccountDeletion(d);
  if (result.kind !== "show-receipt") throw new Error("expected the receipt route");
  expect(result.href).not.toContain(OWNER);
  expect([...new URLSearchParams(result.href.split("?")[1]).keys()].sort())
    .toEqual(["done", "local", "receipt", "signout"]);
});

test("a local purge failure never turns a confirmed erasure into a failure", async () => {
  const { deps: d } = deps({
    purgeLocal: jest.fn(async () => {
      throw new Error("storage");
    }),
  });
  const result = await finishAccountDeletion(d);
  expect(d.signOut).toHaveBeenCalledTimes(1);
  expect(result.kind).toBe("show-receipt");
  // A server receipt exists, so the note keeps it for the next signed-out screen.
  expect(d.notePending).toHaveBeenCalledWith(OWNER, RECEIPT_ID);
  expect(result.kind === "show-receipt" && result.localPurge).toBe("retry-scheduled");
  expect(d.clearPending).not.toHaveBeenCalled();
});

test("without a server receipt an unfinished purge is reported as unconfirmed, not scheduled", async () => {
  const { deps: d } = deps({ receipt: receipt(null), purgeLocal: jest.fn(async () => "unconfirmed" as const) });
  const result = await finishAccountDeletion(d);
  expect(d.notePending).not.toHaveBeenCalled();
  expect(result.kind === "show-receipt" && result.localPurge).toBe("unconfirmed");
  if (result.kind === "show-receipt") expect(result.href).not.toContain("receipt=");
});

test("a sign-out failure is reported, not retried, and the receipt still opens", async () => {
  const { deps: d } = deps({
    signOut: jest.fn(async () => {
      throw new Error("lock timeout");
    }),
  });
  const result = await finishAccountDeletion(d);
  expect(result).toMatchObject({ kind: "show-receipt", localSignOut: "unconfirmed" });
});

test("B owning local auth keeps B signed in and never routes B to A's receipt", async () => {
  const { deps: d } = deps({
    signOut: jest.fn(async () => {
      throw new OwnerChanged();
    }),
  });
  const result = await finishAccountDeletion(d);
  expect(result.kind).toBe("owner-changed");
  // A's local data is still purged: it is owner-scoped and A is gone.
  expect(d.purgeLocal).toHaveBeenCalledWith(OWNER);
});

test.each([
  ["published B", { published: OTHER, pending: undefined }],
  ["a held login for B (DEL-N2-01)", { published: null, pending: OTHER }],
])("%s at the end suppresses the receipt route", async (_label, owner) => {
  const { deps: d } = deps({ readOwner: () => owner });
  const result = await finishAccountDeletion(d);
  expect(result.kind).toBe("owner-changed");
});

test.each([
  ["signed out", { published: null, pending: undefined }],
  ["a sign-out hold", { published: OWNER, pending: null }],
  ["A still published (sign-out not landed yet)", { published: OWNER, pending: undefined }],
])("%s still opens the receipt route", async (_label, owner) => {
  const { deps: d } = deps({ readOwner: () => owner });
  const result = await finishAccountDeletion(d);
  expect(result.kind).toBe("show-receipt");
});

test("a hanging pending-note cleanup cannot hold the result (DEL-BL-05)", async () => {
  const { deps: d } = deps({ clearPending: () => new Promise(() => undefined) });
  await expect(finishAccountDeletion(d)).resolves.toMatchObject({ kind: "show-receipt" });
});
