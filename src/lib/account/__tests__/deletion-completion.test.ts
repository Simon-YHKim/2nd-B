// finishAccountDeletion: the local half of a CONFIRMED account erasure.
//
// This file used to pin an in-memory notice store (createAccountDeletionCompletion
// and friends). Simon decided on 2026-10-05 (Q-261004-42 = A) that the app must
// not be the one delivering the deletion receipt: the server records it (0217)
// and the app only opens /account-deleted with the receipt NUMBER. What is left
// to pin is the order of the local steps and the rule that another account
// never ends up on A's receipt (PR #2054 gates DEL-N1-01 / DEL-N2-01).
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
    reportSignOut: jest.fn((outcome) => {
      calls.push(`report:${outcome}`);
    }),
    leaveReceipt: jest.fn(() => {
      calls.push("leave");
    }),
  };
  return { deps: { ...base, ...overrides }, calls, opened };
}

const params = (href: string) =>
  parseAccountDeletedParams(Object.fromEntries(new URLSearchParams(href.split("?")[1])));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("purges, opens the receipt route, then signs out and reports how it ended", async () => {
  const { deps: d, calls, opened } = deps();
  const result = await finishAccountDeletion(d);
  await flush();
  expect(calls.filter((call) => call !== "clearPending")).toEqual(["purge", "open", "signOut", "report:complete"]);
  expect(calls).toContain("clearPending");
  expect(d.purgeLocal).toHaveBeenCalledWith(OWNER);
  expect(opened[0].startsWith("/account-deleted?")).toBe(true);
  // The route opens before sign-out, so it cannot claim the sign-out yet.
  expect(params(opened[0])).toEqual({
    receiptId: RECEIPT_ID, localPurge: "complete", localSignOut: null, fromDeletion: true,
  });
  expect(result.kind).toBe("show-receipt");
  if (result.kind !== "show-receipt") return;
  expect(params(result.href)).toEqual({
    receiptId: RECEIPT_ID, localPurge: "complete", localSignOut: "complete", fromDeletion: true,
  });
});

test("the route carries only the receipt number and local observations, never the owner", async () => {
  const { deps: d, opened } = deps();
  const result = await finishAccountDeletion(d);
  if (result.kind !== "show-receipt") throw new Error("expected the receipt route");
  for (const href of [opened[0], result.href]) {
    expect(href).not.toContain(OWNER);
    expect([...new URLSearchParams(href.split("?")[1]).keys()].every((key) =>
      ["done", "local", "receipt", "signout"].includes(key))).toBe(true);
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
  expect(params(opened[0]).localPurge).toBe("retry-scheduled");
  expect(d.clearPending).not.toHaveBeenCalled();
});

test("without a server receipt an unfinished purge is reported as unconfirmed, not scheduled", async () => {
  const { deps: d, opened } = deps({ receipt: receipt(null), purgeLocal: jest.fn(async () => "unconfirmed" as const) });
  await finishAccountDeletion(d);
  expect(d.notePending).not.toHaveBeenCalled();
  expect(params(opened[0]).localPurge).toBe("unconfirmed");
  expect(opened[0]).not.toContain("receipt=");
});

test("a sign-out failure is reported, not retried, and the receipt stays open", async () => {
  const { deps: d, calls } = deps({
    signOut: jest.fn(async () => {
      throw new Error("lock timeout");
    }),
  });
  const result = await finishAccountDeletion(d);
  expect(result).toMatchObject({ kind: "show-receipt", localSignOut: "unconfirmed" });
  expect(calls).toContain("report:unconfirmed");
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
  expect(d.reportSignOut).not.toHaveBeenCalled();
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
