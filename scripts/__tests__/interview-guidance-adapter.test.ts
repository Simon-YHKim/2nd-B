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
const bodies = {
  ko119: "지금 신체에 위험이 있다면 현지 긴급전화로 연락해 주세요. 한국에 계시면 119입니다. 가능하면 가까운 사람에게 도움을 요청해 주세요.",
  ko109: "한국에서 대화 지원이 필요하면 109로 연락할 수 있습니다.",
  koYouth: "한국에서는 청소년전화 1388 또는 109로 연락할 수 있습니다.",
  en119: "If you are in physical danger now, contact your local emergency service. In South Korea, call 119. If you can, ask someone nearby for help.",
  en112: "If someone is threatening you now, move to a safe place if you can and contact your local emergency service. In South Korea, call 112.",
  en988: "In the US, you can call or text 988 for support. For other countries, use the helpline directory.",
};
const displayed: Record<string, string[]> = {
  "t23-K1-candidate": [bodies.ko119], "t23-K2-candidate": [bodies.ko119, bodies.koYouth],
  "t23-K3-baseline": [bodies.ko119, bodies.ko109], "t23-K3-candidate": [bodies.ko119],
  "t23-E1-candidate": [bodies.en988], "t23-E2-baseline": [bodies.en119, bodies.en988],
  "t23-E2-candidate": [bodies.en988], "t23-E3-baseline": [bodies.en119, bodies.en988],
  "t23-E4-candidate": [bodies.en112], "synthetic-multiline-guidance": [bodies.ko109],
};

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
  expect(row.checks?.safetyGuidanceLoss).toBe(false);
  const ko = row.locale === "ko";
  expect(row.screen?.guidanceRow.text).toEqual([ko ? "연락 안내" : "Contact information", ...displayed[id],
    ...(contacts.includes("GLOBAL_988") ? ["Find a helpline"] : []), ko ? "닫기" : "Close"]);
  expect(row.screen?.guidanceRow.present).toBe(true);
  expect(row.screen?.guidanceRow.projection).toContain("not React/device rendering");
  expect(row.probe?.question).not.toBe(row.parsed?.question);
  expect(row.screen?.visibleQuestion).not.toBe(row.parsed?.question);
  expect(row.probe?.openers).toEqual([]);
});

test("preserves actual 32-row baseline and raw-model 109 failures without reporting new quality success", () => {
  expect(replay.counts).toEqual({ rows: 32, inputRedSkipped: 2, replayed: 30, safetyLossRows: 0,
    historicalDirect109Decreased: 2, historicalSupport109Decreased: 1 });
  expect(replay).toMatchObject({ liveCalls: 0, forbiddenAttempts: 0, productionWrites: 0,
    modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED", appParityVerified: false });
  const corpus = readFileSync(join(process.cwd(), "scripts/claude-interview-adapter.corpus.json"));
  expect(replay.corpusSha256).toBe(createHash("sha256").update(corpus).digest("hex"));
  expect(replay.historicalPairs.find((pair) => pair.group === "K1")).toMatchObject({ direct109Decreased: true, supportPreservationGateRelevant: true });
  expect(replay.historicalGuidanceLoss.ids.slice().sort()).toEqual(expected.map(([id]) => id).sort());
  expect(replay.rows.filter((row) => row.checks?.safetyGuidanceLoss)).toEqual([]);
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
  expect(row.screen?.guidanceRow.present).toBe(true);
});
