import { overviewCardSignals } from "../card-insights";

describe("overviewCardSignals", () => {
  test("returns null signals for empty input", () => {
    expect(overviewCardSignals([])).toEqual({
      recentCore: null,
      recentPiece: null,
      sparseCore: null,
    });
  });

  test("uses the most recent node for recent core and piece", () => {
    const signals = overviewCardSignals([
      { id: "old", title: "Older piece", parentId: "work", createdAt: "2026-06-01T00:00:00Z" },
      { id: "new", title: "Newest piece", parentId: "relation", createdAt: "2026-06-03T00:00:00Z" },
      { id: "middle", title: "Middle piece", parentId: "knowledge", createdAt: "2026-06-02T00:00:00Z" },
    ]);

    expect(signals.recentCore).toBe("relation");
    expect(signals.recentPiece).toEqual({ id: "new", title: "Newest piece" });
  });

  test("falls back to id when the recent node has no title", () => {
    expect(overviewCardSignals([{ id: "piece-1", parentId: "work" }]).recentPiece).toEqual({
      id: "piece-1",
      title: "piece-1",
    });
  });

  test("returns null recent core when the newest parent is not a Pattern Core", () => {
    const signals = overviewCardSignals([
      { id: "old", parentId: "work", createdAt: "2026-06-01T00:00:00Z" },
      { id: "new", parentId: "wiki-daily", createdAt: "2026-06-03T00:00:00Z" },
    ]);

    expect(signals.recentCore).toBeNull();
    expect(signals.recentPiece).toEqual({ id: "new", title: "new" });
  });

  test("selects the sparsest core and breaks ties by worldview order", () => {
    const signals = overviewCardSignals([
      { id: "work-1", parentId: "work" },
      { id: "work-2", parentId: "work" },
      { id: "relation-1", parentId: "relation" },
      { id: "knowledge-1", parentId: "knowledge" },
      { id: "records-1", parentId: "records" },
      { id: "taste-1", parentId: "taste" },
      { id: "rhythm-1", parentId: "rhythm" },
    ]);

    expect(signals.sparseCore).toBe("relation");
  });

  test("uses work first when every core has the same count", () => {
    const signals = overviewCardSignals([
      { id: "work-1", parentId: "work" },
      { id: "relation-1", parentId: "relation" },
      { id: "knowledge-1", parentId: "knowledge" },
      { id: "records-1", parentId: "records" },
      { id: "taste-1", parentId: "taste" },
      { id: "rhythm-1", parentId: "rhythm" },
    ]);

    expect(signals.sparseCore).toBe("work");
  });

  test("counts only Pattern Core parents for sparse core", () => {
    const signals = overviewCardSignals([
      { id: "data-1", parentId: "work" },
      { id: "tier-3", parentId: "wiki-daily" },
      { id: "missing" },
    ]);

    expect(signals.sparseCore).toBe("relation");
  });

  test("is deterministic", () => {
    const nodes = [
      { id: "a", parentId: "work", createdAt: 10 },
      { id: "b", parentId: "taste", createdAt: 20 },
    ];

    expect(overviewCardSignals(nodes)).toEqual(overviewCardSignals(nodes));
  });
});
