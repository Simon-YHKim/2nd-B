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
import type { SourceKind, SourceRow, WikiPageKind, WikiPageRow } from "./types";

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
}

export async function createSource(input: CreateSourceInput): Promise<SourceRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("sources").insert(input).select().single();
  if (error) throw error;
  return data as SourceRow;
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
  if (error) throw error;
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
  const { data, error } = await supabase
    .from("wiki_links")
    .select("from_page, to_page")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as { from_page: string; to_page: string }[];
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
      .in("to_page", diff.toRemoveIds);
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
