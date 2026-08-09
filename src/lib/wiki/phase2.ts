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
import { materializeGraphFromPhase1 } from "./materialize";
import { getSource, getWikiPage, markSourceIngested, syncWikiLinks, upsertWikiPage } from "./queries";
import { slugForTitle, toSlug } from "./slug";
import { downloadRawClipping } from "./storage";
import { embedAndStorePage } from "./embeddings";
import { getEnv } from "../env";
import type { WikiPageRow } from "./types";

export interface GenerateSourcePageResult {
  page: WikiPageRow;
  /** Slug actually used (after toSlug + de-duplication suffix if needed). */
  slug: string;
  /** Number of [[wikilink]] edges created during sync. */
  linksAdded: number;
  /** Slugs the body references that didn't resolve to any existing page. */
  danglingSlugs: string[];
  /** New entity pages materialized from Phase 1 (graph nodes). */
  entityPagesAdded: number;
  /** New concept pages materialized from Phase 1 (graph nodes). */
  conceptPagesAdded: number;
  /** New source→entity/concept edges drawn from Phase 1 extraction. */
  nodeLinksAdded: number;
}

export class SourceNotFoundError extends Error {
  constructor(public readonly sourceId: string) {
    super(`No source row for id=${sourceId}`);
    this.name = "SourceNotFoundError";
  }
}

/** The row exists but neither Storage nor the frontmatter fallback holds a body. */
export class SourceBodyUnavailableError extends Error {
  constructor(public readonly sourceId: string) {
    super(`No readable body for source id=${sourceId}`);
    this.name = "SourceBodyUnavailableError";
  }
}

/**
 * The body capture.ts stashes on the row when the Storage upload fails. Same
 * shape get-piece.ts reads, deliberately duplicated rather than imported: wiki/
 * must not take an edge on records/ (check:cycles is a zero-tolerance gate).
 */
function bodyFallback(frontmatter: Record<string, unknown> | null): string | null {
  const body = frontmatter?._body_fallback;
  return typeof body === "string" && body.trim().length > 0 ? body : null;
}

/**
 * Promote a source to a wiki page. Idempotent: re-running on the same source
 * overwrites the page body with the latest Storage content, re-syncs links,
 * and is safe to call multiple times.
 */
export async function generateSourcePage(userId: string, sourceId: string): Promise<GenerateSourcePageResult> {
  const source = await getSource(userId, sourceId);
  if (!source) throw new SourceNotFoundError(sourceId);

  // storage_path being set is NOT evidence the object exists: capture.ts writes
  // the canonical path onto the row even when the upload failed, stashing the
  // body in frontmatter._body_fallback. Promotion used to trust the path and
  // throw on those rows, which is why the QA account's only source (a KakaoTalk
  // import whose upload failed, 48 bytes sitting in _body_fallback) could never
  // become a wiki page. get-piece.ts already reads the same fallback, so the
  // detail screen rendered the body fine while promotion died on it.
  const body = (await downloadRawClipping(source.storage_path).catch(() => null)) ?? bodyFallback(source.frontmatter);
  if (body === null) throw new SourceBodyUnavailableError(sourceId);
  // slugForTitle (not toSlug) so a title written purely in CJK/Cyrillic/Thai
  // doesn't collapse to "" and overwrite another foreign-titled page on the
  // (user_id, slug) upsert key.
  const baseSlug = slugForTitle(source.title);
  // Do not clobber somebody else's page. The upsert below keys on
  // (user_id, slug), so a source whose title slugs onto an existing entity or
  // concept page — or onto a DIFFERENT source's page — would silently flip that
  // row to kind='source', replace its body_md and steal its source_id.
  // materialize.ts already refuses to overwrite (it get-or-creates); this is the
  // one writer that did not. Disambiguate instead, deterministically, so a
  // re-promotion of the same source still lands on the same page.
  const owner = await getWikiPage(userId, baseSlug);
  const slug =
    owner && owner.source_id !== source.id ? `${baseSlug}-${source.id.slice(0, 8)}` : baseSlug;

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

  // Phase 1.5: turn the extracted entities/concepts into graph nodes and link
  // the source page to each. Skipped cleanly when there's no Phase 1 output
  // (offline-preview rows, or sources captured before Phase 1 ran).
  const materialized = phase1
    ? await materializeGraphFromPhase1(userId, { id: page.id }, phase1)
    : { entityPagesCreated: 0, conceptPagesCreated: 0, pagesReused: 0, linksAdded: 0 };

  // Phase 2 promotion implies the source is now part of the user's wiki —
  // mark it ingested so the inbox view reflects it.
  if (!source.ingested) await markSourceIngested(userId, sourceId);

  // Auto-embed the new page so the semantic layer (kNN "연결 제안 찾기") populates
  // on write, instead of staying dormant until a manual backfill tap. Migration
  // 0068 NULLed every vector, and the only repopulation path was a user tapping
  // the button on /research, so kNN was empty for everyone on first run. Skipped
  // in mock mode (mock embeddings are random unit vectors that would poison
  // cosine similarity). Best-effort: the single embedTexts call is spend-capped
  // at the proxy, and a failure must never block wiki promotion.
  if (getEnv().EXPO_PUBLIC_LLM_MODE !== "mock") {
    try {
      await embedAndStorePage(userId, page);
    } catch {
      // best-effort: embedding failure does not fail the promotion
    }
  }

  return {
    page,
    slug: page.slug,
    linksAdded: sync.added,
    danglingSlugs: sync.dangling,
    entityPagesAdded: materialized.entityPagesCreated,
    conceptPagesAdded: materialized.conceptPagesCreated,
    nodeLinksAdded: materialized.linksAdded,
  };
}
