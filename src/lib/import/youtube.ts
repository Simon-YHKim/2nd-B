// YouTube watch-history parser (Takeout JSON, P1 -- docs/
// integrations-feasibility_260717.html §4: 성장·휴식 시그널).
//
// There is NO API for watch history (removed 2016, permanent); the only path
// is the user's own Google Takeout export (YouTube > history >
// watch-history.json). Pure on-device transform: no network, no LLM, no
// storage. The caller persists only DERIVED signals -- channel-level counts
// and monthly volume -- never the raw event list and never individual video
// titles ("원문 비보존" discipline, same as kakao/location).
//
// Defensive by design: Takeout localizes the record shape (title action
// affixes like "Watched ..."), ad playbacks ride the same file
// (details[].name = "From Google Ads") and are excluded from every signal,
// and records for removed/private videos may lack subtitles entirely.
// Unknown shapes are dropped, never trusted.

export interface YouTubeWatchEvent {
  /** Video title with known action affixes stripped, or null when absent. */
  title: string | null;
  /** Channel name (subtitles[0].name), or null when unavailable. */
  channel: string | null;
  /** ISO timestamp from Takeout, or null when missing/invalid. */
  atIso: string | null;
  /** true for ad playbacks (details[].name contains "Google Ads"). */
  ad: boolean;
}

export interface YouTubeWatchSummary {
  /** Non-ad watch events parsed. */
  total: number;
  /** Ad playbacks found and excluded from every signal. */
  ads: number;
  /** Top channels by non-ad watch count, descending (max 12). */
  channels: Array<{ name: string; count: number }>;
  /** Non-ad watch volume per calendar month "YYYY-MM", newest first (max 12). */
  months: Array<{ month: string; count: number }>;
}

const MAX_EVENTS = 50_000;
const TOP_CHANNELS = 12;
const TOP_MONTHS = 12;
const TITLE_MAX = 300;

// Known Takeout action affixes around the real video title. EN prefixes and
// the common KO suffix; unmatched titles pass through untouched (defensive --
// Takeout's wording varies by account language and has changed over time).
const EN_PREFIX = /^(Watched|Viewed)\s+/;
const KO_SUFFIX = /(을|를)?\s*시청했습니다\.?$/;

function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(EN_PREFIX, "").replace(KO_SUFFIX, "").trim().slice(0, TITLE_MAX);
  return cleaned.length > 0 ? cleaned : null;
}

function isAdRecord(rec: Record<string, unknown>): boolean {
  const details = rec.details;
  if (!Array.isArray(details)) return false;
  return details.some(
    (d) =>
      !!d &&
      typeof d === "object" &&
      typeof (d as { name?: unknown }).name === "string" &&
      /google ads/i.test((d as { name: string }).name),
  );
}

function channelOf(rec: Record<string, unknown>): string | null {
  const subs = rec.subtitles;
  if (!Array.isArray(subs) || subs.length === 0) return null;
  const first = subs[0];
  if (!first || typeof first !== "object") return null;
  const name = (first as { name?: unknown }).name;
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
}

function timeOf(rec: Record<string, unknown>): string | null {
  const t = rec.time;
  if (typeof t !== "string") return null;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : t;
}

/**
 * Parse a Takeout watch-history.json payload (already JSON.parse'd by the
 * caller, mirroring the takeout-location flow). Non-arrays and malformed
 * records yield nothing; output is capped so a decade of history cannot blow
 * up the review screen.
 */
export function parseYouTubeWatchHistory(json: unknown): YouTubeWatchEvent[] {
  if (!Array.isArray(json)) return [];
  const out: YouTubeWatchEvent[] = [];
  for (const item of json) {
    if (out.length >= MAX_EVENTS) break;
    if (!item || typeof item === "boolean" || typeof item === "number" || typeof item === "string") continue;
    if (Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    // Watch-history records carry header "YouTube"/"YouTube Music"; Takeout
    // bundles other products' histories in sibling files -- skip foreign rows
    // defensively when a header is present and clearly not YouTube.
    const header = rec.header;
    if (typeof header === "string" && !/youtube/i.test(header)) continue;
    const title = cleanTitle(rec.title);
    const channel = channelOf(rec);
    const atIso = timeOf(rec);
    if (title === null && channel === null && atIso === null) continue; // not a watch record
    out.push({ title, channel, atIso, ad: isAdRecord(rec) });
  }
  return out;
}

/** Derived signals only: channel-level counts + monthly volume, ads excluded. */
export function summarizeWatchHistory(events: ReadonlyArray<YouTubeWatchEvent>): YouTubeWatchSummary {
  const byChannel = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let total = 0;
  let ads = 0;
  for (const e of events) {
    if (e.ad) {
      ads++;
      continue;
    }
    total++;
    if (e.channel) byChannel.set(e.channel, (byChannel.get(e.channel) ?? 0) + 1);
    if (e.atIso) {
      const month = e.atIso.slice(0, 7); // "YYYY-MM" straight off the ISO string
      if (/^\d{4}-\d{2}$/.test(month)) byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
  }
  const channels = [...byChannel.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_CHANNELS);
  const months = [...byMonth.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, TOP_MONTHS);
  return { total, ads, channels, months };
}
