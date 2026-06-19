// Wave 2 — feed fetch. fetchFeed(feedId): network -> text -> parse.
//
// Guarded: a feed being down, a timeout, a non-200, or malformed XML must never
// crash the digest. Every failure path returns [] (the screen shows its empty
// state). No AI here — this is the deterministic, $0 ground-truth path. The
// summary is a separate opt-in step (summarize.ts).

import { getFeed } from "./feeds";
import { parseFeed, type NewsItem } from "./parse";

const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch one curated feed and parse it into NewsItem[].
 *
 * Never throws: an unknown id, a network error, a non-OK status, or an
 * unparseable body all resolve to []. `source` on each item is the feed id.
 */
export async function fetchFeed(feedId: string): Promise<NewsItem[]> {
  const feed = getFeed(feedId);
  if (!feed) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      method: "GET",
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: controller.signal,
    });
    if (!res || !res.ok) return [];
    const text = await res.text();
    return parseFeed(feed.id, text);
  } catch {
    // Network down / aborted / parse error: degrade to empty, never throw.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch several feeds in parallel; each failure is isolated to its own []. */
export async function fetchFeeds(feedIds: readonly string[]): Promise<NewsItem[]> {
  const batches = await Promise.all(feedIds.map((id) => fetchFeed(id)));
  return batches.flat();
}
