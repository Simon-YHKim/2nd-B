import { importPendingCaptures, pendingClientRequestId } from "../import-pending";
import { addPendingCapture, loadPendingCaptures, clearPendingCaptures } from "../preauth-pending";

const noStorage = typeof localStorage === "undefined";

describe("importPendingCaptures (D-25 Phase 2 post-account import)", () => {
  beforeEach(async () => {
    await clearPendingCaptures();
  });

  test("empty queue: no work, creator never called", async () => {
    if (noStorage) return;
    const calls: string[] = [];
    const r = await importPendingCaptures({ userId: "u1", locale: "ko" }, async (i) => {
      calls.push(i.text);
    });
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
    });
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
    });
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
      importPendingCaptures(ctx, create),
      importPendingCaptures(ctx, create),
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

  test("the key is the item's own id, inside the server's format", () => {
    expect(pendingClientRequestId({ localId: "p_1782000000000_abc12", text: "t", capturedAt: "x" }))
      .toBe("preauth:p_1782000000000_abc12");
    // Older ids that would fail the CHECK import unkeyed, as they did before.
    expect(pendingClientRequestId({ localId: "has space", text: "t", capturedAt: "x" })).toBeUndefined();
    expect(pendingClientRequestId({ localId: "x".repeat(121), text: "t", capturedAt: "x" })).toBeUndefined();
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

    const first = await importPendingCaptures({ userId: "u1", locale: "en" }, create);
    expect(first).toEqual({ total: 2, imported: 1, failed: 1 });
    expect((await loadPendingCaptures()).map((i) => i.text)).toEqual(["second"]);

    const second = await importPendingCaptures({ userId: "u1", locale: "en" }, create);
    expect(second).toEqual({ total: 1, imported: 1, failed: 0 });

    // Two captures, two rows - the lost response did not become a third.
    expect([...table.values()]).toEqual(["first", "second"]);
    // The retried item carried the same key both times.
    expect(keysSeen[1]).toBeDefined();
    expect(keysSeen[2]).toBe(keysSeen[1]);
    expect(await loadPendingCaptures()).toEqual([]);
  });
});
