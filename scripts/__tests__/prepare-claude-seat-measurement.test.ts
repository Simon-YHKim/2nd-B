import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareClaudeSeatMeasurement, preparationOutputPath } from "../prepare-claude-seat-measurement";

const root = process.cwd();
const corpus = () => JSON.parse(readFileSync(join(root, "scripts/claude-seat-measurement.corpus.json"), "utf8"));

describe("T68 offline preparation boundary", () => {
  it("runs the real lexical gate and routing without any provider request", () => {
    const network = jest.spyOn(global, "fetch").mockImplementation(() => { throw new Error("Network forbidden"); });
    const previous = process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR;
    process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR = "sentinel";
    try {
      const result = prepareClaudeSeatMeasurement(root);
      expect(network).not.toHaveBeenCalled();
      expect(process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR).toBe("sentinel");
      expect(result.counts).toEqual({ promptPurposes: 16, proxyPolicySeats: 19, dashboardSeats: 3, inventoriedSeats: 22, syntheticSafetyRows: 80, ocrFixtures: 1 });
      expect(result.liveCalls).toBe(0);
      expect(result.modelQualityVerdict).toBe("NOT_MEASURED");
      expect(result.seats.filter((seat) => seat.claudeProxySeated).map((seat) => seat.purpose).sort()).toEqual(["persona_narrative", "persona_synthesis"]);
      // A source seat remaining callable is not authority to resume a frozen decision.
      expect(result.seats.find((seat) => seat.purpose === "persona_narrative")?.decision).toBe("frozen");
      expect(corpus().qualityCases.every((sample: { seats: string[] }) => !sample.seats.includes("persona_narrative"))).toBe(true);
      expect(result.routingProbe.observed).toEqual({ ocr: "openai", voice: "openai", embedding: "openai" });
      expect(result.seats.find((seat) => seat.purpose === "interview_probe")?.literalCallSites).toHaveLength(1);
      expect(result.safetyRows.find((row) => row.id === "ko-direct" && row.uiLocale === "ko" && row.age === "adult")?.observedHotline).toBe("KR_109");
      expect(result.safetyRows.find((row) => row.id === "ko-direct" && row.uiLocale === "ko" && row.age === "minor")?.observedHotline).toBe("KR_1388");
      expect(result.safetyRows.find((row) => row.id === "ko-indirect" && row.uiLocale === "ko")?.disposition).toContain("not a safety PASS");
      expect(result.ocr[0].bytes).toBeGreaterThan(100);
    } finally {
      network.mockRestore();
      if (previous === undefined) delete process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR; else process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR = previous;
    }
  });

  it("rejects live mode and unknown flags before doing inventory work", () => {
    expect(preparationOutputPath([])).toBeUndefined();
    expect(preparationOutputPath(["--out=offline.json"])).toBe("offline.json");
    for (const flags of [["--live"], ["--vendor=claude"], ["--out="], ["--out=a", "--live"]]) expect(() => preparationOutputPath(flags)).toThrow("cannot make live calls");
  });

  it("fails closed if a seat disappears or a fixture is mislabeled as a verified model", () => {
    const missing = corpus(); missing.seats = missing.seats.filter((seat: { purpose: string }) => seat.purpose !== "daily_note");
    expect(() => prepareClaudeSeatMeasurement(root, missing)).toThrow("Seat coverage drift");
    const model = corpus(); model.modelIds.sonnet = "unverified-model-name";
    expect(() => prepareClaudeSeatMeasurement(root, model)).toThrow("cannot assert live model identities");
  });

  it("rejects damaged synthetic image bytes rather than changing the OCR truth", () => {
    const broken = corpus(); broken.ocrFixtures[0].data = Buffer.from("not an image").toString("base64");
    expect(() => prepareClaudeSeatMeasurement(root, broken)).toThrow("OCR fixture integrity failed");
  });
});
