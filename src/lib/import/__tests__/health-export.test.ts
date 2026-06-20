import { parseAppleDate, parseAppleHealthExport, summarizeHealth } from "../health-export";

describe("parseAppleDate", () => {
  test("Apple's space + offset format → ISO", () => {
    expect(parseAppleDate("2024-01-05 08:00:00 +0900")).toBe("2024-01-04T23:00:00.000Z");
    expect(parseAppleDate(null)).toBeNull();
    expect(parseAppleDate("nope")).toBeNull();
  });
});

const XML = [
  '<HealthData locale="ko_KR">',
  '  <Record type="HKQuantityTypeIdentifierStepCount" startDate="2024-01-05 08:00:00 +0900" value="120" unit="count"/>',
  '  <Record type="HKQuantityTypeIdentifierStepCount" startDate="2024-01-05 09:00:00 +0900" value="80" unit="count"/>',
  '  <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2024-01-05 09:00:00 +0900" value="15.5" unit="kcal"/>',
  '  <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2024-01-05 23:00:00 +0900" value="HKCategoryValueSleepAnalysisAsleep"/>',
  "</HealthData>",
].join("\n");

describe("parseAppleHealthExport", () => {
  test("parses numeric Records, strips the type prefix, skips non-numeric", () => {
    const out = parseAppleHealthExport(XML);
    expect(out).toHaveLength(3); // sleep (non-numeric value) skipped
    expect(out[0]).toMatchObject({ type: "StepCount", value: 120, unit: "count" });
    expect(out[0].startIso).not.toBeNull();
    expect(out[2].type).toBe("ActiveEnergyBurned");
  });

  test("empty → []", () => {
    expect(parseAppleHealthExport("")).toEqual([]);
  });
});

describe("summarizeHealth (derived per-type totals)", () => {
  test("sums by type, descending", () => {
    const s = summarizeHealth(parseAppleHealthExport(XML));
    expect(s.records).toBe(3);
    expect(s.byType[0]).toEqual({ type: "StepCount", total: 200, unit: "count" });
    expect(s.byType.find((t) => t.type === "ActiveEnergyBurned")?.total).toBeCloseTo(15.5, 1);
  });
});
