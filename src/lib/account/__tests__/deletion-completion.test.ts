import {
  finishAccountDeletion,
  resolvePendingAccountDeletionOps,
  settleDeletedAccountLocally,
  type LocalPurgeOutcome,
} from "../deletion-completion";
import {
  PENDING_DELETION_OP_STALE_MS,
  __setDeletionOpMemoStorageForTests,
  deletionOpMemoKey,
  type DeletionOpMemoStorage,
} from "../deletion-op-memo";
import {
  clearDeletionReceiptHandoff,
  deletionReceiptHandoffSnapshot,
} from "../deletion-receipt-handoff";
import type { OpStatusLookup } from "../deletion-receipt";
import type { AccountDeletionReceipt } from "../../records/delete-bulk";
import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OP = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11";
const TOKEN = `v1.${"A".repeat(43)}`;

const RECEIPT: AccountDeletionReceipt = {
  deleted: true,
  opId: OP,
  profileErased: true,
  deletionFenced: true,
  rawClippingsErased: null,
  rawClippingsEmptyAtCheck: true,
  rawClippingsRemoved: 3,
  incomplete: [],
  unconfirmed: ["rawClippings"],
  complete: false,
  observedAtIso: "2026-10-07T00:00:00.000Z",
};

let memory: Map<string, string>;
let order: string[];

function storage(): DeletionOpMemoStorage {
  return {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { order.push(`set:${JSON.parse(value).phase}`); memory.set(key, value); },
    removeItem: async (key) => { order.push("remove"); memory.delete(key); },
    keys: async () => [...memory.keys()],
  };
}

function put(memo: Record<string, unknown>) {
  memory.set(deletionOpMemoKey(memo.owner as string, (memo.opId as string | null) ?? null), JSON.stringify({ v: 1, ...memo }));
}

beforeEach(() => {
  memory = new Map();
  order = [];
  __setDeletionOpMemoStorageForTests(storage());
  clearDeletionReceiptHandoff();
  __resetAccountEpochForTests();
  noteResolvedOwner(OWNER);
});
afterEach(() => {
  __setDeletionOpMemoStorageForTests(null);
  clearDeletionReceiptHandoff();
});

describe("settleDeletedAccountLocally: the wipe runs only after the server confirmed (I7)", () => {
  test("writes the terminal memo first, then forgets it once the wipe is confirmed", async () => {
    const purge = jest.fn(async () => { order.push("purge"); return "complete" as const; });
    await expect(settleDeletedAccountLocally({ owner: OWNER, opId: OP, purgeLocal: purge })).resolves.toBe("complete");
    expect(order).toEqual(["set:terminal", "purge", "remove"]);
    expect(memory.size).toBe(0);
  });

  test.each([
    ["unconfirmed", async (): Promise<LocalPurgeOutcome> => "unconfirmed"],
    ["throws", async (): Promise<LocalPurgeOutcome> => { throw new Error("storage busy"); }],
  ])("an unconfirmed wipe (%s) keeps the terminal memo for the next pass", async (_label, purge) => {
    await expect(settleDeletedAccountLocally({ owner: OWNER, opId: OP, purgeLocal: purge })).resolves.toBe("retry-scheduled");
    expect(JSON.parse(memory.get(deletionOpMemoKey(OWNER, OP))!)).toMatchObject({ phase: "terminal", owner: OWNER, opId: OP });
  });

  test("a cleanup that can never be confirmed (no Web Locks) stops after a bounded number of tries", async () => {
    const purge = jest.fn(async (): Promise<LocalPurgeOutcome> => "unconfirmed");
    await expect(settleDeletedAccountLocally({ owner: OWNER, opId: OP, purgeLocal: purge })).resolves.toBe("retry-scheduled");
    put({ phase: "terminal", owner: OWNER, opId: OP, at: 1, tries: 1 });
    await resolvePendingAccountDeletionOps({ stillSignedOut: () => true, purgeLocal: purge });
    expect(JSON.parse(memory.get(deletionOpMemoKey(OWNER, OP))!).tries).toBe(2);
    await resolvePendingAccountDeletionOps({ stillSignedOut: () => true, purgeLocal: purge });
    expect(memory.size).toBe(0);
    expect(purge).toHaveBeenCalledTimes(3);
  });

  test("without durable storage an unconfirmed wipe is reported as unconfirmed, not scheduled", async () => {
    __setDeletionOpMemoStorageForTests({
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
      keys: async () => [],
    });
    await expect(settleDeletedAccountLocally({ owner: OWNER, opId: OP, purgeLocal: async () => "unconfirmed" }))
      .resolves.toBe("unconfirmed");
  });
});

describe("finishAccountDeletion", () => {
  function deps(overrides: Partial<Parameters<typeof finishAccountDeletion>[0]> = {}) {
    const calls: string[] = [];
    const input: Parameters<typeof finishAccountDeletion>[0] = {
      owner: OWNER,
      receipt: RECEIPT,
      purgeLocal: async () => { calls.push("purge"); return "complete"; },
      signOut: async () => { calls.push("signOut"); },
      isOwnerChangedError: (error) => error instanceof Error && error.message === "owner-changed",
      openReceipt: () => calls.push("openReceipt"),
      leaveReceipt: () => calls.push("leaveReceipt"),
      ...overrides,
    };
    return { input, calls };
  }

  test("wipes, opens the receipt route, then signs the deleted owner out", async () => {
    const { input, calls } = deps();
    await expect(finishAccountDeletion(input)).resolves.toEqual({
      kind: "done",
      localPurge: "complete",
      localSignOut: "complete",
    });
    expect(calls).toEqual(["purge", "openReceipt", "signOut"]);
    // The handoff carries the number and this device's own results, not the receipt.
    expect(deletionReceiptHandoffSnapshot()).toMatchObject({
      owner: OWNER,
      opId: OP,
      observed: null,
      localPurge: "complete",
      localSignOut: "complete",
    });
  });

  test("a failed sign-out is reported, not turned into a deletion failure", async () => {
    const { input } = deps({ signOut: async () => { throw new Error("offline"); } });
    await expect(finishAccountDeletion(input)).resolves.toMatchObject({ kind: "done", localSignOut: "unconfirmed" });
    expect(deletionReceiptHandoffSnapshot()?.localSignOut).toBe("unconfirmed");
  });

  test("B already signed in: the wipe still runs for A, but no receipt route and no sign-out", async () => {
    noteResolvedOwner(OTHER);
    const { input, calls } = deps();
    await expect(finishAccountDeletion(input)).resolves.toEqual({ kind: "owner-changed" });
    expect(calls).toEqual(["purge"]);
    expect(deletionReceiptHandoffSnapshot()).toBeNull();
  });

  test("B appears during the sign-out: keep B and leave the receipt route", async () => {
    const { input, calls } = deps({ signOut: async () => { throw new Error("owner-changed"); } });
    await expect(finishAccountDeletion(input)).resolves.toEqual({ kind: "owner-changed" });
    expect(calls).toEqual(["purge", "openReceipt", "leaveReceipt"]);
  });

  test("the handoff drops the moment another account is published", async () => {
    const { input } = deps();
    await finishAccountDeletion(input);
    noteResolvedOwner(null);
    expect(deletionReceiptHandoffSnapshot()?.opId).toBe(OP);
    noteResolvedOwner(OTHER);
    expect(deletionReceiptHandoffSnapshot()).toBeNull();
  });

  test("an old-flow deletion (no number) carries what the server answered this device", async () => {
    const { input } = deps({ receipt: { ...RECEIPT, opId: null } });
    await finishAccountDeletion(input);
    expect(deletionReceiptHandoffSnapshot()).toMatchObject({
      opId: null,
      observed: { profileErased: true, deletionFenced: true, rawClippingsErased: null, rawClippingsEmptyAtCheck: true },
    });
  });
});

describe("resolvePendingAccountDeletionOps: only a definite server answer changes anything (I5)", () => {
  const known = (op: "completed" | "failed" | "abandoned" | "executing"): OpStatusLookup => ({
    status: "known",
    op,
    receipt: op === "completed"
      ? {
          opId: OP,
          erasedAtIso: "2026-10-07T00:00:00.000Z",
          expiresAtIso: "2027-10-07T00:00:00.000Z",
          sweeps: { profileErased: true, deletionFenced: true, rawClippingsErased: true, rawClippingsEmptyAtCheck: true },
          sweepsReported: true,
          unrecorded: false,
        }
      : null,
  });

  test("completed: wipes that owner's data, forgets the request, and offers its receipt once", async () => {
    put({ phase: "armed", owner: OWNER, opId: OP, token: TOKEN, at: 1 });
    const purge = jest.fn(async () => "complete" as const);
    const lookup = jest.fn(async () => known("completed"));
    await expect(resolvePendingAccountDeletionOps({ stillSignedOut: () => true, purgeLocal: purge, lookup }))
      .resolves.toEqual({ completed: { owner: OWNER, opId: OP, localPurge: "complete" } });
    expect(lookup).toHaveBeenCalledWith({ opId: OP, token: TOKEN, owner: OWNER });
    expect(purge).toHaveBeenCalledWith(OWNER);
    expect(memory.size).toBe(0);
  });

  test.each(["failed", "abandoned"] as const)("%s: forgets the request without wiping anything", async (op) => {
    put({ phase: "armed", owner: OWNER, opId: OP, token: TOKEN, at: 1 });
    const purge = jest.fn(async () => "complete" as const);
    await expect(resolvePendingAccountDeletionOps({
      stillSignedOut: () => true,
      purgeLocal: purge,
      lookup: async () => known(op),
    })).resolves.toEqual({ completed: null });
    expect(purge).not.toHaveBeenCalled();
    expect(memory.size).toBe(0);
  });

  test.each([
    ["unknown (network)", { status: "unavailable" } as OpStatusLookup],
    ["not found", { status: "not-found" } as OpStatusLookup],
    ["still executing", known("executing")],
  ])("%s: keeps the request and asks again next time", async (_label, answer) => {
    put({ phase: "armed", owner: OWNER, opId: OP, token: TOKEN, at: 1 });
    const purge = jest.fn(async () => "complete" as const);
    await resolvePendingAccountDeletionOps({ stillSignedOut: () => true, purgeLocal: purge, lookup: async () => answer });
    expect(purge).not.toHaveBeenCalled();
    expect(memory.has(deletionOpMemoKey(OWNER, OP))).toBe(true);
  });

  test("a pending memo is cleared only once it is stale (no token = nothing ran)", async () => {
    put({ phase: "pending", owner: OWNER, opId: OP, at: 1_000 });
    await resolvePendingAccountDeletionOps({
      stillSignedOut: () => true,
      purgeLocal: async () => "complete",
      lookup: async () => known("completed"),
      now: () => 1_000 + PENDING_DELETION_OP_STALE_MS - 1,
    });
    expect(memory.size).toBe(1);
    await resolvePendingAccountDeletionOps({
      stillSignedOut: () => true,
      purgeLocal: async () => "complete",
      now: () => 1_000 + PENDING_DELETION_OP_STALE_MS,
    });
    expect(memory.size).toBe(0);
  });

  test("a terminal memo re-runs the wipe without offering a receipt again", async () => {
    put({ phase: "terminal", owner: OWNER, opId: OP, at: 1 });
    const purge = jest.fn(async () => "complete" as const);
    await expect(resolvePendingAccountDeletionOps({ stillSignedOut: () => true, purgeLocal: purge }))
      .resolves.toEqual({ completed: null });
    expect(purge).toHaveBeenCalledWith(OWNER);
    expect(memory.size).toBe(0);
  });

  test("a sign-in stops the pass before it asks the server", async () => {
    put({ phase: "armed", owner: OWNER, opId: OP, token: TOKEN, at: 1 });
    const lookup = jest.fn(async () => known("completed"));
    await resolvePendingAccountDeletionOps({ stillSignedOut: () => false, purgeLocal: async () => "complete", lookup });
    expect(lookup).not.toHaveBeenCalled();
    expect(memory.size).toBe(1);
  });

  test("a sign-in during the server question leaves the request for later", async () => {
    put({ phase: "armed", owner: OWNER, opId: OP, token: TOKEN, at: 1 });
    let signedOut = true;
    const purge = jest.fn(async () => "complete" as const);
    await resolvePendingAccountDeletionOps({
      stillSignedOut: () => signedOut,
      purgeLocal: purge,
      lookup: async () => { signedOut = false; return known("completed"); },
    });
    expect(purge).not.toHaveBeenCalled();
    expect(memory.size).toBe(1);
  });
});
