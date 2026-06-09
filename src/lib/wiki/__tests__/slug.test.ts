import { isValidSlug, slugForTitle, toSlug } from "../slug";

describe("toSlug", () => {
  test("lowercases ASCII", () => {
    expect(toSlug("Big Five")).toBe("big-five");
  });

  test("collapses runs of separators", () => {
    expect(toSlug("hello   world!!!")).toBe("hello-world");
  });

  test("trims leading and trailing hyphens", () => {
    expect(toSlug("  --hello--  ")).toBe("hello");
  });

  test("keeps digits", () => {
    expect(toSlug("GPT-4 Turbo (2024)")).toBe("gpt-4-turbo-2024");
  });

  test("preserves Hangul syllables", () => {
    expect(toSlug("민지의 성장 노트")).toBe("민지의-성장-노트");
  });

  test("preserves Hangul next to ASCII", () => {
    expect(toSlug("ADHD와 산만함")).toBe("adhd와-산만함");
  });

  test("strips emoji and symbols", () => {
    expect(toSlug("🚀 Launch Day! @home")).toBe("launch-day-home");
  });

  test("is idempotent", () => {
    const inputs = [
      "Big Five Personality",
      "민지의 성장 노트",
      "GPT-4 Turbo (2024)",
      "🚀 Launch Day! @home",
    ];
    for (const s of inputs) {
      expect(toSlug(toSlug(s))).toBe(toSlug(s));
    }
  });

  test("returns empty string when nothing to keep", () => {
    expect(toSlug("!!!")).toBe("");
    expect(toSlug("   ")).toBe("");
  });
});

describe("slugForTitle", () => {
  test("matches toSlug when the title keeps something", () => {
    expect(slugForTitle("Big Five")).toBe("big-five");
    expect(slugForTitle("민지의 성장 노트")).toBe("민지의-성장-노트");
  });

  test("never returns empty for non-Latin/non-Hangul scripts or pure symbols", () => {
    for (const title of ["日本語ノート", "你好世界", "Привет", "สวัสดี", "!!!"]) {
      expect(slugForTitle(title).length).toBeGreaterThan(0);
    }
  });

  test("gives distinct titles distinct slugs (no '' collision)", () => {
    expect(slugForTitle("日本語ノート")).not.toBe(slugForTitle("你好世界"));
    expect(slugForTitle("Привет")).not.toBe(slugForTitle("สวัสดี"));
  });

  test("is stable for the same title (idempotent re-promotion)", () => {
    expect(slugForTitle("日本語ノート")).toBe(slugForTitle("日本語ノート"));
  });
});

describe("isValidSlug", () => {
  test("accepts canonical slugs", () => {
    expect(isValidSlug("big-five")).toBe(true);
    expect(isValidSlug("gpt-4-turbo-2024")).toBe(true);
    expect(isValidSlug("민지의-성장-노트")).toBe(true);
  });

  test("rejects empty", () => {
    expect(isValidSlug("")).toBe(false);
  });

  test("rejects mixed case", () => {
    expect(isValidSlug("Big-Five")).toBe(false);
  });

  test("rejects leading/trailing hyphens", () => {
    expect(isValidSlug("-big-five")).toBe(false);
    expect(isValidSlug("big-five-")).toBe(false);
  });

  test("rejects double hyphens", () => {
    expect(isValidSlug("big--five")).toBe(false);
  });

  test("rejects spaces", () => {
    expect(isValidSlug("big five")).toBe(false);
  });
});
