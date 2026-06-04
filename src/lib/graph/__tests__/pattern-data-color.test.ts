import {
  resolvePatternDataColor,
  PATTERN_DATA_COLOR_ORDER,
  type PatternDataColorKey,
} from "../pattern-data-color";

describe("resolvePatternDataColor", () => {
  test("explicit colorKey passthrough wins over everything", () => {
    // Even with text that would keyword-match orange, the explicit key wins.
    expect(
      resolvePatternDataColor({ colorKey: "indigo", name: "work project", description: "career" }),
    ).toBe("indigo");
    // `color` alias is honored too.
    expect(resolvePatternDataColor({ color: "green" })).toBe("green");
  });

  test("invalid explicit key is ignored, falls through to keyword match", () => {
    expect(resolvePatternDataColor({ colorKey: "teal", name: "work project" })).toBe("orange");
  });

  test("EN keyword hit: 'work project' -> orange", () => {
    expect(resolvePatternDataColor({ name: "work project", description: "career momentum" })).toBe(
      "orange",
    );
  });

  test("KO keyword hit: '관계 사랑' -> red", () => {
    expect(resolvePatternDataColor({ name: "관계", description: "사랑하는 사람" })).toBe("red");
  });

  test("more keyword categories: knowledge->blue, growth->green, taste->violet", () => {
    expect(resolvePatternDataColor({ name: "knowledge", description: "analysis" })).toBe("blue");
    expect(resolvePatternDataColor({ name: "growth", description: "healthy routine" })).toBe("green");
    expect(resolvePatternDataColor({ name: "taste", description: "inspiration" })).toBe("violet");
  });

  test("most-hits wins when multiple colors match", () => {
    // 2 orange hits (work, project) vs 1 red hit (emotion) -> orange.
    expect(
      resolvePatternDataColor({ name: "work project", description: "with some emotion" }),
    ).toBe("orange");
  });

  test("tie-break is deterministic by fixed color order", () => {
    // One red keyword + one orange keyword = 1 hit each. Red precedes orange in
    // PATTERN_DATA_COLOR_ORDER, so red wins.
    expect(resolvePatternDataColor({ name: "love work" })).toBe("red");
  });

  test("ambiguous / unknown string falls back to a STABLE hash across repeated calls", () => {
    const input = { id: "node-xyz-123", name: "zzz qqq no keywords here" };
    const first = resolvePatternDataColor(input);
    for (let i = 0; i < 25; i++) {
      expect(resolvePatternDataColor(input)).toBe(first);
    }
    expect(PATTERN_DATA_COLOR_ORDER).toContain(first);
  });

  test("hash fallback keys off id, so same id is stable regardless of object identity", () => {
    const a = resolvePatternDataColor({ id: "stable-id", name: "asdf" });
    const b = resolvePatternDataColor({ id: "stable-id", name: "asdf" });
    expect(a).toBe(b);
  });

  test("empty / unknown input still returns a valid key", () => {
    expect(PATTERN_DATA_COLOR_ORDER).toContain(resolvePatternDataColor({}));
    expect(PATTERN_DATA_COLOR_ORDER).toContain(resolvePatternDataColor({ id: "" }));
    expect(PATTERN_DATA_COLOR_ORDER).toContain(resolvePatternDataColor({ name: "" }));
  });

  test("all 9 color keys are reachable via explicit key", () => {
    const seen = new Set<PatternDataColorKey>();
    for (const key of PATTERN_DATA_COLOR_ORDER) {
      seen.add(resolvePatternDataColor({ colorKey: key }));
    }
    expect(seen.size).toBe(9);
    expect([...seen].sort()).toEqual([...PATTERN_DATA_COLOR_ORDER].sort());
  });
});
