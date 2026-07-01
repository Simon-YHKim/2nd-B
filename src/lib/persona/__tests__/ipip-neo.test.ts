import {
  IPIP_NEO_120_ITEMS,
  FACETS_BY_DOMAIN,
  FACET_LABEL,
  scoreIpipNeo,
  ipipMeanToPercent,
  type IpipResponses,
} from "../ipip-neo";

const DOMAINS = ["extraversion", "agreeableness", "conscientiousness", "neuroticism", "openness"] as const;

// Build responses where EVERY item's reverse-coded value equals `target` (1..5):
// forward items get `target`, reverse items get `6 - target`.
function allAt(target: number): IpipResponses {
  const r: IpipResponses = {};
  for (const it of IPIP_NEO_120_ITEMS) r[it.id] = it.reverse ? 6 - target : target;
  return r;
}

describe("IPIP-NEO-120 structure (matches Johnson's published key)", () => {
  test("120 items, ids 1..120 with no gaps or dups", () => {
    expect(IPIP_NEO_120_ITEMS).toHaveLength(120);
    const ids = IPIP_NEO_120_ITEMS.map((i) => i.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(1);
    expect(ids[119]).toBe(120);
    expect(new Set(ids).size).toBe(120);
  });

  test("each domain has 24 items (6 facets x 4)", () => {
    for (const d of DOMAINS) {
      expect(IPIP_NEO_120_ITEMS.filter((i) => i.domain === d)).toHaveLength(24);
    }
  });

  test("30 facets, each measured by exactly 4 items", () => {
    const fc: Record<string, number> = {};
    for (const i of IPIP_NEO_120_ITEMS) fc[i.facetKey] = (fc[i.facetKey] ?? 0) + 1;
    expect(Object.keys(fc)).toHaveLength(30);
    expect(Object.values(fc).every((v) => v === 4)).toBe(true);
  });

  test("FACETS_BY_DOMAIN: 6 per domain, 30 distinct, all labeled en+ko", () => {
    const all = DOMAINS.flatMap((d) => FACETS_BY_DOMAIN[d]);
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
    for (const d of DOMAINS) expect(FACETS_BY_DOMAIN[d]).toHaveLength(6);
    for (const f of all) {
      expect(FACET_LABEL.en[f]?.length).toBeGreaterThan(0);
      expect(FACET_LABEL.ko[f]?.length).toBeGreaterThan(0);
    }
  });

  test("positively-keyed counts match Johnson (N17 E18 O12 A7 C11)", () => {
    const plus: Record<string, number> = {};
    for (const i of IPIP_NEO_120_ITEMS) if (!i.reverse) plus[i.domain] = (plus[i.domain] ?? 0) + 1;
    expect(plus.neuroticism).toBe(17);
    expect(plus.extraversion).toBe(18);
    expect(plus.openness).toBe(12);
    expect(plus.agreeableness).toBe(7);
    expect(plus.conscientiousness).toBe(11);
  });
});

describe("scoreIpipNeo", () => {
  test("reverse-coded all-5 -> every domain AND facet mean 5; complete", () => {
    const r = scoreIpipNeo(allAt(5));
    expect(r.answered).toBe(120);
    expect(r.complete).toBe(true);
    for (const d of DOMAINS) expect(r.domains[d]).toBe(5);
    expect(Object.keys(r.facets)).toHaveLength(30);
    expect(Object.values(r.facets).every((v) => v === 5)).toBe(true);
  });

  test("all-1 -> 1; neutral all-3 -> 3", () => {
    expect(scoreIpipNeo(allAt(1)).domains.neuroticism).toBe(1);
    expect(scoreIpipNeo(allAt(3)).domains.openness).toBe(3);
  });

  test("reverse-coding is applied (same raw nets opposite for forward vs reverse item)", () => {
    const fwd = IPIP_NEO_120_ITEMS.find((i) => !i.reverse)!;
    const rev = IPIP_NEO_120_ITEMS.find((i) => i.reverse)!;
    expect(scoreIpipNeo({ [fwd.id]: 5 }).facets[fwd.facetKey]).toBe(5);
    expect(scoreIpipNeo({ [rev.id]: 5 }).facets[rev.facetKey]).toBe(1); // 6 - 5
  });

  test("incomplete + out-of-range responses are handled", () => {
    const r = scoreIpipNeo({ 1: 4, 2: 0, 3: 9, 4: Number.NaN } as IpipResponses);
    expect(r.answered).toBe(1); // only id 1 (=4) is valid
    expect(r.complete).toBe(false);
  });
});

describe("ipipMeanToPercent", () => {
  test("anchors 1->0, 3->50, 5->100 (same as the persona bars)", () => {
    expect(ipipMeanToPercent(1)).toBe(0);
    expect(ipipMeanToPercent(3)).toBe(50);
    expect(ipipMeanToPercent(5)).toBe(100);
  });
});
