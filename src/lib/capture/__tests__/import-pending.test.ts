import { importPendingCaptures } from "../import-pending";
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
