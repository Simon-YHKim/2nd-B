import {
  domainConfidence,
  domainLevel,
  domainBrightnessFraction,
} from "../domain-confidence";
import type { DomainEntry } from "../domain-stars";

const organized = (n: number): DomainEntry[] =>
  Array.from({ length: n }, () => ({
    domain: "career" as const,
    category: "c",
    tags: ["t"],
  }));

const raw = (n: number): DomainEntry[] =>
  Array.from({ length: n }, () => ({ domain: "career" as const }));

describe("domainConfidence (keystone adapter → brightness.ts chain)", () => {
  it("0 entries → default / L1", () => {
    expect(domainConfidence([])).toEqual({
      source: "default",
      confidence: "low",
      observationCount: 0,
    });
    expect(domainLevel([])).toBe(1);
  });

  it("coverage bands map to L2/L3/L4 (mirrors traitConfidenceFor)", () => {
    expect(domainLevel(organized(1))).toBe(2); // 1-4 → low → L2
    expect(domainLevel(organized(4))).toBe(2);
    expect(domainLevel(organized(5))).toBe(3); // 5-14 → medium → L3
    expect(domainLevel(organized(14))).toBe(3);
    expect(domainLevel(organized(15))).toBe(4); // >=15 → high → L4
  });

  it("raw-heavy domain is capped one band lower (§4.5 ②internal consistency)", () => {
    expect(domainLevel(raw(20))).toBe(3); // high → medium → L3, not L4
    expect(domainLevel(raw(10))).toBe(2); // medium → low → L2
    expect(domainConfidence(raw(20)).confidence).toBe("medium");
  });

  it("organized-ratio >= floor keeps the full band", () => {
    // 15 entries, 12 organized (0.8) → stays high → L4
    const mixed: DomainEntry[] = [...organized(12), ...raw(3)];
    expect(domainLevel(mixed)).toBe(4);
  });

  it("ratification reaches L5 through the existing ladderLevel (propose→ratify)", () => {
    expect(domainLevel(organized(1), { ratified: true })).toBe(5);
  });

  it("cross-source agreement lifts one tier (capped at 5)", () => {
    expect(domainLevel(organized(1), { crossSourceAgreement: true })).toBe(3); // L2 +1
  });

  it("brightness fraction is level * 0.2", () => {
    expect(domainBrightnessFraction([])).toBeCloseTo(0.2); // L1
    expect(domainBrightnessFraction(organized(15))).toBeCloseTo(0.8); // L4
  });
});
