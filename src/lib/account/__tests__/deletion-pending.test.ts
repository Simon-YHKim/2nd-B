// Pending account-deletion notes (Q-261004-42 = A).
//
// The gate findings this replaces (PR #2054): a terminal fence installed before
// the request stayed forever on a live account when the request never reached
// the server (R3-05 / BL-07 / DEL-BL-02); the reversible "intent" that tried to
// fix it had no lease or operation id (DEL-SAFE-01 / DEL-SAFE-04), shared the
// key old builds read as terminal (DEL-SAFE-02), and its cleanup could hold the
// result forever (DEL-BL-05). Each test below names the one it pins.
import {
  MAX_PENDING_DELETION_REQUESTS,
  PENDING_DELETION_LEASE_MS,
  PENDING_STORAGE_TIMEOUT_MS,
  __pendingKeyForTests,
  addPendingAccountDeletion,
  clearPendingAccountDeletion,
  listPendingAccountDeletionOwners,
  parsePendingDeletionRequests,
  readPendingAccountDeletion,
  removePendingAccountDeletion,
  resolveAllPendingAccountDeletions,
  resolvePendingAccountDeletion,
} from "../deletion-pending";
import type { ReceiptLookup } from "../deletion-receipt";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const R2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TERMINAL_KEY = `account.deletionFence.v1:${OWNER}`;

class MemoryStorage {
  readonly map = new Map<string, string>();
  get length() { return this.map.size; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const found = (id: string): ReceiptLookup => ({
  status: "found",
  receipt: {
    id,
    erasedAtIso: "2026-10-05T12:00:00.000Z",
    expiresAtIso: "2027-10-05T12:00:00.000Z",
    sweeps: {
      profile_erased: true, deletion_fenced: true, raw_clippings_erased: true,
      raw_clippings_empty_at_check: true, record_photos_erased: true, record_photos_empty_at_check: true,
    },
    sweepsReported: true,
  },
});

test("a note lives under its own key and never under the terminal marker old builds read (DEL-SAFE-02)", async () => {
  expect(await addPendingAccountDeletion(OWNER, R1, 1_000)).toBe(true);
  expect(__pendingKeyForTests(OWNER)).toBe(`account.deletionPending.v1:${OWNER}`);
  expect(storage.getItem(TERMINAL_KEY)).toBeNull();
  expect(await readPendingAccountDeletion(OWNER)).toEqual([{ id: R1, at: 1_000 }]);
});

test("each request has its own id: dropping one never drops another (DEL-SAFE-04)", async () => {
  await addPendingAccountDeletion(OWNER, R1, 1_000);
  await addPendingAccountDeletion(OWNER, R2.toUpperCase(), 2_000);
  expect(await removePendingAccountDeletion(OWNER, R1)).toBe(true);
  expect(await readPendingAccountDeletion(OWNER)).toEqual([{ id: R2, at: 2_000 }]);
  await removePendingAccountDeletion(OWNER, R2);
  expect(storage.getItem(__pendingKeyForTests(OWNER))).toBeNull();
});

test("owners never share notes", async () => {
  await addPendingAccountDeletion(OWNER, R1, 1_000);
  await addPendingAccountDeletion(OTHER, R2, 1_000);
  await clearPendingAccountDeletion(OWNER);
  expect(await readPendingAccountDeletion(OWNER)).toEqual([]);
  expect(await readPendingAccountDeletion(OTHER)).toEqual([{ id: R2, at: 1_000 }]);
  expect(await listPendingAccountDeletionOwners()).toEqual([OTHER]);
});

test("the note is bounded to the newest requests", async () => {
  const ids = Array.from({ length: MAX_PENDING_DELETION_REQUESTS + 2 }, (_, index) =>
    `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, "0")}`);
  for (const [index, id] of ids.entries()) await addPendingAccountDeletion(OWNER, id, 1_000 + index);
  const kept = await readPendingAccountDeletion(OWNER);
  expect(kept.map((entry) => entry.id)).toEqual(ids.slice(-MAX_PENDING_DELETION_REQUESTS));
});

test("a note that cannot be written and read back is reported, so the request is never sent", async () => {
  storage.setItem = () => { throw new Error("quota"); };
  expect(await addPendingAccountDeletion(OWNER, R1)).toBe(false);
});

test("a storage call that never settles is bounded (DEL-BL-05)", async () => {
  jest.useFakeTimers();
  try {
    storage.getItem = () => new Promise(() => undefined) as unknown as string;
    const added = addPendingAccountDeletion(OWNER, R1);
    await jest.advanceTimersByTimeAsync(PENDING_STORAGE_TIMEOUT_MS + 1);
    await expect(added).resolves.toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

test("garbage in storage reads as no requests - this note never fences anything", () => {
  expect(parsePendingDeletionRequests("terminal")).toEqual([]);
  expect(parsePendingDeletionRequests(JSON.stringify({ v: 2, requests: [] }))).toEqual([]);
  expect(parsePendingDeletionRequests(JSON.stringify({ v: 1, requests: [{ id: "x", at: 1 }, { id: R1, at: -1 }] }))).toEqual([]);
});

describe("resolvePendingAccountDeletion", () => {
  test("a receipt the server recorded resolves the owner as deleted", async () => {
    await addPendingAccountDeletion(OWNER, R1, 1_000);
    const lookup = jest.fn(async (id: string) => found(id));
    await expect(resolvePendingAccountDeletion(OWNER, { lookup, now: () => 2_000 }))
      .resolves.toMatchObject({ kind: "deleted", receipt: { id: R1 } });
  });

  test("not found inside the lease keeps waiting - the request may still be running", async () => {
    await addPendingAccountDeletion(OWNER, R1, 1_000);
    const lookup = jest.fn(async (): Promise<ReceiptLookup> => ({ status: "not-found" }));
    await expect(resolvePendingAccountDeletion(OWNER, { lookup, now: () => 1_000 + PENDING_DELETION_LEASE_MS - 1 }))
      .resolves.toEqual({ kind: "pending" });
    expect(await readPendingAccountDeletion(OWNER)).toHaveLength(1);
  });

  test("not found after the lease drops the request (DEL-SAFE-01: no permanent leftover)", async () => {
    await addPendingAccountDeletion(OWNER, R1, 1_000);
    const lookup = jest.fn(async (): Promise<ReceiptLookup> => ({ status: "not-found" }));
    await expect(resolvePendingAccountDeletion(OWNER, { lookup, now: () => 1_000 + PENDING_DELETION_LEASE_MS }))
      .resolves.toEqual({ kind: "none" });
    expect(storage.getItem(__pendingKeyForTests(OWNER))).toBeNull();
  });

  test("an unreachable lookup is never read as 'not deleted', however old", async () => {
    await addPendingAccountDeletion(OWNER, R1, 1_000);
    const lookup = jest.fn(async (): Promise<ReceiptLookup> => ({ status: "unavailable" }));
    await expect(resolvePendingAccountDeletion(OWNER, { lookup, now: () => 10 * PENDING_DELETION_LEASE_MS }))
      .resolves.toEqual({ kind: "pending" });
    expect(await readPendingAccountDeletion(OWNER)).toHaveLength(1);
  });

  test("a throwing lookup counts as unavailable", async () => {
    await addPendingAccountDeletion(OWNER, R1, 1_000);
    const lookup = jest.fn(async (): Promise<ReceiptLookup> => { throw new Error("boom"); });
    await expect(resolvePendingAccountDeletion(OWNER, { lookup, now: () => 10 * PENDING_DELETION_LEASE_MS }))
      .resolves.toEqual({ kind: "pending" });
  });
});

describe("resolveAllPendingAccountDeletions", () => {
  test("a confirmed erasure is purged (terminal fence inside the purge) and only then forgotten", async () => {
    await addPendingAccountDeletion(OWNER, R1, 1_000);
    await addPendingAccountDeletion(OTHER, R2, 1_000);
    const purge = jest.fn(async () => "complete" as const);
    const lookup = jest.fn(async (id: string): Promise<ReceiptLookup> => id === R1 ? found(id) : { status: "not-found" });
    const result = await resolveAllPendingAccountDeletions({ lookup, purge, now: () => 2_000 });
    expect(result).toEqual({ deleted: [OWNER], pending: [OTHER] });
    expect(purge).toHaveBeenCalledWith(OWNER);
    expect(purge).not.toHaveBeenCalledWith(OTHER);
    expect(await readPendingAccountDeletion(OWNER)).toEqual([]);
    expect(await readPendingAccountDeletion(OTHER)).toHaveLength(1);
  });

  test("an unfinished purge keeps the note so the next sweep retries it", async () => {
    await addPendingAccountDeletion(OWNER, R1, 1_000);
    const purge = jest.fn(async () => "unconfirmed" as const);
    await resolveAllPendingAccountDeletions({ lookup: async (id) => found(id), purge });
    expect(await readPendingAccountDeletion(OWNER)).toHaveLength(1);
  });

  test("nothing pending means nothing is looked up or purged", async () => {
    const purge = jest.fn();
    const lookup = jest.fn();
    await expect(resolveAllPendingAccountDeletions({ lookup, purge })).resolves.toEqual({ deleted: [], pending: [] });
    expect(lookup).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
  });
});
