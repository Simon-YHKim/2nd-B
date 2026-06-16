import { composeContextPack, PACK_TARGET_LIMITS } from "../context-pack";
import { containsForbiddenLexicon } from "../../safety/classifier";
import type { SourceRow, WikiPageRow } from "../types";

function page(slug: string, kind: WikiPageRow["kind"], tags: string[] = []): WikiPageRow {
  return {
    id: slug,
    user_id: "u1",
    slug,
    kind,
    title: slug,
    body_md: `Body of ${slug}.`,
    frontmatter: {},
    tags,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  } as WikiPageRow;
}

function source(title: string, tags: string[] = []): SourceRow {
  return {
    id: title,
    user_id: "u1",
    kind: "article",
    title,
    source_url: "https://example.com",
    storage_path: `u1/${title}.md`,
    frontmatter: {},
    tags,
    simon_relevance: 4,
    ingested: true,
    ingested_at: "2026-06-01T00:00:00Z",
    captured_at: "2026-06-01T00:00:00Z",
  } as SourceRow;
}

const PAGES = [page("attachment", "concept", ["psychology", "growth"]), page("simon", "entity", ["psychology"])];
const SOURCES = [source("A morning routine", ["habits", "psychology"]), source("Deep work", ["habits"])];

describe("composeContextPack — §6 two-layer structure", () => {
  it("puts the rules in the header, above the detail and the task", () => {
    const pack = composeContextPack(PAGES, SOURCES, { asOf: "2026-06-16", identity: { displayName: "Simon" } });
    expect(pack.header).toContain("## How to use this (rules)");
    // Rules sit before the detail in the full document.
    expect(pack.full.indexOf("## How to use this (rules)")).toBeLessThan(pack.full.indexOf("## Wiki pages"));
  });

  it("ends the full document with the task placeholder (query-at-end)", () => {
    const pack = composeContextPack(PAGES, SOURCES, { identity: { displayName: "Simon" } });
    const taskIdx = pack.full.indexOf("## Your task");
    expect(taskIdx).toBeGreaterThan(-1);
    // Nothing of substance after the task section — it is the very end.
    expect(pack.full.indexOf("## Wiki pages")).toBeLessThan(taskIdx);
    expect(pack.full.indexOf("## Sources")).toBeLessThan(taskIdx);
    expect(pack.full.trimEnd().endsWith(pack.full.slice(taskIdx).trimEnd())).toBe(true);
  });

  it("the header alone is self-contained (identity + rules + index) and carries no task", () => {
    const pack = composeContextPack(PAGES, SOURCES, { identity: { displayName: "Simon" } });
    expect(pack.header).toContain("## Who this is");
    expect(pack.header).toContain("## How to use this (rules)");
    expect(pack.header).toContain("## What's inside (index)");
    // The task placeholder belongs only to `full` (header-only use = consumer's
    // own input box is the query-at-end).
    expect(pack.header).not.toContain("## Your task");
  });

  it("fits the Gemini Gems 4K budget for a typical pack (graceful degrade)", () => {
    const pack = composeContextPack(PAGES, SOURCES, { identity: { displayName: "Simon", topPatterns: ["Curious", "Reflective"] } });
    expect(pack.headerChars).toBeLessThanOrEqual(PACK_TARGET_LIMITS.geminiGems);
    expect(pack.fitsHeaderOnly.geminiGems).toBe(true);
    expect(pack.fitsHeaderOnly.customGpt).toBe(true);
  });

  it("weaves identity (name, one-liner, patterns) into the header", () => {
    const pack = composeContextPack(PAGES, SOURCES, {
      identity: { displayName: "Simon", oneLiner: "Evening-and-weekend maker", topPatterns: ["Curious", "Reflective"] },
    });
    expect(pack.header).toContain("Simon's personal context");
    expect(pack.header).toContain("Evening-and-weekend maker");
    expect(pack.header).toContain("Recurring patterns: Curious, Reflective.");
  });

  it("indexes what's inside with counts and recurring topics", () => {
    const pack = composeContextPack(PAGES, SOURCES, {});
    expect(pack.sections.find((s) => s.id === "concepts")?.itemCount).toBe(1);
    expect(pack.sections.find((s) => s.id === "entities")?.itemCount).toBe(1);
    expect(pack.sections.find((s) => s.id === "sources")?.itemCount).toBe(2);
    // psychology appears in 3 items → surfaces as a recurring topic.
    expect(pack.header).toContain("recurring topics: psychology");
  });

  it("omits the records section unless records are provided (opt-in)", () => {
    const without = composeContextPack(PAGES, SOURCES, {});
    expect(without.detail).not.toContain("## Records");
    expect(without.recordCount).toBe(0);

    const withRecords = composeContextPack(PAGES, SOURCES, {}, [
      { kind: "journal", topic: "Morning", body: "Woke early, felt clear.", created_at: "2026-06-15T00:00:00Z", tags: ["daily"] },
    ]);
    expect(withRecords.detail).toContain("## Records");
    expect(withRecords.recordCount).toBe(1);
    expect(withRecords.sections.some((s) => s.id === "records")).toBe(true);
  });

  it("falls back gracefully with no identity and no data", () => {
    const pack = composeContextPack([], [], {});
    expect(pack.header).toContain("Your personal context");
    expect(pack.header).toContain("## How to use this (rules)");
    expect(pack.fitsHeaderOnly.geminiGems).toBe(true);
    expect(pack.full).toContain("## Your task");
  });

  it("renders a Korean pack", () => {
    const pack = composeContextPack(PAGES, SOURCES, { locale: "ko", identity: { displayName: "사이먼" } });
    expect(pack.header).toContain("사이먼의 개인 컨텍스트");
    expect(pack.header).toContain("## 사용 방법 (규칙)");
    expect(pack.full).toContain("## 당신의 과제");
  });

  it("keeps the header vocabulary lexicon-clean (no clinical terms)", () => {
    const en = composeContextPack(PAGES, SOURCES, { identity: { displayName: "Simon" } });
    const ko = composeContextPack(PAGES, SOURCES, { locale: "ko", identity: { displayName: "사이먼" } });
    expect(containsForbiddenLexicon(en.header, "en")).toEqual([]);
    expect(containsForbiddenLexicon(ko.header, "ko")).toEqual([]);
  });
});
