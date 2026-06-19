// Wave 2 — RLS-scoped persistence for news_items (migration 0052).
//
// Owner-only: news_items is owner-only RLS (auth.uid() = user_id), so every
// query is also scoped with .eq("user_id", userId) — the explicit argument must
// equal auth.uid() or the policy rejects the write.
//
// COST/CORRECTNESS contract:
//   - upsertItems caches fetched RSS items, ignoring duplicates on the
//     UNIQUE(user_id, url) key (ON CONFLICT DO NOTHING). A re-pull is idempotent
//     and never clobbers an existing row's `summary` (an article is summarized
//     at most ONCE).
//   - setSummary writes the AI summary onto the single cached row. It is the
//     only writer of `summary`, and the unique key means it lands on one row.
// No LLM lives here — summarize.ts owns the C1 gateway call.

import { getSupabaseClient } from "../supabase/client";
import type { NewsItem } from "./parse";

/** A persisted news row (mirrors the news_items columns). */
export interface NewsItemRow {
  id: string;
  user_id: string;
  source: string;
  title: string;
  url: string;
  published_at: string | null;
  snippet: string | null;
  summary: string | null;
  /**
   * Atomic summary-slot state (migration 0052). Only 'done' counts as a real
   * cached summary; 'none'/'pending' rows are treated as not-yet-summarized.
   * Optional on the type so legacy callers/fixtures stay valid.
   */
  summary_status?: "none" | "pending" | "done" | null;
  /**
   * When the slot was last claimed (migration 0052). Used by claimSummarySlot's
   * stale-claim reclaim TTL. Optional on the type so legacy fixtures stay valid.
   */
  summary_claimed_at?: string | null;
  created_at: string | null;
}

function toInsert(userId: string, item: NewsItem): Record<string, unknown> {
  return {
    user_id: userId,
    source: item.source,
    title: item.title,
    url: item.url,
    published_at: item.publishedAt,
    snippet: item.snippet,
    // summary stays NULL on insert — it is filled later, opt-in, via setSummary.
  };
}

/**
 * Cache a batch of fetched items for the user. Duplicates (same user_id+url)
 * are ignored so a re-pull is idempotent and an existing row's cached summary is
 * preserved. Returns the rows that were newly inserted (Supabase returns only
 * the inserted rows for an ignoreDuplicates upsert).
 */
export async function upsertItems(userId: string, items: NewsItem[]): Promise<NewsItemRow[]> {
  if (items.length === 0) return [];
  const supabase = getSupabaseClient();
  const rows = items.map((item) => toInsert(userId, item));
  const { data, error } = await supabase
    .from("news_items")
    .upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true })
    .select();
  if (error) throw error;
  return (data ?? []) as NewsItemRow[];
}

/** The user's cached digest (RLS-scoped), newest first. */
export async function listDigest(userId: string, limit = 30): Promise<NewsItemRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("news_items")
    .select("*")
    .eq("user_id", userId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as NewsItemRow[];
  // Only summary_status='done' counts as a real cached summary. A row mid-claim
  // ('pending') — or a legacy row whose status was never set — must read as
  // not-yet-summarized so the UI/canSummarize don't surface a half-written or
  // absent summary. Normalize the in-memory `summary` to null unless 'done'.
  return rows.map((r) =>
    r.summary_status === "done" ? r : { ...r, summary: null },
  );
}

/**
 * How long a 'pending' claim may sit before it's considered abandoned and
 * reclaimable. If a process dies after claimSummarySlot stamps 'pending' but
 * before setSummary/releaseSummarySlot, the row would otherwise wedge in
 * 'pending' forever and every retry returns claim_failed. After this TTL a new
 * caller may steal the slot.
 */
export const SUMMARY_CLAIM_TTL_MS = 5 * 60_000;

/**
 * Atomically CLAIM the summary slot for one article before the LLM call
 * (Codex P2 #2 — double-bill guard). Compare-and-set: stamp summary_claimed_at
 * = now and flip summary_status to 'pending' for exactly ONE caller. The WHERE
 * matches a row that is EITHER:
 *   - summary_status='none' (free to claim), OR
 *   - summary_status='pending' AND summary_claimed_at older than the TTL (a
 *     stale/abandoned claim from a process that died mid-flight — reclaimable).
 * Two concurrent fresh callers race here; the DB serializes the UPDATE so only
 * the first matches and the loser sees 0 rows affected.
 *
 * Returns the CLAIM TOKEN (the summary_claimed_at ISO string this caller stamped)
 * when THIS caller won the claim — it must thread that token through to
 * setSummary/releaseSummarySlot so only the winning claimant can commit/release.
 * Returns null when the slot was already claimed-and-fresh or summarized (the
 * caller must skip the LLM entirely — no second callGemini, no double billing).
 *
 * Why the token (Codex P2 #2 follow-up): with the stale-claim reclaim TTL, a slow
 * (not dead) original caller can have its 'pending' claim STOLEN by a reclaimer
 * after the TTL. Without a token, the original's later setSummary/releaseSummarySlot
 * — which match only (user_id, id, status='pending') — would clobber the
 * reclaimer's fresh claim (commit stale output / release a slot it no longer
 * owns). Scoping those writes additionally to summary_claimed_at=<token> means a
 * loser matches 0 rows (a safe no-op).
 *
 * Owner-scoped (user_id = auth.uid()) so the RLS policy still gates the write.
 */
export async function claimSummarySlot(userId: string, itemId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const claimedAt = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - SUMMARY_CLAIM_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("news_items")
    .update({ summary_status: "pending", summary_claimed_at: claimedAt })
    .eq("user_id", userId)
    .eq("id", itemId)
    .or(`summary_status.eq.none,and(summary_status.eq.pending,summary_claimed_at.lt.${cutoffIso})`)
    .select("id");
  if (error) throw error;
  // Exactly one row returned == we won the compare-and-set: return the token we
  // stamped. Anything else (already pending-and-fresh / done, or row gone) ==
  // the claim failed (null).
  return (data?.length ?? 0) > 0 ? claimedAt : null;
}

/**
 * Release a previously-claimed slot back to 'none' (Codex P2 #2/#3). Called
 * when the LLM call was blocked (red-zone) or failed/produced nothing, so a
 * later retry can re-claim. Owner-scoped; only releases rows we left 'pending'
 * AND that still carry OUR claim token (summary_claimed_at = claimToken). After
 * a stale-claim reclaim the row's token is the reclaimer's, so a slow original
 * caller's release matches 0 rows (a safe no-op) instead of stealing back the
 * reclaimer's fresh claim. Never clobbers a 'done' summary. Best-effort: a
 * release failure must not mask the original error, so it is intended to be
 * called inside a try/catch.
 */
export async function releaseSummarySlot(
  userId: string,
  itemId: string,
  claimToken: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("news_items")
    .update({ summary_status: "none", summary_claimed_at: null })
    .eq("user_id", userId)
    .eq("id", itemId)
    .eq("summary_status", "pending")
    .eq("summary_claimed_at", claimToken);
  if (error) throw error;
}

/**
 * Persist the AI summary onto a cached article (owner-scoped by user_id + id)
 * and mark the slot 'done'. Writing the summary exactly once is what keeps the
 * cost bounded — the caller (summarize flow) MUST call this after a winning
 * claimSummarySlot so the same article is never re-summarized. Scoping the
 * write to summary_status='pending' AND summary_claimed_at=claimToken means only
 * the caller that won THIS claim commits the result: after a stale-claim reclaim
 * the row carries the reclaimer's token, so a slow original caller's late commit
 * matches 0 rows (a safe no-op) instead of clobbering the reclaimer's fresh
 * claim with stale output.
 */
export async function setSummary(
  userId: string,
  itemId: string,
  summary: string,
  claimToken: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("news_items")
    .update({ summary, summary_status: "done" })
    .eq("user_id", userId)
    .eq("id", itemId)
    .eq("summary_status", "pending")
    .eq("summary_claimed_at", claimToken);
  if (error) throw error;
}
