import {
  pendingStatus,
  addToPendingList,
  normalizePendingList,
  addPendingCapture,
  loadPendingCaptures,
  drainPendingCaptures,
  clearPendingCaptures,
  countPendingCaptures,
  PREAUTH_PENDING_CAP,
  PREAUTH_PENDING_NEAR,
  PREAUTH_PENDING_MAX_CHARS,
  type PendingCapture,
} from "../preauth-pending";

function item(i: number): PendingCapture {
  return { localId: `p_${i}`, text: `line ${i}`, capturedAt: "2026-06-21T00:00:00.000Z" };
}

describe("pendingStatus (D-17 honest capacity)", () => {
  test("empty queue: room to spare, not near/full", () => {
    expect(pendingStatus(0)).toEqual({
      count: 0,
      cap: PREAUTH_PENDING_CAP,
      remaining: PREAUTH_PENDING_CAP,
      nearFull: false,
      full: false,
    });
  });

  test("near threshold flips nearFull (drives the 'almost full' copy)", () => {
    expect(pendingStatus(PREAUTH_PENDING_NEAR - 1).nearFull).toBe(false);
    expect(pendingStatus(PREAUTH_PENDING_NEAR).nearFull).toBe(true);
    expect(pendingStatus(PREAUTH_PENDING_NEAR).full).toBe(false);
  });

  test("at the cap the queue is full with zero remaining", () => {
    const s = pendingStatus(PREAUTH_PENDING_CAP);
    expect(s.full).toBe(true);
    expect(s.remaining).toBe(0);
  });

  test("clamps negative / fractional counts", () => {
    expect(pendingStatus(-5).count).toBe(0);
    expect(pendingStatus(3.7).count).toBe(3);
  });
});

describe("addToPendingList (pure core)", () => {
  test("appends a trimmed plaintext item", () => {
    const r = addToPendingList([], "  hello  ", "2026-06-21T00:00:00.000Z", "p_x");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item).toEqual({ localId: "p_x", text: "hello", capturedAt: "2026-06-21T00:00:00.000Z" });
      expect(r.list).toHaveLength(1);
      expect(r.status.count).toBe(1);
    }
  });

  test("refuses empty / whitespace-only without dropping anything", () => {
    const r = addToPendingList([item(1)], "   ", "now", "p_y");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
    expect(r.list).toHaveLength(1);
  });

  test("refuses an over-long item (storage-ceiling guard)", () => {
    const big = "x".repeat(PREAUTH_PENDING_MAX_CHARS + 1);
    const r = addToPendingList([], big, "now", "p_z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_long");
  });

  test("refuses once full instead of silently dropping (honest, not punitive)", () => {
    const full = Array.from({ length: PREAUTH_PENDING_CAP }, (_, i) => item(i));
    const r = addToPendingList(full, "one more", "now", "p_over");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("full");
      expect(r.status.full).toBe(true);
    }
    expect(r.list).toHaveLength(PREAUTH_PENDING_CAP);
  });
});

describe("normalizePendingList", () => {
  test("drops malformed entries and non-arrays", () => {
    expect(normalizePendingList(null)).toEqual([]);
    expect(normalizePendingList("nope")).toEqual([]);
    expect(
      normalizePendingList([item(1), { localId: "x" }, { text: "", localId: "y", capturedAt: "z" }, item(2)]),
    ).toHaveLength(2);
  });

  test("hard-caps a tampered oversized array", () => {
    const many = Array.from({ length: PREAUTH_PENDING_CAP + 20 }, (_, i) => item(i));
    expect(normalizePendingList(many)).toHaveLength(PREAUTH_PENDING_CAP);
  });
});

describe("storage round-trip (add / load / drain)", () => {
  beforeEach(async () => {
    await clearPendingCaptures();
  });

  test("persists a capture, loads it back, then drains to empty", async () => {
    if (typeof localStorage === "undefined") return; // node env without storage: skip
    const r = await addPendingCapture("first line", "2026-06-21T01:00:00.000Z");
    expect(r.ok).toBe(true);
    const loaded = await loadPendingCaptures();
    expect(loaded.map((i) => i.text)).toEqual(["first line"]);
    const drained = await drainPendingCaptures();
    expect(drained).toHaveLength(1);
    expect(await countPendingCaptures()).toBe(0);
  });
});
