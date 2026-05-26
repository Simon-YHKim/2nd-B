import { extractWikilinkSlugs, parseWikilinks } from "../wikilinks";

describe("parseWikilinks", () => {
  test("plain target", () => {
    expect(parseWikilinks("link to [[Big Five]] here")).toEqual([{ slug: "big-five", target: "Big Five", display: null }]);
  });

  test("aliased target", () => {
    expect(parseWikilinks("see [[Big Five|the trait theory]]")).toEqual([
      { slug: "big-five", target: "Big Five", display: "the trait theory" },
    ]);
  });

  test("heading fragment dropped", () => {
    expect(parseWikilinks("[[Big Five#Conscientiousness]]")).toEqual([
      { slug: "big-five", target: "Big Five", display: null },
    ]);
  });

  test("block ref fragment dropped", () => {
    expect(parseWikilinks("[[Big Five#^abc-123]]")).toEqual([{ slug: "big-five", target: "Big Five", display: null }]);
  });

  test("heading + alias", () => {
    expect(parseWikilinks("[[Big Five#Openness|O score]]")).toEqual([
      { slug: "big-five", target: "Big Five", display: "O score" },
    ]);
  });

  test("Korean target", () => {
    expect(parseWikilinks("결국 [[민지의 성장 노트]]에서")).toEqual([
      { slug: "민지의-성장-노트", target: "민지의 성장 노트", display: null },
    ]);
  });

  test("multiple occurrences preserved in order", () => {
    const r = parseWikilinks("[[A]] then [[B]] then [[A]] again");
    expect(r.map((l) => l.target)).toEqual(["A", "B", "A"]);
  });

  test("ignores wikilinks inside fenced code blocks", () => {
    const body = "```\ncode with [[Not A Link]] in it\n```\nbut [[Real Link]] here";
    expect(parseWikilinks(body)).toEqual([{ slug: "real-link", target: "Real Link", display: null }]);
  });

  test("ignores wikilinks inside tilde-fenced code blocks", () => {
    const body = "~~~\n[[Not A Link]]\n~~~\nand [[Real Link]]";
    expect(parseWikilinks(body)).toEqual([{ slug: "real-link", target: "Real Link", display: null }]);
  });

  test("ignores wikilinks inside inline code", () => {
    const body = "the syntax `[[Foo]]` renders as [[Foo]]";
    expect(parseWikilinks(body)).toEqual([{ slug: "foo", target: "Foo", display: null }]);
  });

  test("does NOT match markdown reference links [text](url)", () => {
    expect(parseWikilinks("[Foo](https://example.com)")).toEqual([]);
  });

  test("rejects empty target", () => {
    expect(parseWikilinks("[[]] and [[ ]]")).toEqual([]);
  });

  test("rejects target that slugs to empty", () => {
    expect(parseWikilinks("[[!!!]]")).toEqual([]);
  });

  test("empty display treated as null", () => {
    expect(parseWikilinks("[[Foo|]]")).toEqual([{ slug: "foo", target: "Foo", display: null }]);
  });

  test("does not match unclosed brackets", () => {
    expect(parseWikilinks("[[Foo and more text")).toEqual([]);
  });

  test("does not eat across nested-looking brackets", () => {
    // [[outer [[inner]] outer]] is two separate links by left-to-right matching;
    // we don't support nesting — the inner closes the regex match.
    const r = parseWikilinks("[[outer [[inner]] outer]]");
    expect(r.length).toBeGreaterThan(0);
    // The important contract: every emitted slug came from real bracket pairs,
    // never spurious "outer" with garbage.
    for (const l of r) {
      expect(l.slug).toMatch(/^[a-z0-9ᄀ-ᇿ가-힣-]+$/);
    }
  });
});

describe("extractWikilinkSlugs", () => {
  test("deduplicates", () => {
    expect(extractWikilinkSlugs("[[A]] [[A]] [[B]] [[A]]").sort()).toEqual(["a", "b"]);
  });

  test("aliased duplicates count as one", () => {
    expect(extractWikilinkSlugs("[[Foo]] and [[Foo|bar]]")).toEqual(["foo"]);
  });

  test("heading variants collapse to the same slug", () => {
    expect(extractWikilinkSlugs("[[Foo]] and [[Foo#Heading]] and [[Foo#^block]]")).toEqual(["foo"]);
  });

  test("empty body returns empty", () => {
    expect(extractWikilinkSlugs("")).toEqual([]);
    expect(extractWikilinkSlugs("no links here")).toEqual([]);
  });
});
