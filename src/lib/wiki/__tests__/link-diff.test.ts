import { diffWikiLinks } from "../link-diff";

describe("diffWikiLinks", () => {
  test("all desired slugs resolved and not yet linked → all added, none removed", () => {
    const r = diffWikiLinks({
      currentEdges: [],
      desiredSlugs: ["foo", "bar"],
      knownPagesBySlug: new Map([
        ["foo", "p-foo"],
        ["bar", "p-bar"],
        ["baz", "p-baz"],
      ]),
      fromPageId: "p-src",
    });
    expect(new Set(r.toAddIds)).toEqual(new Set(["p-foo", "p-bar"]));
    expect(r.toRemoveIds).toEqual([]);
    expect(r.danglingSlugs).toEqual([]);
  });

  test("existing edge whose target is gone from body → removed", () => {
    const r = diffWikiLinks({
      currentEdges: [{ to_page_id: "p-foo", to_slug: "foo" }, { to_page_id: "p-bar", to_slug: "bar" }],
      desiredSlugs: ["foo"],
      knownPagesBySlug: new Map([["foo", "p-foo"], ["bar", "p-bar"]]),
      fromPageId: "p-src",
    });
    expect(r.toAddIds).toEqual([]);
    expect(r.toRemoveIds).toEqual(["p-bar"]);
    expect(r.danglingSlugs).toEqual([]);
  });

  test("desired slug already linked → no-op", () => {
    const r = diffWikiLinks({
      currentEdges: [{ to_page_id: "p-foo", to_slug: "foo" }],
      desiredSlugs: ["foo"],
      knownPagesBySlug: new Map([["foo", "p-foo"]]),
      fromPageId: "p-src",
    });
    expect(r.toAddIds).toEqual([]);
    expect(r.toRemoveIds).toEqual([]);
    expect(r.danglingSlugs).toEqual([]);
  });

  test("unresolved slug → dangling, NOT removed from current edges", () => {
    const r = diffWikiLinks({
      currentEdges: [{ to_page_id: "p-foo", to_slug: "foo" }],
      desiredSlugs: ["foo", "no-such-page"],
      knownPagesBySlug: new Map([["foo", "p-foo"]]),
      fromPageId: "p-src",
    });
    expect(r.toAddIds).toEqual([]);
    expect(r.toRemoveIds).toEqual([]);
    expect(r.danglingSlugs).toEqual(["no-such-page"]);
  });

  test("self-link silently dropped (CHECK from_page <> to_page)", () => {
    const r = diffWikiLinks({
      currentEdges: [],
      desiredSlugs: ["me", "other"],
      knownPagesBySlug: new Map([
        ["me", "p-src"], // resolves to fromPageId
        ["other", "p-other"],
      ]),
      fromPageId: "p-src",
    });
    expect(r.toAddIds).toEqual(["p-other"]);
    expect(r.toRemoveIds).toEqual([]);
    expect(r.danglingSlugs).toEqual([]);
  });

  test("mixed: adds, removes, dangling together", () => {
    const r = diffWikiLinks({
      currentEdges: [
        { to_page_id: "p-a", to_slug: "a" },     // stays
        { to_page_id: "p-old", to_slug: "old" }, // removed
      ],
      desiredSlugs: ["a", "new", "ghost"],
      knownPagesBySlug: new Map([
        ["a", "p-a"],
        ["old", "p-old"],
        ["new", "p-new"],
      ]),
      fromPageId: "p-src",
    });
    expect(new Set(r.toAddIds)).toEqual(new Set(["p-new"]));
    expect(r.toRemoveIds).toEqual(["p-old"]);
    expect(r.danglingSlugs).toEqual(["ghost"]);
  });

  test("duplicate dangling slugs collapse to one entry", () => {
    const r = diffWikiLinks({
      currentEdges: [],
      desiredSlugs: ["ghost", "ghost", "ghost"],
      knownPagesBySlug: new Map(),
      fromPageId: "p-src",
    });
    expect(r.danglingSlugs).toEqual(["ghost"]);
  });

  test("empty desiredSlugs with current edges → all current edges removed", () => {
    const r = diffWikiLinks({
      currentEdges: [
        { to_page_id: "p-a", to_slug: "a" },
        { to_page_id: "p-b", to_slug: "b" },
      ],
      desiredSlugs: [],
      knownPagesBySlug: new Map(),
      fromPageId: "p-src",
    });
    expect(r.toAddIds).toEqual([]);
    expect(new Set(r.toRemoveIds)).toEqual(new Set(["p-a", "p-b"]));
    expect(r.danglingSlugs).toEqual([]);
  });
});
