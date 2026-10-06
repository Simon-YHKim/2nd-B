// records.system_tags (migration 0218) -- the app's own markers, kept out of the
// user's tag column.
//
// WHY (Simon Q-261004-39 = A, 2026-10-05 19:53; QA D-07). The app used to write
// its markers into `records.tags`, the same column the user's own tags live in:
// TTFV wrote `first_light` + `first_light:affirm|soft`, the recall interview
// wrote `interview` + `recall` + `screener` + `entry-ui:<locale>`. /discover and
// /research then showed `first_light` and `interview` as the user's topics. A
// display filter could not fix it: the user can type the same words, and a
// string in a shared column does not say who wrote it. Three gate rounds on
// #2042 kept finding a new collision. So the markers move to their own column and
// every reader that asks "did the app write this?" reads that column.
//
// What lives where after 0218:
//   tags         the user's own tags, plus the reserved `domain:` classification.
//                `domain:` stays here on purpose: no write path lets a raw
//                `domain:*` through (createRecord strips it, the detail screen
//                refuses it, Move / 별 담기 / reasoning write a typed DomainId),
//                so it never collides with a user tag, and it is the user's own
//                filing (Move changes it). Star brightness and the career
//                timeline read it from `tags` and are unchanged.
//   system_tags  markers the app attaches to say HOW the record was produced.
//                0218 moves exactly two writers: TTFV and the recall interview.
//
// Other app-attached tags (capture modes voice/todo/fourw, call_reflection, the
// assessment family, life_audit + framework, career_achievement + year:,
// NORTHSTAR, imported:*, reasoning:ratified) still live in `tags`. Each has its
// own readers and needs its own backfill rule; they move writer by writer with
// the same column, not in this change.
//
// FALLBACK. The client can meet a database without the column (a rolled-back
// 0218, a local database that has not run it). Then a select or filter naming
// `system_tags` fails with 42703 and an insert with PGRST204. withSystemTagsColumn
// retries once without the column and remembers that for a few minutes, and
// systemTagsOf reads a row without `system_tags` the pre-0218 way: the markers
// are in `tags`. In that mode the app behaves exactly as it did before 0218.
// "Absent" is not remembered for the whole session: when 0218 is (re-)applied
// while the app is open, the database moves every marker into `system_tags` as
// it is written, so a client still reading `tags` would miss the interview and
// TTFV markers and could take a user tag of the same name for one (gate CD-04 /
// CDA-02, 2026-10-06). After SYSTEM_TAGS_ABSENT_RECHECK_MS the next query asks
// with the column again.

/** The recall interview marker. Completion, Polaris evidence and the career
 *  timeline's interview origin key off it. */
export const RECALL_INTERVIEW_TAG = "interview";

/** The TTFV first-record-review marker. */
export const FIRST_LIGHT_TAG = "first_light";

export type FirstLightChoice = "affirm" | "soft";

/** What TTFV attaches to its first-record-review note. */
export function firstLightSystemTags(choice: FirstLightChoice): string[] {
  return [FIRST_LIGHT_TAG, `${FIRST_LIGHT_TAG}:${choice}`];
}

/** What the recall interview attaches to its transcript. `assess/registry.ts`
 *  judges completion by `interview` + `recall`; the entry-ui marker records the
 *  screen language, not the language of the answers (career-timeline.ts). */
export function recallInterviewSystemTags(locale: "en" | "ko"): string[] {
  return [RECALL_INTERVIEW_TAG, "recall", "screener", `entry-ui:${locale}`];
}

export interface SystemTaggedRow {
  tags?: readonly string[] | null;
  system_tags?: readonly string[] | null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * The app's markers on a row. A row read with the column carries
 * `system_tags` (an array, possibly empty) and only that is read: a user tag
 * that happens to say `interview` is not the app's marker. A row read from a
 * database without the column has no `system_tags` key; its markers are still
 * in `tags`, so the pre-0218 reading applies.
 */
export function systemTagsOf(row: SystemTaggedRow): string[] {
  if (Array.isArray(row.system_tags)) return strings(row.system_tags);
  return strings(row.tags);
}

export function hasSystemTag(row: SystemTaggedRow, tag: string): boolean {
  return systemTagsOf(row).includes(tag);
}

/** Markers a caller hands createRecord: strings, non-empty, unique, in order.
 *  A `domain:` tag is never a system tag (it stays in `tags`, see above). */
export function normalizeSystemTags(tags: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const tag of tags ?? []) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("domain:") || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

/**
 * The pre-0218 layout of the `tags` column for a row whose database has no
 * `system_tags`: the domain tag first, then the markers, then the user's tags.
 * That is exactly what the TTFV and interview writers produced before 0218, so
 * a database that later runs 0218 recognizes and moves them (its backfill and
 * its insert/update trigger read this shape).
 */
export function legacyTagLayout(tags: readonly string[], systemTags: readonly string[]): string[] {
  if (systemTags.length === 0) return [...tags];
  const [first, ...rest] = tags;
  if (first !== undefined && first.toLowerCase().startsWith("domain:")) return [first, ...systemTags, ...rest];
  return [...systemTags, ...tags];
}

interface PostgrestLikeError {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

/**
 * True only for "this database has no records.system_tags": Postgres 42703
 * (undefined column, from a select list or a filter) or PostgREST PGRST204
 * (unknown column in an insert or update body), AND the text names the column.
 * Anything else is a real failure and must reach the caller unchanged.
 */
export function isMissingSystemTagsColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as PostgrestLikeError;
  if (e.code !== "42703" && e.code !== "PGRST204") return false;
  const text = [e.message, e.details, e.hint].filter((s): s is string => typeof s === "string").join(" ");
  return text.includes("system_tags");
}

type ColumnState = "unknown" | "present" | "absent";
let columnState: ColumnState = "unknown";
let absentSince = 0;

/** How long an "absent" answer is trusted before the next query asks with the
 *  column again. One extra failing round trip per window while the column is
 *  really missing; a column that appears is picked up within the window. */
export const SYSTEM_TAGS_ABSENT_RECHECK_MS = 5 * 60 * 1000;

/** Test seam: forget what this session learned about the column. */
export function resetSystemTagsColumnStateForTests(): void {
  columnState = "unknown";
  absentSince = 0;
}

/** What this session has learned about the column so far. */
export function systemTagsColumnState(): ColumnState {
  return columnState;
}

/**
 * Run a records query that names `system_tags`, and if this database does not
 * have the column, run it once more without it. `run(true)` must name the
 * column; `run(false)` must be the pre-0218 query. Once a database answered
 * "no such column", queries skip the column for SYSTEM_TAGS_ABSENT_RECHECK_MS and
 * then ask with it again, so a column that appears mid-session is picked up
 * without a reload. A thrown error (a timeout) is not a missing column and
 * propagates as is.
 */
export async function withSystemTagsColumn<R extends { error: unknown }>(
  run: (columnPresent: boolean) => PromiseLike<R>,
): Promise<R> {
  if (columnState !== "absent" || Date.now() - absentSince >= SYSTEM_TAGS_ABSENT_RECHECK_MS) {
    const first = await run(true);
    if (!isMissingSystemTagsColumnError(first.error)) {
      if (!first.error) columnState = "present";
      return first;
    }
    columnState = "absent";
    absentSince = Date.now();
  }
  return run(false);
}
