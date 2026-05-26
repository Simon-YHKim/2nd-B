import { composeWikiExport } from "../export";
import type { SourceRow, WikiPageRow } from "../types";

function page(over: Partial<WikiPageRow>): WikiPageRow {
  return {
    id: "p-id",
    user_id: "u1",
    slug: "slug",
    kind: "concept",
    title: "Page Title",
    body_md: "Body",
    frontmatter: {},
    tags: [],
    source_id: null,
    created_at: "2026-05-25T00:00:00Z",
    updated_at: "2026-05-25T00:00:00Z",
    ...over,
  };
}

function source(over: Partial<SourceRow>): SourceRow {
  return {
    id: "s-id",
    user_id: "u1",
    kind: "article",
    title: "Source Title",
    source_url: null,
    storage_path: "u1/some.md",
    frontmatter: {},
    tags: [],
    simon_relevance: null,
    ingested: false,
    ingested_at: null,
    captured_at: "2026-05-25T00:00:00Z",
    ...over,
  };
}

describe("composeWikiExport", () => {
  test("empty wiki produces a complete document with placeholders", () => {
    const r = composeWikiExport([], [], { asOf: "2026-05-25" });
    expect(r.pageCount).toBe(0);
    expect(r.sourceCount).toBe(0);
    expect(r.prompt).toContain("2026-05-25");
    expect(r.prompt).toContain("## Wiki pages");
    expect(r.prompt).toContain("_(no wiki pages yet)_");
    expect(r.prompt).toContain("## Sources");
    expect(r.prompt).toContain("_(no sources yet)_");
  });

  test("page formatted with slug heading, frontmatter, body", () => {
    const r = composeWikiExport(
      [page({ slug: "big-five", title: "Big Five", body_md: "## Section\n\nText", tags: ["psychology"] })],
      [],
      { asOf: "2026-05-25" },
    );
    expect(r.prompt).toContain("### [[big-five]]");
    expect(r.prompt).toContain("slug: big-five");
    expect(r.prompt).toContain("tags:");
    expect(r.prompt).toContain("- psychology");
    expect(r.prompt).toContain("## Section");
  });

  test("source line includes kind label, title, url, tags, relevance, ingested flag", () => {
    const r = composeWikiExport(
      [],
      [source({ title: "Attachment in adulthood", source_url: "https://doi.org/x", kind: "paper", tags: ["attachment"], simon_relevance: 5, ingested: false })],
      { asOf: "2026-05-25" },
    );
    expect(r.prompt).toContain("[Paper] Attachment in adulthood");
    expect(r.prompt).toContain("https://doi.org/x");
    expect(r.prompt).toContain("tags: attachment");
    expect(r.prompt).toContain("relevance 5/5");
    expect(r.prompt).toContain("uningested");
  });

  test("ingested source omits the uningested marker", () => {
    const r = composeWikiExport([], [source({ ingested: true })], { asOf: "2026-05-25" });
    expect(r.prompt).not.toContain("uningested");
  });

  test("Korean locale uses Korean strings", () => {
    const r = composeWikiExport([page({ slug: "foo", title: "Foo" })], [source({ title: "src" })], {
      asOf: "2026-05-25",
      locale: "ko",
      userDisplayName: "민지",
    });
    expect(r.prompt).toContain("두번째 뇌 지식 내보내기");
    expect(r.prompt).toContain("민지");
    expect(r.prompt).toContain("## 위키 페이지");
    expect(r.prompt).toContain("## 소스");
  });

  test("Wikilinks inside body preserved verbatim (so the receiver LLM can follow them)", () => {
    const r = composeWikiExport([page({ slug: "p1", body_md: "see [[other-page]] for details" })], [], {});
    expect(r.prompt).toContain("[[other-page]]");
  });

  test("body truncation surfaces an explicit marker with the original length", () => {
    const body = "x".repeat(2000);
    const r = composeWikiExport([page({ slug: "long", body_md: body })], [], { bodyCharLimit: 500 });
    expect(r.prompt).toContain("_(body truncated");
    expect(r.prompt).toContain("2000 chars");
  });

  test("page counts by kind", () => {
    const r = composeWikiExport(
      [
        page({ id: "1", slug: "a", kind: "source", source_id: "s1" }),
        page({ id: "2", slug: "b", kind: "entity" }),
        page({ id: "3", slug: "c", kind: "entity" }),
        page({ id: "4", slug: "d", kind: "concept" }),
      ],
      [],
      {},
    );
    expect(r.pageCount).toBe(4);
    expect(r.pageCountsByKind).toEqual({ source: 1, entity: 2, concept: 1 });
  });

  test("user display name appears in header when supplied", () => {
    const withName = composeWikiExport([], [], { userDisplayName: "Simon" });
    expect(withName.prompt).toContain("Simon");

    const withoutName = composeWikiExport([], [], {});
    expect(withoutName.prompt).not.toContain("Simon");
  });

  test("page slug heading uses [[double brackets]] so the receiver can quote it", () => {
    const r = composeWikiExport([page({ slug: "foo-bar" })], [], {});
    expect(r.prompt).toMatch(/### \[\[foo-bar\]\]/);
  });
});
