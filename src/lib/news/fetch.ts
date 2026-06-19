// Wave 2 — feed fetch. fetchFeed(feedId): network -> text -> parse.
//
// Guarded: a feed being down, a timeout, a non-200, or malformed XML must never
// crash the digest. A failure resolves to a FetchFeedResult with items:[] (the
// screen shows its empty state). No AI here — this is the deterministic, $0
// ground-truth path. The summary is a separate opt-in step (summarize.ts).
//
// Codex P2 #4 (Web CORS): on Expo web, a direct browser fetch() to a third-party
// RSS host is blocked by CORS — the request fails and the digest silently shows
// []. So fetchRaw() is PLATFORM-AWARE: native fetches the feed URL directly;
// web routes the fetch through the rss-proxy Supabase Edge Function (same-origin
// to the app's Supabase project), which fetches the XML server-side (no browser
// CORS) and returns it with permissive CORS headers. The proxy validates the
// requested url against the feeds allowlist (SSRF guard). The function MUST be
// deployed (`supabase functions deploy rss-proxy`); when it is not configured /
// not reachable, web returns an explicit "proxy_unavailable" error state rather
// than a silent [].

import { getFeed } from "./feeds";
import { parseFeed, type NewsItem } from "./parse";

const FETCH_TIMEOUT_MS = 8000;

/** Web detection that is safe in node/jest (no react-native Platform import). */
function isWeb(): boolean {
  // Mirrors src/lib/supabase/client.ts: a browser has `document`, node/RN don't.
  return typeof document !== "undefined";
}

export type FetchFeedError = "proxy_unavailable" | "fetch_failed";

export interface FetchFeedResult {
  items: NewsItem[];
  /** Set when items is [] for a non-empty reason the UI should surface. */
  error?: FetchFeedError;
}

/**
 * Pure routing decision for one feed fetch (exported for unit tests): on native
 * fetch the feed URL directly; on web go through the rss-proxy Edge Function.
 * Returns null when web cannot resolve a proxy target (function not configured)
 * so the caller can surface "proxy_unavailable" instead of a silent [].
 */
export function resolveFetchPlan(
  feedUrl: string,
  web: boolean,
): { mode: "direct"; url: string } | { mode: "proxy"; feedUrl: string } | null {
  if (!web) return { mode: "direct", url: feedUrl };
  return { mode: "proxy", feedUrl };
}

/** Fetch the raw XML for a feed, routing through the rss-proxy on web. */
async function fetchRaw(feedUrl: string, signal: AbortSignal): Promise<string | { error: FetchFeedError }> {
  const plan = resolveFetchPlan(feedUrl, isWeb());
  if (plan === null) return { error: "proxy_unavailable" };

  if (plan.mode === "direct") {
    const res = await fetch(plan.url, {
      method: "GET",
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal,
    });
    if (!res || !res.ok) return { error: "fetch_failed" };
    return res.text();
  }

  // Web: route through the rss-proxy Edge Function (same-origin to Supabase).
  // The proxy re-validates the url against the feeds allowlist server-side.
  const { getSupabaseClient } = await import("../supabase/client");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("rss-proxy", {
    body: { url: plan.feedUrl },
    signal,
  });
  if (error) return { error: "proxy_unavailable" };
  const xml = (data as { xml?: string } | null)?.xml;
  if (typeof xml !== "string" || xml.length === 0) return { error: "fetch_failed" };
  return xml;
}

/**
 * Fetch one curated feed and parse it into a FetchFeedResult.
 *
 * Never throws: an unknown id, a network error, a non-OK status, an unparseable
 * body, or (on web) an unconfigured proxy all resolve to items:[] (with an
 * `error` tag for the non-trivial cases). `source` on each item is the feed id.
 */
export async function fetchFeed(feedId: string): Promise<FetchFeedResult> {
  const feed = getFeed(feedId);
  if (!feed) return { items: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const raw = await fetchRaw(feed.url, controller.signal);
    if (typeof raw !== "string") return { items: [], error: raw.error };
    return { items: parseFeed(feed.id, raw) };
  } catch {
    // Network down / aborted / parse error: degrade to empty, never throw.
    return { items: [], error: "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch several feeds in parallel; each failure is isolated to its own result.
 * Items from every feed are flattened. `error` is set only when EVERY feed
 * failed for the same reason (e.g. the web proxy is unconfigured), so the UI can
 * distinguish "no news today" from "the proxy isn't deployed".
 */
export async function fetchFeeds(feedIds: readonly string[]): Promise<FetchFeedResult> {
  const results = await Promise.all(feedIds.map((id) => fetchFeed(id)));
  const items = results.flatMap((r) => r.items);
  if (items.length > 0) return { items };
  // No items: if every attempt failed for the same reason, surface it.
  const errors = results.map((r) => r.error).filter((e): e is FetchFeedError => e !== undefined);
  const allProxy = errors.length === results.length && errors.every((e) => e === "proxy_unavailable");
  if (allProxy && errors.length > 0) return { items: [], error: "proxy_unavailable" };
  return { items: [] };
}
