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

// ANDROID_QA_GUIDELINES.md:126 - one AsyncStorage key over 2MB (the CursorWindow)
// crashes Android. What is measured here is exactly what writeQueue stores: the
// whole bounded queue as ONE JSON.stringify string under one key
// (llm.auditWriteOutbox.v1), with no encryption or envelope around it. The
// CursorWindow holds that TEXT as UTF-8, so the unit is UTF-8 bytes, against
// 2 MiB = 2,097,152.
//
// The 0179 keyed ids are 36 chars. The ids before them (base36 ms + "-" + a
// base36 counter) are 10 chars, 11 from the 37th row of a process, so a keyed
// row is about 25 bytes longer.
//
// The rows sit at the 0181 CHARACTER bounds (model_used 128, purpose 64, 16
// trigger categories of 64, routing_template_version 128), every other field at
// its longest JSON form, all in ASCII. That is the byte worst case for ASCII text
// only. 0181 also admits up to 4 UTF-8 bytes per character (octet_length 512 for
// model_used and routing_template_version, 256 for purpose and each category):
// this same queue with those fields in 4-byte characters measured 2,662,501 bytes,
// over the ceiling, and in 3-byte Hangul 2,067,301 (2026-09-29). So the margin
// rests on those fields being ASCII in practice - model ids, template versions,
// lexicon category ids - not on the server bounds. And the server bounds do not
// bound this queue at all: rows are stored before any server check, and the LLM
// classifier's trigger strings reach it unclamped (llm/safety.ts).
describe("outbox bytes with 0179 keyed ids", () => {
  const uuid = (i: number) => `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
  const owner = "3f0b4a52-9c1e-4d7a-8b6f-2e5d9a1c7b40";
  // Longer than any label boundary.ts writes (its longest is 52 chars).
  const warnLabel = "w".repeat(120);
  const auditRow = (i: number, zone: "yellow" | "red"): Entry => ({
    id: uuid(i),
    ownerUserId: owner,
    warnLabel,
    requiresBoundSession: false, // "false" is one char longer than "true"
    kind: "ai_audit_log",
    payload: {
      userId: owner,
      promptHash: "ffffffff", // 0181: at most 8 hex chars
      outputHash: "ffffffff",
      modelUsed: "m".repeat(128),
      vertexBackend: false,
      safetyZone: zone, // "yellow" is the longest routine zone
      latencyMs: 3_600_000,
      purpose: "p".repeat(64),
      reasoningProvider: "openai",
      effort: "medium", // the longest effort name
    },
  }) as Entry;
  const crisisRow = (i: number): Entry => ({
    id: uuid(i),
    ownerUserId: owner,
    warnLabel,
    requiresBoundSession: false,
    kind: "crisis_event",
    payload: {
      // The longest JSON a double in [0, 1] prints: 24 chars.
      classifierConfidence: 0.0000012345678901234567,
      triggerCategories: Array.from({ length: 16 }, (_, k) => `${k}`.padEnd(64, "t")),
      routingTemplateVersion: "v".repeat(128),
      locale: "ko",
    },
  }) as Entry;

  test("a full queue of ASCII rows at the 0181 character bounds stays under 1,000,000 bytes", () => {
    // The 50 RED audits are oldest, so the critical cap keeps the 500 crisis rows
    // (each larger than a RED audit row): the heaviest queue boundOutbox can leave
    // behind, 500 critical + 100 routine.
    const queue: Entry[] = [
      ...Array.from({ length: 50 }, (_, i) => auditRow(1000 + i, "red")),
      ...Array.from({ length: 500 }, (_, i) => crisisRow(i)),
      ...Array.from({ length: 300 }, (_, i) => auditRow(2000 + i, "yellow")),
    ];
    const kept = boundOutbox(queue);
    expect(kept).toHaveLength(600); // 500 critical cap + 100 routine cap
    expect(kept.filter((e) => e.kind === "crisis_event")).toHaveLength(500);
    // The string writeQueue stores, measured in the unit the CursorWindow counts.
    const bytes = Buffer.byteLength(JSON.stringify(kept), "utf8");
    expect(bytes).toBeLessThan(1_000_000); // measured 876,901 on 2026-09-29; 2 MiB = 2,097,152
  });
});
