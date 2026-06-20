// Reading list IN-bound data source (O-R3 Wave 2): Google Books Volumes API.
// The reading_list ops domain has the manage layer already (save/track); this
// gives it a REAL data source so a book is grounded ground-truth, not free text.
//
// Why this is the right harness-first pick (PERSONAL-ASSISTANT-ROADMAP §0):
//   - Public REST, NO API key for search, CORS-enabled → works on web AND native
//     with a plain fetch. No proxy/edge function (unlike RSS), no OAuth gate.
//   - Deterministic: the API IS the source of truth. No LLM, so no C1/C3/C9
//     surface, no cost. $0/mo holds (blueprint §5).
//   - No new dependency — uses the platform fetch.
//
// Safety discipline mirrors the news engine's hardening:
//   - Defensive parse: the model of "the network proposes, this module clamps"
//     applies to third-party JSON too. Every field is validated/clamped; junk is
//     dropped, never trusted.
//   - Link scheme guard: image/info links are forced to https; anything else is
//     dropped (no javascript:/data:/http downgrade reaching a WebView/Image).
//   - Caps: query length, result count, and string lengths are bounded.

export interface BookResult {
  /** Google Books volume id (stable handle for save/track). */
  id: string;
  title: string;
  authors: string[];
  /** 4-digit year parsed from publishedDate, when present. */
  publishedYear?: number;
  pageCount?: number;
  /** https thumbnail, or undefined when none/invalid. */
  thumbnail?: string;
  /** https info page, or undefined when none/invalid. */
  infoLink?: string;
}

const QUERY_MAX = 120;
const RESULT_MAX = 10;
const TITLE_MAX = 200;
const AUTHOR_MAX = 120;
const AUTHORS_MAX = 6;
const BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes";

/** Force https; drop anything that is not an http(s) URL. Returns undefined on reject. */
export function httpsOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol === "https:") return url.toString();
  // Google Books thumbnails are commonly served over http — upgrade, don't drop.
  if (url.protocol === "http:") {
    url.protocol = "https:";
    return url.toString();
  }
  return undefined; // javascript:, data:, file:, etc.
}

/** Parse a leading 4-digit year from a publishedDate like "2019", "2019-05", "2019-05-01". */
export function extractYear(publishedDate: unknown): number | undefined {
  if (typeof publishedDate !== "string") return undefined;
  const m = publishedDate.match(/^(\d{4})/);
  if (!m) return undefined;
  const year = Number(m[1]);
  // Sanity window: reject obviously broken years.
  return year >= 1000 && year <= 3000 ? year : undefined;
}

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Build the keyless search URL. Pure + testable; clamps query + result count. */
export function buildBooksSearchUrl(query: string, max = RESULT_MAX): string {
  const q = query.trim().slice(0, QUERY_MAX);
  const maxResults = Math.min(Math.max(1, Math.floor(max)), RESULT_MAX);
  const params = new URLSearchParams({
    q,
    maxResults: String(maxResults),
    printType: "books",
    // restrict to the volume fields we actually read (smaller payloads).
    fields: "items(id,volumeInfo(title,authors,publishedDate,pageCount,imageLinks/thumbnail,infoLink))",
  });
  return `${BOOKS_ENDPOINT}?${params.toString()}`;
}

/** Defensive parse of the Volumes response. The network proposes; this clamps. */
export function parseGoogleBooksResponse(json: unknown, max = RESULT_MAX): BookResult[] {
  if (!json || typeof json !== "object") return [];
  const items = (json as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const out: BookResult[] = [];
  for (const item of items) {
    if (out.length >= max) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = clampText(row.id, 80);
    const info = (row.volumeInfo && typeof row.volumeInfo === "object"
      ? (row.volumeInfo as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const title = clampText(info.title, TITLE_MAX);
    if (!id || !title) continue; // id + title are the minimum for a usable result

    const authors = Array.isArray(info.authors)
      ? info.authors
          .map((a) => clampText(a, AUTHOR_MAX))
          .filter((a): a is string => a !== null)
          .slice(0, AUTHORS_MAX)
      : [];

    const book: BookResult = { id, title, authors };
    const year = extractYear(info.publishedDate);
    if (year !== undefined) book.publishedYear = year;
    if (typeof info.pageCount === "number" && info.pageCount > 0) {
      book.pageCount = Math.min(Math.round(info.pageCount), 100000);
    }
    const imageLinks = info.imageLinks && typeof info.imageLinks === "object"
      ? (info.imageLinks as Record<string, unknown>)
      : undefined;
    const thumb = httpsOnly(imageLinks?.thumbnail);
    if (thumb) book.thumbnail = thumb;
    const infoLink = httpsOnly(info.infoLink);
    if (infoLink) book.infoLink = infoLink;

    out.push(book);
  }
  return out;
}

export type BooksSearchError = "empty_query" | "fetch_failed" | "bad_response";

/**
 * Search Google Books (keyless). Thin async wrapper over the pure helpers; on any
 * network/shape failure it throws a typed BooksSearchError so the screen can show
 * a precise empty/error state. Returns [] for an empty query (no request made).
 */
export async function searchBooks(
  query: string,
  opts: { max?: number; signal?: AbortSignal } = {},
): Promise<BookResult[]> {
  if (query.trim().length === 0) return [];
  const url = buildBooksSearchUrl(query, opts.max);
  let res: Response;
  try {
    res = await fetch(url, { signal: opts.signal, headers: { Accept: "application/json" } });
  } catch {
    throw "fetch_failed" as BooksSearchError;
  }
  if (!res.ok) throw "fetch_failed" as BooksSearchError;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw "bad_response" as BooksSearchError;
  }
  return parseGoogleBooksResponse(json, opts.max);
}
