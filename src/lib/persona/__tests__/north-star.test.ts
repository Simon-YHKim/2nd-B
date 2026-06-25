import { domainStarLevels, northStarBrightness } from "../north-star";
import { soulCoreBrightness } from "../stars";
import type { DomainEntry, DomainId } from "../domain-stars";

const organized = (n: number): DomainEntry[] =>
  Array.from({ length: n }, () => ({ domain: "career" as const, category: "c", tags: ["t"] }));

describe("domainStarLevels", () => {
  it("defaults every domain with no entries to L1 (honest dark star)", () => {
    const levels = domainStarLevels({});
    expect(Object.values(levels)).toHaveLength(7);
    expect(Object.values(levels).every((l) => l === 1)).toBe(true);
  });

  it("derives each domain's level from its own entries", () => {
    const levels = domainStarLevels({
      career: organized(15), // -> L4
      finance: organized(5), // -> L3
      relation: organized(1), // -> L2
    });
    expect(levels.career).toBe(4);
    expect(levels.finance).toBe(3);
    expect(levels.relation).toBe(2);
    expect(levels.health).toBe(1); // untouched domain stays dark
  });

  it("threads per-domain ratify through to L5 (propose->ratify)", () => {
    const levels = domainStarLevels({ growth: organized(1) }, { growth: { ratified: true } });
    expect(levels.growth).toBe(5);
  });
});

describe("northStarBrightness", () => {
  it("all dark (L1) -> 0.2, no all-lit bonus", () => {
    expect(northStarBrightness({})).toBeCloseTo(0.2);
  });

  it("all domains >= L2 earns the all-lit bonus", () => {
    const all2 = Object.fromEntries(
      (["career", "finance", "growth", "relation", "health", "recreation", "collect"] as DomainId[]).map(
        (d) => [d, 2 as const],
      ),
    );
    // mean(0.4 x7) + 0.05 = 0.45
    expect(northStarBrightness(all2)).toBeCloseTo(0.45);
  });

  it("caps at 1.0 even when all domains are L5", () => {
    const all5 = Object.fromEntries(
      (["career", "finance", "growth", "relation", "health", "recreation", "collect"] as DomainId[]).map(
        (d) => [d, 5 as const],
      ),
    );
    expect(northStarBrightness(all5)).toBe(1);
  });

  it("breadth beats one deep spike (no bonus until all are lit)", () => {
    const oneSpike = northStarBrightness({ career: 4 }); // others L1, not all >=L2
    const broad = northStarBrightness({
      career: 2, finance: 2, growth: 2, relation: 2, health: 2, recreation: 2, collect: 2,
    });
    expect(broad).toBeGreaterThan(oneSpike);
  });

  it("uses the SAME formula as soulCoreBrightness (domain axis)", () => {
    // identical level multiset -> identical aggregate, proving the formula is shared
    const domainLevels = { career: 4, finance: 3, growth: 2, relation: 1, health: 1, recreation: 1, collect: 1 } as Record<DomainId, 1 | 2 | 3 | 4 | 5>;
    const constructLevels = { now: 4, recall: 3, seen: 2, rhythm: 1, relational: 1, possible: 1, values: 1 } as const;
    expect(northStarBrightness(domainLevels)).toBeCloseTo(soulCoreBrightness(constructLevels));
  });
});
