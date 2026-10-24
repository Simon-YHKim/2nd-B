// The wiki list's own read: every record the owner has, newest first.
//
// The list used to borrow listRecentRecords(), whose 90-day window is there for the capture
// streak (create.ts). A record older than 90 days was therefore never asked for, so the wiki never
// listed it: 16 of the 69 rows in production on 2026-10-14, in two of five accounts. Nothing was
// erased; the list simply did not ask.
//
// This read has no window. It walks the owner's rows in pages, and each page starts after the last
// row of the one before ((created_at, id), newest first), so a row added or removed while the pages
// are being read is neither skipped nor repeated. The index it rides is the one that already
// exists: records_user_created_idx (user_id, created_at DESC).
//
// It asks only for the columns the list draws (TimelineRecord in records-timeline.ts) and the one
// it narrows by (audit_period: the star a record was told under, for ?period=). Reading every row
// is the point; reading columns nobody looks at is not.
//
// listRecentRecords() is left as it is: the streak and the other screens that call it keep their
// window.
import { getSupabaseClient } from "../supabase/client";
import { throwIfAborted } from "../async/abort";
import { withSystemTagsColumn, type SystemTaggedRow } from "./system-tags";

/** Rows asked for at a time. */
export const WIKI_RECORDS_PAGE = 100;
/**
 * Where the walk stops whatever the server answers. Far above any account today (the largest
 * holds under 100 rows). An account past it would get its newest 5,000 and nothing would say that
 * older ones exist: telling the reader needs a line on the screen, which is a wording decision this
 * file does not make. Until then this is a known limit, not a guarantee.
 */
export const WIKI_RECORDS_MAX = 5000;

interface PageCursor {
  createdAt: string;
  id: string;
}

/** A value inside a PostgREST logical filter: quoted, with its own quotes and backslashes escaped. */
function quoted(value: string): string {
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

/**
 * "After this row" for a newest-first walk: older, or the same instant with a smaller id.
 * Both values are quoted because a timestamp carries characters PostgREST reserves in a
 * logical filter (".", ":"). They are values the server wrote (a timestamp and a uuid); the
 * escaping is there so that a value of any other shape still cannot change the filter.
 */
export function afterCursorFilter(cursor: PageCursor): string {
  const at = quoted(cursor.createdAt);
  return `created_at.lt.${at},and(created_at.eq.${at},id.lt.${quoted(cursor.id)})`;
}

/**
 * The cursor is the last row's created_at exactly as the server sent it (microseconds and all).
 * It is never passed through a Date: that would cut it to milliseconds, and rows inside the same
 * millisecond would then be skipped or repeated.
 *
 * The plain `created_at <= cursor` beside the logical filter changes no result (the filter already
 * selects inside that range). It is there so the index can start at the cursor instead of walking
 * from the newest row on every later page.
 */
function fromCursor<Q extends { lte(column: "created_at", value: string): Q; or(filters: string): Q }>(
  query: Q,
  cursor: PageCursor | null,
): Q {
  return cursor ? query.lte("created_at", cursor.createdAt).or(afterCursorFilter(cursor)) : query;
}

async function readPage(userId: string, cursor: PageCursor | null, signal?: AbortSignal) {
  const { data, error } = await withSystemTagsColumn((columnPresent) => {
    const table = getSupabaseClient().from("records");
    const selected = columnPresent
      ? table.select("id, kind, body, topic, summary, tags, system_tags, created_at, audit_period")
      : table.select("id, kind, body, topic, summary, tags, created_at, audit_period");
    let query = fromCursor(selected.eq("user_id", userId), cursor)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(WIKI_RECORDS_PAGE);
    if (signal) query = query.abortSignal(signal);
    return query;
  });
  throwIfAborted(signal);
  if (error) throw error;
  return (data ?? []) as (NonNullable<typeof data>[number] & SystemTaggedRow)[];
}

/**
 * Every record of this owner, newest first. A failed page throws: a list missing its older half
 * would look complete, so the caller shows its error state instead (the wiki's retry).
 */
export async function listAllRecords(userId: string, options: { signal?: AbortSignal } = {}) {
  if (!userId) return [];
  const rows: Awaited<ReturnType<typeof readPage>> = [];
  let cursor: PageCursor | null = null;
  while (rows.length < WIKI_RECORDS_MAX) {
    // A timed-out/unmounted list must not keep walking pages, even if the
    // transport ignores cancellation and its current page eventually answers.
    throwIfAborted(options.signal);
    const page = await readPage(userId, cursor, options.signal);
    rows.push(...page);
    if (page.length < WIKI_RECORDS_PAGE) break;
    const last = page[page.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return rows;
}
