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

// ANDROID_QA_GUIDELINES.md:126 - one AsyncStorage key over 2MB crashes Android.
// The 0179 keyed ids are 36 chars (the old ids were ~12). A full queue of the
// largest rows the server will accept (0181 bounds: model_used 128, purpose 64,
// 16 trigger categories of 64) must still sit far below that ceiling.
describe("outbox bytes with 0179 keyed ids", () => {
  const uuid = (i: number) => `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
  const auditRow = (i: number, zone: "green" | "red"): Entry => ({
    id: uuid(i),
    ownerUserId: "3f0b4a52-9c1e-4d7a-8b6f-2e5d9a1c7b40",
    warnLabel: "w".repeat(120),
    requiresBoundSession: true,
    kind: "ai_audit_log",
    payload: {
      userId: "3f0b4a52-9c1e-4d7a-8b6f-2e5d9a1c7b40",
      promptHash: "ffffffff",
      outputHash: "ffffffff",
      modelUsed: "m".repeat(128),
      vertexBackend: false,
      safetyZone: zone,
      latencyMs: 3_600_000,
      purpose: "p".repeat(64),
      reasoningProvider: "openai",
      effort: "xhigh",
    },
  }) as Entry;
  const crisisRow = (i: number): Entry => ({
    id: uuid(i),
    ownerUserId: "3f0b4a52-9c1e-4d7a-8b6f-2e5d9a1c7b40",
    warnLabel: "w".repeat(120),
    requiresBoundSession: true,
    kind: "crisis_event",
    payload: {
      classifierConfidence: 0.999,
      triggerCategories: Array.from({ length: 16 }, (_, k) => `${k}`.padEnd(64, "t")),
      routingTemplateVersion: "v".repeat(128),
      locale: "ko",
    },
  }) as Entry;

  test("a full queue of worst-case server-valid rows stays under half of 2MB", () => {
    // The 50 RED audits are oldest, so the critical cap keeps the 500 (larger)
    // crisis rows: the heaviest queue boundOutbox can leave behind.
    const queue: Entry[] = [
      ...Array.from({ length: 50 }, (_, i) => auditRow(1000 + i, "red")),
      ...Array.from({ length: 500 }, (_, i) => crisisRow(i)),
      ...Array.from({ length: 300 }, (_, i) => auditRow(2000 + i, "green")),
    ];
    const kept = boundOutbox(queue);
    expect(kept).toHaveLength(600); // 500 critical cap + 100 routine cap
    expect(kept.filter((e) => e.kind === "crisis_event")).toHaveLength(500);
    const bytes = Buffer.byteLength(JSON.stringify(kept), "utf8");
    expect(bytes).toBeLessThan(1_000_000); // measured 866,601 on 2026-09-29
  });
});
