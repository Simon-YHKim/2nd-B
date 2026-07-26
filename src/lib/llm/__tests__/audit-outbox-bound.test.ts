// F3 guard: the audit-write outbox must NOT evict crisis evidence first when it
// overflows. Before the fix, writeQueue did a blanket slice(-100), so during a
// delivery-failure / migration window (0095 not yet applied) an early-session RED
// interception's ai_audit_log + crisis_event rows were discarded before delivery --
// defeating C3. boundOutbox now preserves crisis_event + RED ai_audit_log entries
// and evicts only the oldest green/yellow rows.

import { boundOutbox } from "../audit-write-outbox";

type Entry = Parameters<typeof boundOutbox>[0][number];

function green(i: number): Entry {
  return {
    id: `g${i}`,
    ownerUserId: "u1",
    warnLabel: "w",
    kind: "ai_audit_log",
    payload: { userId: "u1", safetyZone: "green" },
  } as unknown as Entry;
}
function redAudit(i: number): Entry {
  return {
    id: `r${i}`,
    ownerUserId: "u1",
    warnLabel: "w",
    kind: "ai_audit_log",
    payload: { userId: "u1", safetyZone: "red" },
  } as unknown as Entry;
}
function crisis(i: number): Entry {
  return {
    id: `c${i}`,
    ownerUserId: "u1",
    warnLabel: "w",
    kind: "crisis_event",
    payload: { userId: "u1" },
  } as unknown as Entry;
}

describe("F3: outbox eviction preserves crisis evidence", () => {
  test("an early crisis_event + RED audit survive 150 later green writes", () => {
    // Oldest two are the safety-critical rows; then 150 green rows overflow the 100 cap.
    const queue: Entry[] = [crisis(0), redAudit(0), ...Array.from({ length: 150 }, (_, i) => green(i))];
    const kept = boundOutbox(queue);
    const ids = new Set(kept.map((e) => e.id));
    expect(ids.has("c0")).toBe(true); // crisis_event preserved
    expect(ids.has("r0")).toBe(true); // RED ai_audit_log preserved
    // Only the newest 100 green rows are kept; the oldest 50 are evicted.
    const greenKept = kept.filter((e) => e.id.startsWith("g"));
    expect(greenKept.length).toBe(100);
    expect(ids.has("g0")).toBe(false); // oldest green evicted
    expect(ids.has("g149")).toBe(true); // newest green kept
  });

  test("chronological order is preserved (deliver drains oldest-first)", () => {
    const queue: Entry[] = [crisis(0), green(0), redAudit(0), green(1)];
    const kept = boundOutbox(queue);
    expect(kept.map((e) => e.id)).toEqual(["c0", "g0", "r0", "g1"]);
  });

  test("no-critical queues fall back to the plain 100-cap", () => {
    const queue: Entry[] = Array.from({ length: 120 }, (_, i) => green(i));
    const kept = boundOutbox(queue);
    expect(kept.length).toBe(100);
    expect(kept[0].id).toBe("g20"); // oldest 20 evicted
  });
});
