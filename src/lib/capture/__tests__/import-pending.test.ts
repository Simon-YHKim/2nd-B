import { createHash } from "node:crypto";

import {
  RECORD_IDEMPOTENCY_CONFLICT,
  importPendingCaptures,
  pendingClientRequestId,
} from "../import-pending";
import {
  addPendingCapture,
  clearPendingCaptures,
  loadPendingCaptures,
  replacePendingCaptures,
} from "../preauth-pending";

const noStorage = typeof localStorage === "undefined";

// A real SHA-256. The jest expo-crypto mock ignores the algorithm and always
// returns SHA-1, so the app's digest cannot be exercised through it; the import
// takes the digest as a parameter and the tests hand it node's.
const sha256 = async (s: string): Promise<string> => createHash("sha256").update(s, "utf8").digest("hex");

describe("importPendingCaptures (D-25 Phase 2 post-account import)", () => {
  beforeEach(async () => {
    await clearPendingCaptures();
  });

  test("empty queue: no work, creator never called", async () => {
    if (noStorage) return;
    const calls: string[] = [];
    const r = await importPendingCaptures({ userId: "u1", locale: "ko" }, async (i) => {
      calls.push(i.text);
    }, sha256);
    expect(r).toEqual({ total: 0, imported: 0, failed: 0 });
    expect(calls).toEqual([]);
  });

  test("all succeed: imports every item in order, forwards ctx, clears the queue", async () => {
    if (noStorage) return;
    await addPendingCapture("a", "2026-06-21T00:00:00.000Z");
    await addPendingCapture("b", "2026-06-21T00:01:00.000Z");
    const seen: string[] = [];
    let firstCtx: unknown;
    const r = await importPendingCaptures({ userId: "u1", locale: "ko", minor: true }, async (item, ctx) => {
      if (seen.length === 0) firstCtx = ctx;
      seen.push(item.text);
    }, sha256);
    expect(r).toEqual({ total: 2, imported: 2, failed: 0 });
    expect(seen).toEqual(["a", "b"]);
    expect(firstCtx).toEqual({ userId: "u1", locale: "ko", minor: true });
    expect(await loadPendingCaptures()).toEqual([]);
  });

  test("partial failure: retains only the failed item, never loses a capture", async () => {
    if (noStorage) return;
    await addPendingCapture("ok1", "2026-06-21T00:00:00.000Z");
    await addPendingCapture("boom", "2026-06-21T00:01:00.000Z");
    await addPendingCapture("ok2", "2026-06-21T00:02:00.000Z");
    const r = await importPendingCaptures({ userId: "u1", locale: "en" }, async (item) => {
      if (item.text === "boom") throw new Error("transient");
    }, sha256);
    expect(r).toEqual({ total: 3, imported: 2, failed: 1 });
    const remaining = await loadPendingCaptures();
    expect(remaining.map((i) => i.text)).toEqual(["boom"]);
  });

  test("concurrent calls share one in-flight run (regression: a remount no longer double-imports)", async () => {
    if (noStorage) return;
    await addPendingCapture("a", "2026-06-21T00:00:00.000Z");
    await addPendingCapture("b", "2026-06-21T00:01:00.000Z");
    const seen: string[] = [];
    const create = async (item: { text: string }) => {
      seen.push(item.text);
    };
    // Two overlapping imports (e.g. the home route unmounting/remounting mid-import)
    // must NOT each drain the still-uncleared queue and duplicate every capture.
    const ctx = { userId: "u1", locale: "ko" as const };
    const [r1, r2] = await Promise.all([
      importPendingCaptures(ctx, create, sha256),
      importPendingCaptures(ctx, create, sha256),
    ]);
    expect(seen).toEqual(["a", "b"]); // each captured item imported exactly once
    expect(r1).toBe(r2); // both callers share the single run's summary
    expect(r1).toEqual({ total: 2, imported: 2, failed: 0 });
    expect(await loadPendingCaptures()).toEqual([]);
  });
});

// 0178: every pending item carries a retry key derived from its device-local id,
// so a re-import after a committed-but-unacknowledged insert is a replay, not a
// second note. The tests above skip when node has no localStorage; these bring
// their own so they always run.
describe("importPendingCaptures - 0178 retry key", () => {
  const backing = new Map<string, string>();
  let original: PropertyDescriptor | undefined;

  beforeAll(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: (key: string, value: string) => { backing.set(key, value); },
        removeItem: (key: string) => { backing.delete(key); },
      },
    });
  });

  afterAll(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  beforeEach(() => backing.clear());

  const item = (localId: string) => ({ localId, text: "t", capturedAt: "x" });

  test("the key is preauth: + SHA-256 of the id, the same on every call, and never the id itself", async () => {
    const localId = "p_1782000000000_abc12";
    const first = await pendingClientRequestId(item(localId), sha256);
    const again = await pendingClientRequestId(item(localId), sha256);

    expect(first).toBe("preauth:baad7c57818a39ad1b1cd306a2e35e8cedc23eab8fb8e7f1f7dadffa8e504a75");
    expect(again).toBe(first);
    expect(first).not.toContain(localId);
    expect(first).not.toContain("1782000000000"); // the capture time stays on the device
    // Inside the 0178 records_client_request_id_format CHECK.
    expect(first!.length).toBe(72);
    expect(first!.length).toBeLessThanOrEqual(128);
    expect(first).toMatch(/^[A-Za-z0-9._:-]+$/);
    // A different capture gets a different key.
    expect(await pendingClientRequestId(item("p_1782000000000_zz9"), sha256)).toBe(
      "preauth:c7c3fe263b2476d09e390c8b8a48b6d41530a9efaf6ab6618da1e7a83f3eb24b",
    );
  });

  test("no key (unkeyed import, as before) when the id or the digest cannot be trusted", async () => {
    // Ids newLocalId() never makes.
    expect(await pendingClientRequestId(item(""), sha256)).toBeUndefined();
    expect(await pendingClientRequestId(item("has space"), sha256)).toBeUndefined();
    expect(await pendingClientRequestId(item("p_x"), sha256)).toBeUndefined();
    // Hashing unavailable (web WebCrypto outside a secure origin) or off-shape.
    const unavailable = async () => { throw new Error("ERR_CRYPTO_UNAVAILABLE"); };
    expect(await pendingClientRequestId(item("p_1782000000000_abc12"), unavailable)).toBeUndefined();
    const sha1 = async (s: string) => createHash("sha1").update(s).digest("hex");
    expect(await pendingClientRequestId(item("p_1782000000000_abc12"), sha1)).toBeUndefined();
    // Upper-case hex from a platform is normalised, not rejected.
    const upper = async (s: string) => (await sha256(s)).toUpperCase();
    expect(await pendingClientRequestId(item("p_1782000000000_abc12"), upper)).toBe(
      "preauth:baad7c57818a39ad1b1cd306a2e35e8cedc23eab8fb8e7f1f7dadffa8e504a75",
    );
  });

  test("a commit whose response was lost is replayed on the next run, not duplicated", async () => {
    await addPendingCapture("first", "2026-09-28T00:00:00.000Z");
    await addPendingCapture("second", "2026-09-28T00:01:00.000Z");

    // Stand-in for records + UNIQUE (user_id, client_request_id).
    const table = new Map<string, string>();
    const keysSeen: Array<string | undefined> = [];
    let loseSecond = true;
    const create = async (item: { text: string }, ctx: { userId: string }, key?: string) => {
      keysSeen.push(key);
      if (!key) throw new Error("expected a retry key");
      const slot = `${ctx.userId}|${key}`;
      if (!table.has(slot)) table.set(slot, item.text); // replay leaves the row alone
      if (item.text === "second" && loseSecond) {
        loseSecond = false;
        throw new Error("response lost after commit");
      }
    };

    const first = await importPendingCaptures({ userId: "u1", locale: "en" }, create, sha256);
    expect(first).toEqual({ total: 2, imported: 1, failed: 1 });
    expect((await loadPendingCaptures()).map((i) => i.text)).toEqual(["second"]);

    const second = await importPendingCaptures({ userId: "u1", locale: "en" }, create, sha256);
    expect(second).toEqual({ total: 1, imported: 1, failed: 0 });

    // Two captures, two rows - the lost response did not become a third.
    expect([...table.values()]).toEqual(["first", "second"]);
    // The retried item carried the same key both times.
    expect(keysSeen[1]).toMatch(/^preauth:[0-9a-f]{64}$/);
    expect(keysSeen[2]).toBe(keysSeen[1]);
    expect(await loadPendingCaptures()).toEqual([]);
  });

  test("an imported note edited since then: the key conflict clears it from the queue", async () => {
    await addPendingCapture("draft as captured", "2026-09-28T00:00:00.000Z");
    const [pending] = await loadPendingCaptures();
    const key = await pendingClientRequestId(pending, sha256);

    // An earlier run committed this capture, lost the answer, and the user has
    // edited the note on the server since. createRecord's replay finds a row
    // under the key with a different body and throws the conflict.
    const server = new Map<string, string>([[`u1|${key}`, "draft as captured, then edited"]]);
    let calls = 0;
    const create = async (item: { text: string }, ctx: { userId: string }, k?: string) => {
      calls += 1;
      const row = k === undefined ? undefined : server.get(`${ctx.userId}|${k}`);
      if (row !== undefined && row !== item.text) throw new Error(RECORD_IDEMPOTENCY_CONFLICT);
      if (k !== undefined && row === undefined) server.set(`${ctx.userId}|${k}`, item.text);
    };

    const r = await importPendingCaptures({ userId: "u1", locale: "en" }, create, sha256);

    // It reached the server once already, so it counts as imported, not failed.
    expect(r).toEqual({ total: 1, imported: 1, failed: 0 });
    expect(await loadPendingCaptures()).toEqual([]);
    // And the next session has nothing to retry.
    await importPendingCaptures({ userId: "u1", locale: "en" }, create, sha256);
    expect(calls).toBe(1);
    // The edited note was not overwritten or duplicated.
    expect([...server.values()]).toEqual(["draft as captured, then edited"]);
  });

  test("a local id seen twice imports both copies unkeyed, so a conflict cannot drop either", async () => {
    // newLocalId() does not repeat in practice, but a key conflict now means "already
    // on the server": two captures under one key would lose the second one.
    await replacePendingCaptures([
      { localId: "p_1782000000000_abc12", text: "one", capturedAt: "x" },
      { localId: "p_1782000000000_abc12", text: "two", capturedAt: "x" },
      { localId: "p_1782000000001_def34", text: "three", capturedAt: "x" },
    ]);
    const keys: Array<string | undefined> = [];
    const r = await importPendingCaptures({ userId: "u1", locale: "en" }, async (_i, _c, k) => {
      keys.push(k);
    }, sha256);

    expect(r).toEqual({ total: 3, imported: 3, failed: 0 });
    expect(keys[0]).toBeUndefined();
    expect(keys[1]).toBeUndefined();
    expect(keys[2]).toMatch(/^preauth:[0-9a-f]{64}$/);
  });

  test("a conflict error on an unkeyed import is an ordinary failure: the capture stays", async () => {
    await replacePendingCaptures([{ localId: "not-a-generated-id", text: "keep me", capturedAt: "x" }]);
    const r = await importPendingCaptures({ userId: "u1", locale: "en" }, async () => {
      throw new Error(RECORD_IDEMPOTENCY_CONFLICT);
    }, sha256);

    expect(r).toEqual({ total: 1, imported: 0, failed: 1 });
    expect((await loadPendingCaptures()).map((i) => i.text)).toEqual(["keep me"]);
  });
});
