import { domainForTags, relatedEdges, VILLAGE_IDS } from "../relatedness";

describe("domainForTags", () => {
  test("routes work/career tags to work village", () => {
    expect(domainForTags(["career", "goal"])).toBe("work");
    expect(domainForTags(["커리어", "목표"])).toBe("work");
  });
  test("routes relationship tags to relation village", () => {
    expect(domainForTags(["friend", "family"])).toBe("relation");
    expect(domainForTags(["관계", "친구"])).toBe("relation");
  });
  test("routes imagination tags to imagine village", () => {
    expect(domainForTags(["dream", "story"])).toBe("imagine");
    expect(domainForTags(["공상", "상상"])).toBe("imagine");
  });
  test("routes taste/inspiration tags to taste village", () => {
    expect(domainForTags(["music", "inspiration"])).toBe("taste");
    expect(domainForTags(["취향", "영감"])).toBe("taste");
  });
  test("falls back to knowledge when nothing matches", () => {
    expect(domainForTags(["zzz", "qqq"])).toBe("knowledge");
    expect(domainForTags([])).toBe("knowledge");
  });
  test("uses title as a weak fallback signal", () => {
    expect(domainForTags([], "오늘의 일기")).toBe("records");
  });
  test("always returns a real village id", () => {
    expect(VILLAGE_IDS).toContain(domainForTags(["whatever"]));
  });
});

describe("relatedEdges", () => {
  test("connects nodes sharing >= minShared tags", () => {
    const edges = relatedEdges([
      { id: "a", tags: ["x", "y", "z"] },
      { id: "b", tags: ["x", "y", "q"] },
      { id: "c", tags: ["w"] },
    ]);
    expect(edges).toEqual([{ from: "a", to: "b", weight: 2 }]);
  });
  test("respects minShared threshold", () => {
    const edges = relatedEdges(
      [
        { id: "a", tags: ["x", "y"] },
        { id: "b", tags: ["x", "q"] },
      ],
      { minShared: 2 },
    );
    expect(edges).toEqual([]); // only 1 shared
  });
  test("dedupes and orders endpoints by id", () => {
    const edges = relatedEdges([
      { id: "b", tags: ["x", "y"] },
      { id: "a", tags: ["x", "y"] },
    ]);
    expect(edges).toEqual([{ from: "a", to: "b", weight: 2 }]);
  });
  test("caps edges per node", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, tags: ["x", "y", "z"] }));
    const edges = relatedEdges(nodes, { maxPerNode: 2 });
    const deg = new Map<string, number>();
    for (const e of edges) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    for (const d of deg.values()) expect(d).toBeLessThanOrEqual(2);
  });
  test("tags are case/space-insensitive", () => {
    const edges = relatedEdges([
      { id: "a", tags: ["  X ", "Y"] },
      { id: "b", tags: ["x", "y"] },
    ]);
    expect(edges).toEqual([{ from: "a", to: "b", weight: 2 }]);
  });
  test("empty input → no edges", () => {
    expect(relatedEdges([])).toEqual([]);
  });
});
