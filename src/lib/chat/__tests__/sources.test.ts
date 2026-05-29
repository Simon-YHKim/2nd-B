import { parseSourceCitations } from "../sources";

describe("parseSourceCitations", () => {
  test("returns no chips when there are no citations", () => {
    const r = parseSourceCitations("Just a plain reply.");
    expect(r.chips).toEqual([]);
    expect(r.display).toBe("Just a plain reply.");
  });

  test("extracts a single citation and unwraps the brackets in display", () => {
    const r = parseSourceCitations("This echoes [[morning-pages]] from your notes.");
    expect(r.chips).toEqual(["morning-pages"]);
    expect(r.display).toBe("This echoes morning-pages from your notes.");
  });

  test("de-duplicates repeated slugs but keeps first-seen order", () => {
    const r = parseSourceCitations("[[a]] then [[b]] then [[a]] again.");
    expect(r.chips).toEqual(["a", "b"]);
  });

  test("trims whitespace inside the brackets", () => {
    const r = parseSourceCitations("see [[  spaced-slug  ]] here");
    expect(r.chips).toEqual(["spaced-slug"]);
    expect(r.display).toBe("see spaced-slug here");
  });

  test("handles Korean slugs", () => {
    const r = parseSourceCitations("그건 [[아침-기록]] 조각에서 왔어요.");
    expect(r.chips).toEqual(["아침-기록"]);
    expect(r.display).toBe("그건 아침-기록 조각에서 왔어요.");
  });

  test("ignores empty brackets", () => {
    const r = parseSourceCitations("nothing [[]] here");
    expect(r.chips).toEqual([]);
  });
});
