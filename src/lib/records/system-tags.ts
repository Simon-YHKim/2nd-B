// records.system_tags (migration 0218) -- the app's own markers, kept out of the
// user's tag column.
//
// WHY (Simon Q-261004-39 = A, 2026-10-05 19:53; QA D-07; design
// docs/design/system-tags-261006.md, adopted 2026-10-06 22:33). The app used to
// write its markers into `records.tags`, the same column the user's own tags live
// in: TTFV wrote `first_light` + `first_light:affirm|soft`, the recall interview
// wrote `interview` + `recall` + `screener` + `entry-ui:<locale>`. /discover and
// /research then showed `first_light` and `interview` as the user's topics. A
// string in a shared column does not say who wrote it, and the user can type the
// same words, so no reader can tell them apart after the fact.
//
// THE RULE (design P1, P2). Who wrote a marker is known only at the moment it is
// written. So the writer puts it in `system_tags` itself, and nothing ever
// infers it later from the shape of `tags`: 0218 adds the column and has no
// trigger and no automatic backfill. Old rows stay as they are; the QA rows whose
// owner confirmed them are moved once, by row id, with db/ops/0218_*.sql.
//
// What lives where after 0218:
//   tags         the user's own tags, plus the reserved `domain:` classification
//                (the user's own filing; Move changes it; star brightness and
//                the career timeline read it from `tags`).
//   system_tags  markers the app attaches to say HOW the record was produced.
//                0218 moves exactly two writers: TTFV and the recall interview.
//
// Other app-attached tags (capture modes voice/todo/fourw, call_reflection, the
// assessment family, life_audit + framework, career_achievement + year:,
// NORTHSTAR, imported:*, reasoning:ratified) still live in `tags`. Each has its
// own readers; they can move writer by writer into the same column later.
//
// NO COLUMN (design P6). The client can meet a database without the column (a
// rolled-back 0218, a local database that has not run it). Then a select or a
// filter naming `system_tags` fails with 42703 and an insert with PGRST204.
// withSystemTagsColumn asks again once without the column. It never remembers
// the answer: every query asks with the column first, so a column that appears
// (or disappears) is seen on the very next query. The price is one extra request
// per query on a database without the column. Rows read that way carry no
// `system_tags` key, and systemTagsOf reads their markers from `tags`, which is
// where a database without the column keeps them. The app then behaves exactly
// as it did before 0218.

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
 * Whether a row was read from a database that has the column. A row read with
 * the column carries `system_tags` (an array, possibly empty); a row read
 * without it has no such key.
 */
export function rowHasSystemTagsColumn(row: SystemTaggedRow): boolean {
  return Array.isArray(row.system_tags);
}

/**
 * The app's markers on a row. With the column, only `system_tags` is read: a
 * user tag that happens to say `interview` is not the app's marker. Without the
 * column, the markers are still in `tags`, so the pre-0218 reading applies.
 */
export function systemTagsOf(row: SystemTaggedRow): string[] {
  if (rowHasSystemTagsColumn(row)) return strings(row.system_tags);
  return strings(row.tags);
}

export function hasSystemTag(row: SystemTaggedRow, tag: string): boolean {
  return systemTagsOf(row).includes(tag);
}

/** Markers a caller hands createRecord: strings, non-empty, unique, in order.
 *  A `domain:` tag is never a system tag (it stays in `tags`, see above), and
 *  0218's shape constraint refuses one. */
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
 * The pre-0218 layout of the `tags` column, for an insert into a database that
 * has no `system_tags`: the domain tag first, then the markers, then the
 * user's tags. That is exactly what the TTFV and interview writers produced
 * before 0218, so every pre-0218 reader still recognizes the row. 0218 does not
 * move such a row by itself (no trigger, no backfill); the after-apply survey in
 * db/ops/0218_system_tags_survey.sql lists it.
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

/**
 * Run a records query that names `system_tags`, and if this database does not
 * have the column, run it once more without it. `run(true)` must name the
 * column; `run(false)` must be the pre-0218 query. Nothing is remembered between
 * calls (design P6): each call asks with the column first. A thrown error (a
 * timeout) is not a missing column and propagates as is; any other returned
 * error comes back as it came, with no second query.
 */
export async function withSystemTagsColumn<R extends { error: unknown }>(
  run: (columnPresent: boolean) => PromiseLike<R>,
): Promise<R> {
  const first = await run(true);
  if (!isMissingSystemTagsColumnError(first.error)) return first;
  return run(false);
}
