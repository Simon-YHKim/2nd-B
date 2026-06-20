// Wave 2 — PURE RSS/Atom parser. XML string -> NewsItem[].
//
// No network here (fetch.ts owns that) so this module is fully node-testable
// against a fixture string. Uses fast-xml-parser (MIT, pure JS, RN-safe, only
// runtime dep is strnum/MIT — no node http) per the harness-first rule. We do
// NOT hand-roll an XML parser.
//
// Correctness posture: RSS is the ground truth. This parser only RESHAPES the
// feed's own fields into NewsItem; it never invents content. Everything is
// clamped (title/snippet length, item count) so a hostile or malformed feed
// cannot blow up memory or downstream prompts.

import { XMLParser } from "fast-xml-parser";

export interface NewsItem {
  /** Feed id this item came from (set by the caller / fetch.ts). */
  source: string;
  title: string;
  /** Canonical article link; also the natural dedupe key across feeds. */
  url: string;
  /** ISO 8601 when parseable, else null. */
  publishedAt: string | null;
  /** Short plain-text excerpt (HTML stripped, clamped). */
  snippet: string | null;
}

const TITLE_MAX = 300;
const SNIPPET_MAX = 500;
const MAX_ITEMS = 50;

// Shared, side-effect-free parser instance. We keep attributes (Atom <link href>)
// and never let the lib coerce dates/ids to numbers (strnum off) so an id like
// "2026..." stays a string.
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Pull a plain string out of a value that may be a string, number, or CDATA node. */
function textOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const node = value as Record<string, unknown>;
    // fast-xml-parser stores element text under "#text" when attributes exist.
    if (typeof node["#text"] === "string") return node["#text"];
  }
  return "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(s: string, max: number): string | null {
  const t = s.trim();
  if (t.length === 0) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Normalize a feed date string to ISO; null when it isn't a real date. */
function toIso(value: unknown): string | null {
  const raw = textOf(value).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// RSS 2.0: channel > item ; Atom: feed > entry. We support both shapes.
function rssItemUrl(item: Record<string, unknown>): string {
  return textOf(item.link).trim() || textOf(item.guid).trim();
}

function atomEntryUrl(entry: Record<string, unknown>): string {
  const links = asArray(entry.link as unknown);
  // Prefer rel="alternate" (the human article), else the first href.
  let href = "";
  for (const l of links) {
    if (l && typeof l === "object") {
      const node = l as Record<string, unknown>;
      const rel = textOf(node["@_rel"]);
      const candidate = textOf(node["@_href"]).trim();
      if (candidate && (rel === "alternate" || rel === "")) return candidate;
      if (candidate && !href) href = candidate;
    } else if (typeof l === "string" && !href) {
      href = l.trim();
    }
  }
  return href;
}

/**
 * Parse an RSS 2.0 or Atom feed XML string into NewsItem[].
 *
 * Pure + total: never throws. A malformed document, an unexpected shape, or a
 * feed with no items yields []. `source` is stamped on every returned item.
 */
export function parseFeed(source: string, xmlText: string): NewsItem[] {
  if (typeof xmlText !== "string" || xmlText.trim().length === 0) return [];
  let doc: Record<string, unknown>;
  try {
    doc = xml.parse(xmlText) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];

  const out: NewsItem[] = [];

  // --- RSS 2.0 / RDF ---
  const rss = (doc.rss ?? doc["rdf:RDF"] ?? doc.RDF) as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  // RSS 1.0 (RDF) puts <item> as a sibling of <channel>, RSS 2.0 inside it.
  const rssItems = [
    ...asArray(channel?.item as unknown),
    ...(rss && !channel?.item ? asArray(rss.item as unknown) : []),
  ];
  for (const raw of rssItems) {
    if (out.length >= MAX_ITEMS) break;
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = rssItemUrl(item);
    const title = clamp(stripHtml(textOf(item.title)), TITLE_MAX);
    if (!url || !title) continue;
    const snippetRaw = textOf(item.description) || textOf(item["content:encoded"]);
    out.push({
      source,
      title,
      url,
      publishedAt: toIso(item.pubDate ?? item["dc:date"] ?? item.date),
      snippet: clamp(stripHtml(snippetRaw), SNIPPET_MAX),
    });
  }
  if (out.length > 0) return out;

  // --- Atom ---
  const feed = doc.feed as Record<string, unknown> | undefined;
  for (const raw of asArray(feed?.entry as unknown)) {
    if (out.length >= MAX_ITEMS) break;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const url = atomEntryUrl(entry);
    const title = clamp(stripHtml(textOf(entry.title)), TITLE_MAX);
    if (!url || !title) continue;
    const snippetRaw = textOf(entry.summary) || textOf(entry.content);
    out.push({
      source,
      title,
      url,
      publishedAt: toIso(entry.updated ?? entry.published),
      snippet: clamp(stripHtml(snippetRaw), SNIPPET_MAX),
    });
  }
  return out;
}
