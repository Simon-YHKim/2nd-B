// Wiki STEP 4 — semantic layer over wiki_pages (migration 0047).
//
// Pure ranking helpers (cosineSimilarity / rankBySimilarity) + the thin DB
// wrappers that store a page's embedding and run pgvector kNN. All model calls
// route through embedTexts in the LLM boundary (C1/C3/C9 + cost guard), so this
// module never touches @google/genai directly.
//
// Populate lazily: embedAndStorePage on demand, or backfillEmbeddings to fill
// pages that don't have a vector yet. relatedByEmbedding reads neighbours back.

import { embedTexts, EMBED_DIM } from "../llm/gemini";
import { getSupabaseClient } from "../supabase/client";
import { insertInferredLinks, listWikiPages, type InferredEdgeInput } from "./queries";
import type { WikiPageRow } from "./types";

/** Cosine similarity of two equal-length vectors; 0 for empty/mismatched. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export interface RankedPage {
  id: string;
  score: number;
}

/** Rank candidates by cosine similarity to a query vector, best first. Pure —
 *  an in-memory fallback for when the pgvector RPC isn't available (and the
 *  thing the kNN RPC computes server-side). */
export function rankBySimilarity(
  query: number[],
  candidates: { id: string; embedding: number[] }[],
  k = 8,
): RankedPage[] {
  return candidates
    .map((c) => ({ id: c.id, score: cosineSimilarity(query, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** The text we embed for a page: title + body, whitespace-trimmed and capped
 *  (gemini-embedding-2 counts input tokens; 2k chars is plenty for a page). */
export function pageEmbeddingText(page: Pick<WikiPageRow, "title" | "body_md">, max = 2000): string {
  const text = `${page.title}\n\n${page.body_md}`.trim();
  return text.length > max ? text.slice(0, max) : text;
}

/** Postgres vector input format is the same bracketed list as JSON. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Store a page's embedding (vector column, migration 0047). */
export async function storeWikiPageEmbedding(
  userId: string,
  pageId: string,
  embedding: number[],
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("wiki_pages")
    .update({ embedding: toVectorLiteral(embedding) })
    .eq("user_id", userId)
    .eq("id", pageId);
  if (error) throw error;
}

/**
 * Embed one page and persist its vector. Returns false (no write) when the page
 * has no text or the model produced nothing usable (e.g. red-zone → zero
 * vector, or live API-key egress was refused by the cost guard upstream).
 */
export async function embedAndStorePage(
  userId: string,
  page: Pick<WikiPageRow, "id" | "title" | "body_md">,
  locale: "en" | "ko" = "en",
  minor = false,
): Promise<boolean> {
  const text = pageEmbeddingText(page);
  if (text.length === 0) return false;
  const { vectors } = await embedTexts({ userId, texts: [text], locale, minor });
  const vec = vectors[0];
  if (!vec || vec.length !== EMBED_DIM || vec.every((x) => x === 0)) return false;
  await storeWikiPageEmbedding(userId, page.id, vec);
  return true;
}

export interface BackfillResult {
  scanned: number;
  embedded: number;
}

/**
 * Embed pages that don't have a vector yet (bounded). P0-2: collects the whole
 * batch and makes ONE embedTexts call (the old loop made up to 50 serial model
 * calls — 50x the request-count spend for the same vectors). Stores are still
 * best-effort per page so one failed write doesn't abort the batch.
 */
export async function backfillEmbeddings(
  userId: string,
  opts: { locale?: "en" | "ko"; minor?: boolean; limit?: number } = {},
): Promise<BackfillResult> {
  const limit = opts.limit ?? 50;
  const pages = await listWikiPages(userId, { limit: 200 });
  const targets: { page: (typeof pages)[number]; text: string }[] = [];
  for (const page of pages) {
    if (targets.length >= limit) break;
    // A page already carrying an embedding is skipped (the column is selected
    // by listWikiPages' `*`, present only after a prior backfill).
    if ((page as WikiPageRow & { embedding?: unknown }).embedding) continue;
    const text = pageEmbeddingText(page);
    if (text.length === 0) continue;
    targets.push({ page, text });
  }
  if (targets.length === 0) return { scanned: 0, embedded: 0 };

  let embedded = 0;
  try {
    const { vectors } = await embedTexts({
      userId,
      texts: targets.map((t) => t.text),
      locale: opts.locale ?? "en",
      minor: opts.minor ?? false,
    });
    for (let i = 0; i < targets.length; i++) {
      const vec = vectors[i];
      // Red-zone texts come back as zero vectors (C9) — never stored.
      if (!vec || vec.length !== EMBED_DIM || vec.every((x) => x === 0)) continue;
      try {
        await storeWikiPageEmbedding(userId, targets[i].page.id, vec);
        embedded += 1;
      } catch {
        // best-effort; move on
      }
    }
  } catch {
    // Batch failure (egress error, or a server-side crisis 422 on ONE text
    // rejecting the whole request). Fall back to per-page calls so a single
    // poisoned/failing page can't wedge the entire index build — the old
    // serial behavior, but only as the recovery path.
    for (const target of targets) {
      try {
        const ok = await embedAndStorePage(userId, target.page, opts.locale ?? "en", opts.minor ?? false);
        if (ok) embedded += 1;
      } catch {
        // best-effort; isolate and move on
      }
    }
  }
  return { scanned: targets.length, embedded };
}

export interface RelatedPage {
  id: string;
  slug: string;
  title: string;
  kind: string;
  similarity: number;
}

/**
 * Semantic neighbours of a page via the pgvector kNN RPC (migration 0047).
 * Empty when the page has no embedding yet.
 */
export async function relatedByEmbedding(
  userId: string,
  pageId: string,
  k = 6,
): Promise<RelatedPage[]> {
  const supabase = getSupabaseClient();
  const { data: page, error: e1 } = await supabase
    .from("wiki_pages")
    .select("embedding")
    .eq("user_id", userId)
    .eq("id", pageId)
    .maybeSingle();
  if (e1) throw e1;
  const embedding = (page as { embedding: string | number[] | null } | null)?.embedding ?? null;
  if (!embedding) return [];
  const { data, error } = await supabase.rpc("match_wiki_pages", {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: k,
    exclude_id: pageId,
  });
  if (error) throw error;
  return (data ?? []) as RelatedPage[];
}

// --- propose -> ratify bridge (STEP 2 + STEP 4) ---------------------------

/** Turn kNN neighbours into inferred-link proposals: keep the ones above the
 *  confidence floor and shape them for insertInferredLinks. Pure. The 0.5 floor
 *  also naturally drops mock embeddings (random 768-dim vectors sit near 0
 *  cosine), so dev/CI never proposes noise — only real embeddings do. */
export function proposalsFromNeighbors(
  neighbors: { id: string; similarity: number }[],
  minConfidence = 0.5,
): InferredEdgeInput[] {
  return neighbors
    .filter((n) => n.similarity >= minConfidence)
    .map((n) => ({ toPageId: n.id, confidence: n.similarity }));
}

/** Propose inferred links from a page to its semantic neighbours (canon's
 *  propose->ratify: the AI emits `inferred`, the user ratifies). Returns the
 *  number of new proposals inserted. */
export async function proposeRelatedLinks(
  userId: string,
  pageId: string,
  opts: { k?: number; minConfidence?: number } = {},
): Promise<number> {
  const neighbors = await relatedByEmbedding(userId, pageId, opts.k ?? 6);
  const edges = proposalsFromNeighbors(neighbors, opts.minConfidence ?? 0.5);
  return insertInferredLinks(userId, pageId, edges);
}

export interface ProposeAllResult {
  pagesScanned: number;
  proposed: number;
}

/** Propose inferred links across the user's pages (bounded, best-effort). Pages
 *  without an embedding yield no neighbours, so they're skipped naturally. */
export async function proposeAllRelatedLinks(
  userId: string,
  opts: { k?: number; minConfidence?: number; limit?: number } = {},
): Promise<ProposeAllResult> {
  const limit = opts.limit ?? 50;
  const pages = await listWikiPages(userId, { limit: 200 });
  let proposed = 0;
  let pagesScanned = 0;
  for (const page of pages) {
    if (pagesScanned >= limit) break;
    pagesScanned += 1;
    try {
      proposed += await proposeRelatedLinks(userId, page.id, opts);
    } catch {
      // best-effort; one page failing shouldn't abort the batch
    }
  }
  return { pagesScanned, proposed };
}
