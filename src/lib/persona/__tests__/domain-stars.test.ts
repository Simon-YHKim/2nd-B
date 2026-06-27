import {
  DOMAIN_STARS,
  DOMAIN_COUNT,
  getDomainStar,
  isDomainId,
  type DomainId,
} from "../domain-stars";

describe("DOMAIN_STARS (constellation layer A)", () => {
  it("has exactly seven domain stars", () => {
    expect(DOMAIN_STARS).toHaveLength(7);
    expect(DOMAIN_COUNT).toBe(7);
  });

  it("ids are unique and slug === id", () => {
    const ids = DOMAIN_STARS.map((d) => d.id);
    expect(new Set(ids).size).toBe(7);
    for (const d of DOMAIN_STARS) expect(d.slug).toBe(d.id);
  });

  it("indices are 1..7 contiguous", () => {
    expect(DOMAIN_STARS.map((d) => d.index).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("matches the canonical slug set (CONSTELLATION-DESIGN §13)", () => {
    expect(new Set(DOMAIN_STARS.map((d) => d.slug))).toEqual(
      new Set<DomainId>([
        "career",
        "finance",
        "growth",
        "relation",
        "health",
        "recreation",
        "collect",
      ]),
    );
  });

  it("every star carries non-empty KO + EN labels", () => {
    for (const d of DOMAIN_STARS) {
      expect(d.nameKo.length).toBeGreaterThan(0);
      expect(d.nameEn.length).toBeGreaterThan(0);
    }
  });

  it("getDomainStar / isDomainId resolve correctly", () => {
    expect(getDomainStar("collect").nameEn).toBe("Collect");
    expect(isDomainId("career")).toBe(true);
    // a legacy internal data-tag key is NOT a domain id (no 1:1 mapping)
    expect(isDomainId("work")).toBe(false);
    expect(isDomainId("knowledge")).toBe(false);
  });
});
