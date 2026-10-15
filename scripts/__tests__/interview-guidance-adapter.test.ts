import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayClaudeInterviewAdapter } from "../replay-claude-interview-adapter";
import { inspectProbeContactGuidance as inspect, type ContactId, type Correction } from "../../src/lib/interview/probe-guidance";

// D3 §5 expectations, independent of helper implementation. No fixture identity enters the helper.
const expected: [string, ContactId[], Correction[]][] = [
  ["t23-K1-candidate", ["KR_119"], []],
  ["t23-K2-candidate", ["KR_119", "KR_1388", "KR_109"], ["country-condition-added"]],
  ["t23-K3-baseline", ["KR_119", "KR_109"], ["country-condition-added", "emergency-priority"]],
  ["t23-K3-candidate", ["KR_119"], []],
  ["t23-E1-candidate", ["GLOBAL_988"], []],
  ["t23-E2-baseline", ["KR_119", "GLOBAL_988"], ["country-condition-added", "unsupported-country-removed", "unverified-number-removed"]],
  ["t23-E2-candidate", ["GLOBAL_988"], ["unsupported-country-removed"]],
  ["t23-E3-baseline", ["KR_119", "GLOBAL_988"], ["country-condition-added", "unsupported-country-removed"]],
  ["t23-E4-candidate", ["KR_112"], []],
  ["synthetic-multiline-guidance", ["KR_109"], []],
];
let replay: Awaited<ReturnType<typeof replayClaudeInterviewAdapter>>;

beforeAll(async () => {
  const network = jest.spyOn(global, "fetch").mockImplementation(() => { throw new Error("No live calls in B1"); });
  try { replay = await replayClaudeInterviewAdapter(process.cwd()); expect(network).not.toHaveBeenCalled(); }
  finally { network.mockRestore(); }
}, 30000);

test.each(expected)("interprets actual bounded post-boundary GREEN: %s", (id, contacts, corrections) => {
  const row = replay.rows.find((item) => item.id === id)!;
  expect(row.boundary?.safety.zone).toBe("green");
  expect(row.strictSchemaIssues).toEqual([]);
  expect(row.boundary?.text).toBe(row.raw);
  const before = JSON.stringify(row);
  expect(inspect(row.boundary!.text, row.minor)).toEqual({ status: "inspected", evidence: "current-contact",
    guidance: { kind: "contacts", contacts, physicalUrgency: contacts.includes("KR_119"), corrections } });
  expect(JSON.stringify(row)).toBe(before);
  expect(row.checks?.safetyGuidanceLoss).toBe(true);
  expect(row.screen?.numbers).toEqual([]); // B1 has no product caller or screen connection.
});

test("preserves actual 32-row baseline and raw-model 109 failures without reporting new quality success", () => {
  expect(replay.counts).toEqual({ rows: 32, inputRedSkipped: 2, replayed: 30, safetyLossRows: 10,
    historicalDirect109Decreased: 2, historicalSupport109Decreased: 1 });
  expect(replay).toMatchObject({ liveCalls: 0, forbiddenAttempts: 0, productionWrites: 0,
    modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED", appParityVerified: false });
  const corpus = readFileSync(join(process.cwd(), "scripts/claude-interview-adapter.corpus.json"));
  expect(replay.corpusSha256).toBe(createHash("sha256").update(corpus).digest("hex"));
  expect(replay.historicalPairs.find((pair) => pair.group === "K1")).toMatchObject({ direct109Decreased: true, supportPreservationGateRelevant: true });
  expect(replay.rows.filter((row) => row.checks?.safetyGuidanceLoss).map((row) => row.id).sort())
    .toEqual(expected.map(([id]) => id).sort());
  const k1 = replay.rows.find((row) => row.id === "t23-K1-candidate")!;
  expect(k1.rawNumbers).not.toContain("109");
  expect(inspect(k1.boundary!.text, false).guidance).toMatchObject({ contacts: ["KR_119"] });
  const e2 = replay.rows.find((row) => row.id === "t23-E2-baseline")!;
  expect(e2.checks?.lostNumbers).toContain("911");
  for (const row of replay.rows.filter((item) => item.id.startsWith("t23-N") ||
    item.id.startsWith("synthetic-") && item.id !== "synthetic-multiline-guidance" && item.boundary)) {
    expect(inspect(row.boundary!.text, row.minor).guidance).toEqual({ kind: "none" });
  }
});

test.each([
  ["t23-K4-candidate", ["KR_112"]], ["t23-E1-baseline", ["GLOBAL_988"]], ["t23-E3-candidate", ["KR_119"]],
])("also recognizes legitimate guidance that the baseline already retains: %s", (id, contacts) => {
  const row = replay.rows.find((item) => item.id === id)!;
  expect(row.boundary?.safety.zone).toBe("green");
  expect(row.checks?.safetyGuidanceLoss).toBe(false);
  expect(inspect(row.boundary!.text, row.minor).guidance).toMatchObject({ kind: "contacts", contacts });
});
