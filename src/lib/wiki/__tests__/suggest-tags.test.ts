import { suggestedTags } from "../suggest-tags";

function fm(tags?: string[]): Record<string, unknown> {
  return {
    __phase1__: {
      summary: "s",
      entities: [],
      concepts: [],
      questions: ["q1", "q2", "q3", "q4"],
      tags,
      generated_at: "2026-06-19T00:00:00Z",
      model: "gemini-2.5-flash",
    },
  };
}

describe("suggestedTags", () => {
  test("returns Phase 1 tags the source doesn't already have", () => {
    const s = { tags: ["성장"], frontmatter: fm(["감정", "연구", "성장"]) };
    expect(suggestedTags(s)).toEqual(["감정", "연구"]);
  });

  test("dedupes case-insensitively against existing + within suggestions", () => {
    const s = { tags: ["AI"], frontmatter: fm(["ai", "Design", "design", "ml"]) };
    expect(suggestedTags(s)).toEqual(["Design", "ml"]);
  });

  test("trims and skips empties; respects max", () => {
    const s = { tags: [], frontmatter: fm(["  a  ", "", "b", "c"]) };
    expect(suggestedTags(s, 2)).toEqual(["a", "b"]);
  });

  test("empty when no cached Phase 1 or no tags", () => {
    expect(suggestedTags({ tags: [], frontmatter: {} })).toEqual([]);
    expect(suggestedTags({ tags: [], frontmatter: fm([]) })).toEqual([]);
    expect(suggestedTags({ tags: [], frontmatter: fm(undefined) })).toEqual([]);
  });
});
