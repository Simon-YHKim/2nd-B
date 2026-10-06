import {
  DELETION_OP_KEY_PREFIX,
  __setDeletionOpMemoStorageForTests,
  clearDeletionOpMemo,
  deletionOpMemoKey,
  listDeletionOpMemos,
  newDeletionOpId,
  readDeletionOpMemo,
  readDeletionOpMemos,
  writeDeletionOpMemo,
  type DeletionOpMemoStorage,
} from "../deletion-op-memo";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OP1 = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11";
const OP2 = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e12";
const TOKEN = `v1.${"A".repeat(43)}`;

let memory: Map<string, string>;
const storage = (): DeletionOpMemoStorage => ({
  getItem: async (key) => memory.get(key) ?? null,
  setItem: async (key, value) => { memory.set(key, value); },
  removeItem: async (key) => { memory.delete(key); },
  keys: async () => [...memory.keys()],
});

beforeEach(() => {
  memory = new Map();
  __setDeletionOpMemoStorageForTests(storage());
});
afterEach(() => __setDeletionOpMemoStorageForTests(null));

test("one key per request: a second request of the same owner never overwrites the first (D2A-08, DEL-SAFE-04)", async () => {
  await expect(writeDeletionOpMemo({ v: 1, phase: "armed", owner: A, opId: OP1, token: TOKEN, at: 1 })).resolves.toBe(true);
  await expect(writeDeletionOpMemo({ v: 1, phase: "pending", owner: A, opId: OP2, at: 2 })).resolves.toBe(true);
  expect(await listDeletionOpMemos(A)).toEqual([
    { v: 1, phase: "armed", owner: A, opId: OP1, token: TOKEN, at: 1 },
    { v: 1, phase: "pending", owner: A, opId: OP2, at: 2 },
  ]);
  expect(deletionOpMemoKey(A, OP1)).toBe(`${DELETION_OP_KEY_PREFIX}${A}:${OP1}`);
  // The terminal fence keeps its own older key, so old builds still read it.
  expect(deletionOpMemoKey(A, OP1)).not.toContain("account.deletionFence.v1");
});

test("the same request moves through phases under its own key", async () => {
  await writeDeletionOpMemo({ v: 1, phase: "pending", owner: A, opId: OP1, at: 1 });
  await writeDeletionOpMemo({ v: 1, phase: "armed", owner: A, opId: OP1, token: TOKEN, at: 2 });
  await writeDeletionOpMemo({ v: 1, phase: "terminal", owner: A, opId: OP1, at: 3 });
  expect(await readDeletionOpMemo(A, OP1)).toEqual({ v: 1, phase: "terminal", owner: A, opId: OP1, at: 3, tries: 0 });
  expect(memory.size).toBe(1);
  await clearDeletionOpMemo(A, OP1);
  expect(memory.size).toBe(0);
});

test("an old-flow deletion has no number and is kept under `legacy`", async () => {
  await writeDeletionOpMemo({ v: 1, phase: "terminal", owner: A, opId: null, at: 1 });
  expect([...memory.keys()]).toEqual([`${DELETION_OP_KEY_PREFIX}${A}:legacy`]);
  expect(await listDeletionOpMemos()).toEqual([{ v: 1, phase: "terminal", owner: A, opId: null, at: 1, tries: 0 }]);
});

test("filters by owner and skips anything malformed or filed under the wrong key", async () => {
  await writeDeletionOpMemo({ v: 1, phase: "armed", owner: B, opId: OP1, token: TOKEN, at: 5 });
  memory.set(`${DELETION_OP_KEY_PREFIX}${A}:${OP2}`, "not json");
  memory.set(`${DELETION_OP_KEY_PREFIX}${A}:${OP1}`, JSON.stringify({ v: 1, phase: "armed", owner: A, opId: OP1, token: "short", at: 1 }));
  // A memo of B copied under A's key is not trusted.
  memory.set(`${DELETION_OP_KEY_PREFIX}${A}:x`, JSON.stringify({ v: 1, phase: "pending", owner: B, opId: OP2, at: 1 }));
  memory.set("unrelated", JSON.stringify({ v: 1, phase: "pending", owner: A, opId: OP2, at: 1 }));
  expect(await listDeletionOpMemos(A)).toEqual([]);
  expect((await listDeletionOpMemos()).map((memo) => memo.owner)).toEqual([B]);
});

test("a write that does not read back is reported, so execute is never sent", async () => {
  __setDeletionOpMemoStorageForTests({
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    keys: async () => [],
  });
  await expect(writeDeletionOpMemo({ v: 1, phase: "armed", owner: A, opId: OP1, token: TOKEN, at: 1 })).resolves.toBe(false);
  __setDeletionOpMemoStorageForTests({
    getItem: async () => { throw new Error("quota"); },
    setItem: async () => { throw new Error("quota"); },
    removeItem: async () => { throw new Error("quota"); },
    keys: async () => { throw new Error("quota"); },
  });
  await expect(writeDeletionOpMemo({ v: 1, phase: "armed", owner: A, opId: OP1, token: TOKEN, at: 1 })).resolves.toBe(false);
  await expect(listDeletionOpMemos()).resolves.toEqual([]);
  await expect(clearDeletionOpMemo(A, OP1)).resolves.toBeUndefined();
});

test("the in-memory fallback is never reported as remembered (gate DLR-A1-04)", async () => {
  // No override: Node has no localStorage and no native storage, exactly like a
  // browser whose localStorage access throws. The memo still lives for this
  // runtime, but an armed write must not count as durable.
  __setDeletionOpMemoStorageForTests(null);
  await expect(writeDeletionOpMemo({ v: 1, phase: "armed", owner: A, opId: OP1, token: TOKEN, at: 1 })).resolves.toBe(false);
  expect(await readDeletionOpMemo(A, OP1)).toMatchObject({ phase: "armed", opId: OP1 });
});

test("a listing that cannot be read is null, not an empty list", async () => {
  __setDeletionOpMemoStorageForTests({
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    keys: async () => { throw new Error("blocked"); },
  });
  await expect(readDeletionOpMemos(A)).resolves.toBeNull();
  await expect(listDeletionOpMemos(A)).resolves.toEqual([]);
});

test("new request numbers are lowercase UUIDs the server accepts", () => {
  const id = newDeletionOpId();
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(newDeletionOpId()).not.toBe(id);
});
