// Phase 2 source-page generation (no-LLM stub).
//
// Promotes an ingested `sources` row to a `wiki_pages` row of kind='source':
// downloads the raw markdown from Storage, upserts a wiki page keyed by
// (user_id, slug), then runs syncWikiLinks against its body so any
// [[wikilinks]] referencing existing pages become real edges.
//
// Without an LLM connection this is a 1:1 promotion — no summary, no
// extracted entities/concepts. The full handoff §5 workflow uses Phase 1
// (Gemini summarize + auto-tag + 4 reflection questions) BEFORE Phase 2;
// once Gemini is wired up, this function will accept the Phase-1 output
// (summary, suggested_slug overrides, additional tags) as inputs.

import { readPhase1 } from "./phase1";
import { getSource, markSourceIngested, syncWikiLinks, upsertWikiPage } from "./queries";
import { slugForTitle, toSlug } from "./slug";
import { downloadRawClipping } from "./storage";
import type { WikiPageRow } from "./types";

export interface GenerateSourcePageResult {
  page: WikiPageRow;
  /** Slug actually used (after toSlug + de-duplication suffix if needed). */
  slug: string;
  /** Number of [[wikilink]] edges created during sync. */
  linksAdded: number;
  /** Slugs the body references that didn't resolve to any existing page. */
  danglingSlugs: string[];
}

export class SourceNotFoundError extends Error {
  constructor(public readonly sourceId: string) {
    super(`No source row for id=${sourceId}`);
    this.name = "SourceNotFoundError";
  }
}

/**
 * Promote a source to a wiki page. Idempotent: re-running on the same source
 * overwrites the page body with the latest Storage content, re-syncs links,
 * and is safe to call multiple times.
 */
export async function generateSourcePage(userId: string, sourceId: string): Promise<GenerateSourcePageResult> {
  const source = await getSource(userId, sourceId);
  if (!source) throw new SourceNotFoundError(sourceId);

  const body = await downloadRawClipping(source.storage_path);
  // slugForTitle (not toSlug) so a title written purely in CJK/Cyrillic/Thai
  // doesn't collapse to "" and overwrite another foreign-titled page on the
  // (user_id, slug) upsert key.
  const slug = slugForTitle(source.title);

  // Merge Phase 1 concepts into tags (when present). Concepts are the
  // LLM's distilled abstract ideas — natural tag candidates. Dedupe to
  // avoid duplicates from concepts that already match user tags.
  const phase1 = readPhase1(source.frontmatter);
  const conceptTags = phase1
    ? phase1.concepts.map((c) => toSlug(c)).filter((c) => c.length > 0)
    : [];
  const mergedTags = Array.from(new Set([...source.tags, ...conceptTags]));

  const page = await upsertWikiPage({
    user_id: userId,
    slug,
    kind: "source",
    title: source.title,
    body_md: body,
    frontmatter: source.frontmatter,
    tags: mergedTags,
    source_id: source.id,
  });

  const sync = await syncWikiLinks(userId, { id: page.id, body_md: body });

  // Phase 2 promotion implies the source is now part of the user's wiki —
  // mark it ingested so the inbox view reflects it.
  if (!source.ingested) await markSourceIngested(userId, sourceId);

  return {
    page,
    slug: page.slug,
    linksAdded: sync.added,
    danglingSlugs: sync.dangling,
  };
}
