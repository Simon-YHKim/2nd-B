// Data-access layer for the wiki/RAG schema (migration 0022).
// Thin Supabase wrappers + the one composite operation (syncWikiLinks) that
// glues the wikilinks parser to the wiki_links edge table.
//
// Callers: ingest UI (PR 2), Phase 1/2 workflows (PR 3/4), graph view (PR 5).
//
// RLS does the authorization — every query is implicitly scoped to
// auth.uid() via the owner-only policies on sources/wiki_pages/wiki_links.
// The explicit user_id parameter is for clarity and indexing; it must
// always equal auth.uid() (otherwise RLS rejects the operation).

import { getSupabaseClient } from "../supabase/client";
import { diffWikiLinks } from "./link-diff";
import { extractWikilinkSlugs } from "./wikilinks";
import type { RelationType, SourceKind, SourceRow, WikiPageKind, WikiPageRow } from "./types";

// --- sources -----------------------------------------------------------

export interface CreateSourceInput {
  user_id: string;
  kind: SourceKind;
  title: string;
  source_url: string | null;
  storage_path: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  simon_relevance: number | null;
  // §1 ingest gate (0044). All optional — omitting them keeps the legacy insert.
  content_hash?: string;
  relevance_score?: number | null;
  dedup_of?: string | null;
  dedup_signature?: number[];
  dedup_bands?: string[];
}

export async function createSource(input: CreateSourceInput, signal?: AbortSignal): Promise<SourceRow> {
  const supabase = getSupabaseClient();
  const query = supabase.from("sources").insert(input).select();
  const { data, error } = await (signal ? query.abortSignal(signal) : query).single();
  if (error) throw error;
  return data as SourceRow;
}

// --- §1 ingest gate (0044) ---------------------------------------------

export interface IngestCandidateRow {
  id: string;
  content_hash: string | null;
  dedup_signature: number[] | null;
}

/**
 * Fetch prior sources that could collide with an incoming clip: an exact
 * content_hash match OR any row whose LSH band keys overlap. Two queries
 * (merged, unique by id) instead of a hand-built `.or()` array literal, which
 * is brittle with the colon/comma in band keys. RLS scopes both to the user.
 */
export async function findIngestCandidates(
  userId: string,
  bandKeys: string[],
  contentHash: string,
  signal?: AbortSignal,
): Promise<IngestCandidateRow[]> {
  const supabase = getSupabaseClient();
  const base = () =>
    supabase.from("sources").select("id, content_hash, dedup_signature").eq("user_id", userId).limit(50);
  const exactQ = base().eq("content_hash", contentHash);
  const bandQ = base().overlaps("dedup_bands", bandKeys);
  const [exact, band] = await Promise.all([
    signal ? exactQ.abortSignal(signal) : exactQ,
    signal ? bandQ.abortSignal(signal) : bandQ,
  ]);
  if (exact.error) throw exact.error;
  if (band.error) throw band.error;
  const byId = new Map<string, IngestCandidateRow>();
  for (const r of [...(exact.data ?? []), ...(band.data ?? [])]) {
    byId.set((r as IngestCandidateRow).id, r as IngestCandidateRow);
  }
  return [...byId.values()];
}

export interface IngestDropInput {
  user_id: string;
  content_hash: string;
  stage: string;
  reason: string;
  survivor_id: string | null;
}

/** Append a drop record to the ingest_log ledger (0044). */
export async function recordIngestDrop(input: IngestDropInput, signal?: AbortSignal): Promise<void> {
  const supabase = getSupabaseClient();
  const query = supabase.from("ingest_log").insert(input);
  const { error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
}

export interface ListSourcesOpts {
  ingested?: boolean;
  kinds?: SourceKind[];
  limit?: number;
}

export async function listSources(userId: string, opts: ListSourcesOpts = {}): Promise<SourceRow[]> {
  const supabase = getSupabaseClient();
  let q = supabase.from("sources").select("*").eq("user_id", userId).order("captured_at", { ascending: false });
  if (opts.ingested !== undefined) q = q.eq("ingested", opts.ingested);
  if (opts.kinds && opts.kinds.length > 0) q = q.in("kind", opts.kinds);
  if (opts.limit !== undefined) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SourceRow[];
}

export async function getSource(userId: string, id: string): Promise<SourceRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as SourceRow | null;
}

export async function markSourceIngested(userId: string, sourceId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("sources")
    .update({ ingested: true, ingested_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", sourceId);
  if (error) throw error;
}

/**
 * Delete a source row. wiki_pages.source_id is ON DELETE SET NULL, but
 * the wiki_pages_source_kind_pair CHECK constraint requires kind='source'
 * ⇔ source_id IS NOT NULL. So sources that have been promoted to a
 * wiki page CAN'T be cleanly deleted without first deleting the wiki page.
 * The inbox UI only exposes the delete action on un-ingested rows.
 *
 * Storage cleanup (deleting the .md from raw-clippings) is not automated
 * here — operator can prune Storage manually or via a scheduled Edge
 * Function later.
 */
export async function deleteSource(userId: string, sourceId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("sources")
    .delete()
    .eq("user_id", userId)
    .eq("id", sourceId);
  if (error) throw error;
}

/** Sources whose Storage upload failed at capture time (frontmatter carries
 *  _storage_pending + _body_fallback, see capture.ts). Oldest first, bounded —
 *  promote-pending retries opportunistically, not exhaustively. */
export async function listStoragePendingSources(userId: string, limit = 10): Promise<SourceRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", userId)
    .contains("frontmatter", { _storage_pending: true })
    .order("captured_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SourceRow[];
}

/** Replace a source's frontmatter wholesale (promote-pending clears the
 *  _storage_pending/_body_fallback pair after a successful re-upload). */
export async function updateSourceFrontmatter(
  userId: string,
  sourceId: string,
  frontmatter: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("sources")
    .update({ frontmatter })
    .eq("user_id", userId)
    .eq("id", sourceId);
  if (error) throw error;
}

/** Replace a source's tags column (inbox accepts an AI-suggested tag before
 *  promotion). Caller passes the full desired set; we don't merge here. */
export async function updateSourceTags(
  userId: string,
  sourceId: string,
  tags: string[],
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("sources")
    .update({ tags })
    .eq("user_id", userId)
    .eq("id", sourceId);
  if (error) throw error;
}

// --- wiki_pages --------------------------------------------------------

export interface UpsertWikiPageInput {
  user_id: string;
  slug: string;
  kind: WikiPageKind;
  title: string;
  body_md: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  source_id: string | null;
}

export async function upsertWikiPage(input: UpsertWikiPageInput): Promise<WikiPageRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("wiki_pages")
    .upsert(input, { onConflict: "user_id,slug" })
    .select()
    .single();
  if (error) {
    // Stale source_id race (goal-cycle1 punch #1): the user can delete a
    // source while phase2 ingest is still building its wiki page, so the FK
    // INSERT fails (23503) even though wiki_pages.source_id is ON DELETE SET
    // NULL by design. Persist the page without the vanished link instead of
    // surfacing an opaque FK error and losing the generated content.
    if ((error as { code?: string }).code === "23503" && input.source_id) {
      return upsertWikiPage({ ...input, source_id: null });
    }
    throw error;
  }
  return data as WikiPageRow;
}

export async function getWikiPage(userId: string, slug: string): Promise<WikiPageRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as WikiPageRow | null;
}

export async function getWikiPageById(userId: string, id: string): Promise<WikiPageRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as WikiPageRow | null;
}

export interface ListWikiPagesOpts {
  kinds?: WikiPageKind[];
  /** Pages whose tags array overlaps any of these (Postgres && operator). */
  anyOfTags?: string[];
  limit?: number;
}

export async function listWikiPages(userId: string, opts: ListWikiPagesOpts = {}): Promise<WikiPageRow[]> {
  const supabase = getSupabaseClient();
  let q = supabase.from("wiki_pages").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  if (opts.kinds && opts.kinds.length > 0) q = q.in("kind", opts.kinds);
  if (opts.anyOfTags && opts.anyOfTags.length > 0) q = q.overlaps("tags", opts.anyOfTags);
  if (opts.limit !== undefined) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WikiPageRow[];
}

/** Inverse of markSourceIngested: return a source to the capture inbox so it
 *  can be promoted again. Called when its promoted wiki page is deleted. */
export async function markSourceNotIngested(userId: string, sourceId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("sources")
    .update({ ingested: false, ingested_at: null })
    .eq("user_id", userId)
    .eq("id", sourceId);
  if (error) throw error;
}

/**
 * Delete a wiki page. wiki_links rows on both sides cascade automatically
 * (ON DELETE CASCADE in 0022).
 *
 * If the page was promoted from a source, that source is returned to the
 * un-ingested state so the capture inbox re-offers "Generate wiki page"
 * instead of stranding it on a dead "View in wiki" link pointing at a page
 * that no longer exists. (wiki_pages.source_id is the FK being deleted, so the
 * sources row is otherwise untouched — we reset ingested explicitly.) The
 * source reset is best-effort: the page deletion is the user's intent and has
 * already committed, so a reset failure is logged, not surfaced as a failure.
 */
export async function deleteWikiPage(userId: string, pageId: string): Promise<void> {
  const supabase = getSupabaseClient();
  // Read the promoted-from source BEFORE deleting, while the FK still exists.
  const { data: page, error: lookupErr } = await supabase
    .from("wiki_pages")
    .select("source_id")
    .eq("user_id", userId)
    .eq("id", pageId)
    .maybeSingle();
  if (lookupErr) throw lookupErr;

  const { error } = await supabase
    .from("wiki_pages")
    .delete()
    .eq("user_id", userId)
    .eq("id", pageId);
  if (error) throw error;

  const sourceId = (page as { source_id: string | null } | null)?.source_id ?? null;
  if (sourceId) {
    try {
      await markSourceNotIngested(userId, sourceId);
    } catch (e) {
      if (typeof console !== "undefined")
        console.warn("[wiki] page deleted but source reset failed", (e as Error).message);
    }
  }
}

/** Pages whose body links TO the given page (i.e., wiki_links.to_page = pageId). */
export async function getBacklinks(userId: string, pageId: string): Promise<WikiPageRow[]> {
  const supabase = getSupabaseClient();
  // Two-step: pull edges, then fetch source pages. We could express this as a
  // single join via PostgREST embedding (wiki_links!from_page) once the
  // foreign-key hints are registered; keeping it explicit for clarity.
  const { data: edges, error: edgesErr } = await supabase
    .from("wiki_links")
    .select("from_page")
    .eq("user_id", userId)
    .eq("to_page", pageId);
  if (edgesErr) throw edgesErr;
  const fromIds = (edges ?? []).map((e: { from_page: string }) => e.from_page);
  if (fromIds.length === 0) return [];
  const { data: pages, error: pagesErr } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("user_id", userId)
    .in("id", fromIds);
  if (pagesErr) throw pagesErr;
  return (pages ?? []) as WikiPageRow[];
}

// --- wiki_links --------------------------------------------------------

export interface OutgoingEdge {
  to_page_id: string;
  to_slug: string;
}

/** All wiki_links rows for the user. Used by the graph stats view. */
export async function listAllWikiLinks(userId: string): Promise<{ from_page: string; to_page: string }[]> {
  const supabase = getSupabaseClient();
  // Bound the fetch: wiki_links grows super-linearly with pages while the graph
  // only shows a capped node set, so an unbounded pull was a full-table client
  // read for large personal wikis (audit wave-3). 4000 edges is generous for the
  // 200-page cap yet stops the pathological case.
  const { data, error } = await supabase
    .from("wiki_links")
    .select("from_page, to_page")
    .eq("user_id", userId)
    .limit(4000);
  if (error) throw error;
  return (data ?? []) as { from_page: string; to_page: string }[];
}

// --- propose -> ratify (edge type + confidence, migration 0046) --------

export interface InferredEdgeInput {
  toPageId: string;
  /** Model 0..1 score; clamped on insert. */
  confidence: number;
}

/**
 * Insert AI-proposed (`inferred`) edges from one page. Never overwrites an
 * existing edge — a stronger explicit `wikilink` or already-`ratified` link
 * wins — via onConflict do-nothing. Self-links are dropped (the table's
 * wiki_links_no_self CHECK would reject them anyway). Returns the number of
 * rows sent for insert.
 */
export async function insertInferredLinks(
  userId: string,
  fromPageId: string,
  edges: InferredEdgeInput[],
): Promise<number> {
  if (edges.length === 0) return 0;
  const rows = edges
    .filter((e) => e.toPageId !== fromPageId)
    .map((e) => ({
      user_id: userId,
      from_page: fromPageId,
      to_page: e.toPageId,
      relation_type: "inferred" as RelationType,
      confidence: Math.min(1, Math.max(0, e.confidence)),
    }));
  if (rows.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("wiki_links")
    .upsert(rows, { onConflict: "from_page,to_page", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

export interface InferredEdgeRow {
  from_page: string;
  to_page: string;
  confidence: number;
}

/** The user's pending AI-proposed connections, highest-confidence first —
 *  the worklist a propose->ratify UI reads. */
export async function listInferredLinks(userId: string, limit = 50): Promise<InferredEdgeRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("wiki_links")
    .select("from_page, to_page, confidence")
    .eq("user_id", userId)
    .eq("relation_type", "inferred")
    .order("confidence", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as InferredEdgeRow[];
}

export interface InferredLinkDetail {
  from_page: string;
  to_page: string;
  from_title: string;
  to_title: string;
  confidence: number;
}

/** Inferred proposals resolved to page titles, for the ratify UI. Two-step
 *  (edges, then the pages they touch) — mirrors getBacklinks' explicit shape. */
export async function listInferredLinkDetails(userId: string, limit = 50): Promise<InferredLinkDetail[]> {
  const edges = await listInferredLinks(userId, limit);
  if (edges.length === 0) return [];
  const ids = [...new Set(edges.flatMap((e) => [e.from_page, e.to_page]))];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("wiki_pages")
    .select("id, title, slug")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  const titleById = new Map(
    (data ?? []).map((p: { id: string; title: string; slug: string }) => [
      p.id,
      (p.title?.trim() || p.slug || p.id),
    ]),
  );
  return edges.map((e) => ({
    from_page: e.from_page,
    to_page: e.to_page,
    from_title: titleById.get(e.from_page) ?? e.from_page,
    to_title: titleById.get(e.to_page) ?? e.to_page,
    confidence: e.confidence,
  }));
}

/** Promote an inferred edge to `ratified` (the user accepted the proposal).
 *  confidence is pinned to 1.0 — a ratified link is the user's own truth. */
export async function ratifyLink(userId: string, fromPageId: string, toPageId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("wiki_links")
    .update({ relation_type: "ratified" as RelationType, confidence: 1 })
    .eq("user_id", userId)
    .eq("from_page", fromPageId)
    .eq("to_page", toPageId);
  if (error) throw error;
}

/** Discard an AI-proposed edge the user rejected. Scoped to relation_type so
 *  an explicit wikilink/ratified edge is never deleted by a stray reject. */
export async function rejectInferredLink(
  userId: string,
  fromPageId: string,
  toPageId: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("wiki_links")
    .delete()
    .eq("user_id", userId)
    .eq("from_page", fromPageId)
    .eq("to_page", toPageId)
    .eq("relation_type", "inferred");
  if (error) throw error;
}

export async function getOutgoingLinks(userId: string, fromPageId: string): Promise<OutgoingEdge[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("wiki_links")
    .select("to_page, wiki_pages!wiki_links_to_fk(slug)")
    .eq("user_id", userId)
    .eq("from_page", fromPageId);
  if (error) throw error;
  const rows = (data ?? []) as { to_page: string; wiki_pages: { slug: string } | { slug: string }[] | null }[];
  // PostgREST may return the embedded relation as either an object (single)
  // or an array depending on the FK arity; normalize either shape.
  return rows.map((r) => {
    const embedded = Array.isArray(r.wiki_pages) ? r.wiki_pages[0] : r.wiki_pages;
    return { to_page_id: r.to_page, to_slug: embedded?.slug ?? "" };
  });
}

export interface SyncLinksResult {
  added: number;
  removed: number;
  dangling: string[];
}

/**
 * Re-extract [[wikilinks]] from the page's body_md and reconcile wiki_links.
 *
 * Two-phase update (delete then insert) — not transactional from the client,
 * so a brief inconsistency window exists if the second call fails. Acceptable
 * for an inline sync; PR 4 will move the heavy Phase 2 path through an Edge
 * Function RPC where a single SQL transaction makes this atomic.
 */
export async function syncWikiLinks(
  userId: string,
  fromPage: { id: string; body_md: string },
): Promise<SyncLinksResult> {
  const supabase = getSupabaseClient();
  const desiredSlugs = extractWikilinkSlugs(fromPage.body_md);

  // No outgoing links and nothing to add → fast path.
  const currentEdges = await getOutgoingLinks(userId, fromPage.id);
  if (desiredSlugs.length === 0 && currentEdges.length === 0) {
    return { added: 0, removed: 0, dangling: [] };
  }

  // Resolve desired slugs in a single query.
  let knownPagesBySlug = new Map<string, string>();
  if (desiredSlugs.length > 0) {
    const { data: pages, error: pagesErr } = await supabase
      .from("wiki_pages")
      .select("id, slug")
      .eq("user_id", userId)
      .in("slug", desiredSlugs);
    if (pagesErr) throw pagesErr;
    knownPagesBySlug = new Map((pages ?? []).map((p: { id: string; slug: string }) => [p.slug, p.id]));
  }

  const diff = diffWikiLinks({
    currentEdges,
    desiredSlugs,
    knownPagesBySlug,
    fromPageId: fromPage.id,
  });

  if (diff.toRemoveIds.length > 0) {
    const { error } = await supabase
      .from("wiki_links")
      .delete()
      .eq("from_page", fromPage.id)
      .in("to_page", diff.toRemoveIds)
      // Only reconcile literal [[wikilink]] edges. getOutgoingLinks returns edges
      // of every relation_type, so without this filter a body that no longer names
      // a page would also delete that page's inferred (AI-proposed) / ratified
      // (user-accepted) / materialized edges — permanent loss of real connections.
      .eq("relation_type", "wikilink");
    if (error) throw error;
  }

  if (diff.toAddIds.length > 0) {
    const { error } = await supabase
      .from("wiki_links")
      .insert(diff.toAddIds.map((to_page) => ({ user_id: userId, from_page: fromPage.id, to_page })));
    if (error) throw error;
  }

  return {
    added: diff.toAddIds.length,
    removed: diff.toRemoveIds.length,
    dangling: diff.danglingSlugs,
  };
}
