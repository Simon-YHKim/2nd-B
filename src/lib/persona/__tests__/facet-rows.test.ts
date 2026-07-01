import { facetRows, FACET_DOMAIN_ORDER } from "../facet-rows";

describe("facetRows", () => {
  test("groups into the 5 domains (O C E A N) each with 6 facets", () => {
    const rows = facetRows({}, {}, "en");
    expect(rows.map((r) => r.domain)).toEqual([
      "openness",
      "conscientiousness",
      "extraversion",
      "agreeableness",
      "neuroticism",
    ]);
    expect(FACET_DOMAIN_ORDER).toHaveLength(5);
    for (const g of rows) expect(g.facets).toHaveLength(6);
    expect(rows.flatMap((g) => g.facets)).toHaveLength(30);
  });

  test("maps facet + domain 1-5 means to the 0-100 (v-1)/4 percent", () => {
    const rows = facetRows({ anxiety: 5, anger: 1 }, { neuroticism: 3 }, "en");
    const n = rows.find((r) => r.domain === "neuroticism")!;
    expect(n.domainPercent).toBe(50); // 3 -> 50
    expect(n.facets.find((f) => f.key === "anxiety")!.percent).toBe(100); // 5 -> 100
    expect(n.facets.find((f) => f.key === "anger")!.percent).toBe(0); // 1 -> 0
  });

  test("unscored facets/domains are null (never fabricated as 0)", () => {
    const rows = facetRows({}, {}, "ko");
    expect(rows[0].domainPercent).toBeNull();
    expect(rows[0].facets.every((f) => f.percent === null)).toBe(true);
  });

  test("labels follow the locale", () => {
    expect(facetRows({}, {}, "ko")[0].domainLabel).toBe("경험 개방성");
    expect(facetRows({}, {}, "en")[0].domainLabel).toBe("Openness to Experience");
    expect(facetRows({}, {}, "ko")[4].facets[0].label).toBe("불안"); // neuroticism / anxiety
    expect(facetRows({}, {}, "en")[4].facets[0].label).toBe("Anxiety");
  });
});
