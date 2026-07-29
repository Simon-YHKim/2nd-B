import { canonPolarisBrightness } from "@/lib/canon";

import { HEADLINE_DOMAIN_IDS, domainStarLevels, northStarBrightness } from "../north-star";
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

  describe("recency threading (§4.5 ④, opt-in via now)", () => {
    const NOW = Date.parse("2026-06-26T00:00:00Z");
    const datedOrganized = (n: number, isoDate: string): DomainEntry[] =>
      Array.from({ length: n }, () => ({
        domain: "career" as const,
        category: "c",
        tags: ["t"],
        createdAt: isoDate,
      }));

    it("no now → recency never applies (back-compat: stale domain keeps its band)", () => {
      const levels = domainStarLevels({ career: datedOrganized(15, "2020-01-01T00:00:00Z") });
      expect(levels.career).toBe(4); // high → L4, undimmed
    });

    it("now dims a domain whose newest entry is older than 60 days", () => {
      const levels = domainStarLevels(
        { career: datedOrganized(15, "2026-01-01T00:00:00Z") }, // ~177 days old
        {},
        NOW,
      );
      expect(levels.career).toBe(3); // high → medium → L3
    });

    it("a fresh domain stays bright while a stale one dims under the same now", () => {
      const levels = domainStarLevels(
        {
          career: datedOrganized(15, "2026-06-20T00:00:00Z"), // 6 days old → bright
          finance: datedOrganized(15, "2026-01-01T00:00:00Z"), // stale → dims
        },
        {},
        NOW,
      );
      expect(levels.career).toBe(4);
      expect(levels.finance).toBe(3);
    });
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

  // Replaces the old "SAME formula as soulCoreBrightness (domain axis)" assertion.
  // It is no longer true and must not be restored: soulCoreBrightness averages the
  // SEVEN layer-B constructs, while the headline now averages only the SIX domains
  // the home draws (Simon 2026-07-29 03:44, canon polarisBrightness). Pinning the
  // two together would silently drag `collect` back into the number.
  describe("the headline input set is the canon's, not every domain", () => {
    it("reads the included/excluded sets from the canon rather than hardcoding them", () => {
      expect([...HEADLINE_DOMAIN_IDS]).toEqual(canonPolarisBrightness.includedDomainIds);
      expect(HEADLINE_DOMAIN_IDS).not.toContain("collect");
      expect(canonPolarisBrightness.excludedDomainIds).toContain("collect");
      // museum is a portal, not a domain: it has no level and never enters the mean.
      expect(canonPolarisBrightness.excludedHomeNodeIds).toContain("museum");
    });

    it("is INVARIANT to collect at every level (the defect this closes)", () => {
      const visible = { career: 4, finance: 3, growth: 4, relation: 4, health: 4, recreation: 3 } as const;
      const base = northStarBrightness(visible);
      for (const collect of [1, 2, 3, 4, 5] as const) {
        expect(northStarBrightness({ ...visible, collect })).toBe(base);
      }
    });

    it("does not let collect earn the all-lit bonus on its own", () => {
      // five visible lit, one dark, collect maxed: the bonus must NOT fire.
      const withDarkStar = northStarBrightness({
        career: 2, finance: 2, growth: 2, relation: 2, health: 2, recreation: 1, collect: 5,
      });
      const allVisibleLit = northStarBrightness({
        career: 2, finance: 2, growth: 2, relation: 2, health: 2, recreation: 2, collect: 1,
      });
      expect(allVisibleLit - withDarkStar).toBeGreaterThan(canonPolarisBrightness.allLitBonus / 2);
    });

    // The canon carries the expected values, so a canon edit that the code does not
    // follow fails here instead of shipping a number nobody re-derived.
    it.each(canonPolarisBrightness.goldens.map((g) => [g.id, g] as const))(
      "matches the canon golden %s",
      (_id, golden) => {
        expect(northStarBrightness(golden.levels as Partial<Record<DomainId, 1 | 2 | 3 | 4 | 5>>)).toBeCloseTo(
          golden.expected,
          10,
        );
      },
    );
  });
});
