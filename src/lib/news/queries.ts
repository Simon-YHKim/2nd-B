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
  return (data ?? []) as NewsItemRow[];
}

/**
 * Persist the AI summary onto a cached article (owner-scoped by user_id + id).
 * Writing the summary exactly once is what keeps the cost bounded — the caller
 * (summarize flow) MUST call this so the same article is never re-summarized.
 */
export async function setSummary(
  userId: string,
  itemId: string,
  summary: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("news_items")
    .update({ summary })
    .eq("user_id", userId)
    .eq("id", itemId);
  if (error) throw error;
}
