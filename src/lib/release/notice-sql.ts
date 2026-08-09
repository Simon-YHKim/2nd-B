// Render the INSERT that publishes a major-release notice.
//
// It is a string builder, not a database client, and that is the security
// property of this whole pipeline rather than a stylistic choice: nothing in
// src/lib/release/ or scripts/release-notice.ts can reach Supabase, so "CI
// published a notice by accident" is not a failure mode that exists. The script
// prints; a human reads it and runs it in the SQL Editor, where the session is
// service_role. See docs/RELEASE-PROCESS.md and docs/OPERATIONS-NOTICES.md.
//
// The generated statement is checked against the same constraints
// db/migrations/0113_notices.sql enforces, so a malformed value fails here with
// a sentence the operator can act on instead of as a CHECK violation pasted
// into a dashboard at release time.

/** The columns this pipeline writes, pinned to db/migrations/0113_notices.sql.
 *  `published_at` is deliberately omitted so the table default (now()) applies:
 *  the release notice goes out when the human runs the statement, which is the
 *  only moment anyone can actually confirm the release is live. */
export const NOTICE_INSERT_COLUMNS = [
  "kind",
  "title_ko",
  "title_en",
  "body_ko",
  "body_en",
  "min_app_version",
] as const;

/** Mirrors the CHECK on notices.min_app_version. */
const VERSION_SHAPE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export interface NoticeInsertInput {
  /** The version being announced. Becomes min_app_version. */
  version: string;
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
}

/**
 * Pick a dollar-quote tag that does not occur inside the value.
 *
 * Notice bodies are operator prose that will contain apostrophes ("사용자's" is
 * rare in Korean but "don't" is not in English), and backslash-escaping user
 * text into a SQL literal is the classic way to produce a statement that runs
 * but says something slightly different. Dollar quoting sidesteps escaping
 * entirely, as long as the tag is genuinely absent - hence the suffix loop.
 */
function dollarQuote(value: string, base: string): string {
  let tag = `$${base}$`;
  let suffix = 0;
  while (value.includes(tag)) {
    suffix += 1;
    tag = `$${base}${suffix}$`;
  }
  return `${tag}${value}${tag}`;
}

function requireText(value: string, field: string): string {
  if (value.trim() === "") {
    throw new Error(
      `${field} is empty. notices.${field} is NOT NULL with a non-blank CHECK (db/migrations/0113_notices.sql).`,
    );
  }
  return value;
}

/**
 * Build the publish statement.
 *
 * Idempotent by construction: the WHERE NOT EXISTS means running it twice
 * publishes one notice, not two. There is no unique constraint on the table to
 * lean on, and a duplicate major notice is not a cosmetic problem - the popup
 * shows the newest unread major, so a second copy re-interrupts everybody who
 * already dismissed the first one.
 *
 * The guard ignores WITHDRAWN rows (0114_notice_withdrawal.sql). Withdrawing a
 * notice is how an operator takes a bad announcement down; if the withdrawn copy
 * still blocked the insert, the fixed one could never be published and the only
 * way out would be a DELETE, which also destroys the read statistics.
 */
function requireVersion(version: string): string {
  if (!VERSION_SHAPE.test(version)) {
    throw new Error(
      `version "${version}" is not major.minor.patch. The CHECK on notices.min_app_version rejects it (no "v" prefix, no two-part versions).`,
    );
  }
  return version;
}

export function buildNoticeInsert(input: NoticeInsertInput): string {
  requireVersion(input.version);

  const titleKo = dollarQuote(requireText(input.titleKo, "title_ko"), "t_ko");
  const titleEn = dollarQuote(requireText(input.titleEn, "title_en"), "t_en");
  const bodyKo = dollarQuote(requireText(input.bodyKo, "body_ko"), "b_ko");
  const bodyEn = dollarQuote(requireText(input.bodyEn, "body_en"), "b_en");

  return [
    `insert into notices (${NOTICE_INSERT_COLUMNS.join(", ")})`,
    `select 'major',`,
    `       ${titleKo},`,
    `       ${titleEn},`,
    `       ${bodyKo},`,
    `       ${bodyEn},`,
    `       '${input.version}'`,
    `where not exists (`,
    `  select 1 from notices`,
    `  where kind = 'major' and min_app_version = '${input.version}'`,
    `    and withdrawn_at is null`,
    `);`,
  ].join("\n");
}

/** A read-only statement the operator can run first to see what is already
 *  published for this version. Prints nothing and changes nothing.
 *
 *  The version is validated here too, even though the caller has normally
 *  validated it already through buildNoticeInsert: this function is exported,
 *  it interpolates into a literal, and "the other function checks it" is the
 *  kind of invariant that survives exactly until someone reuses this one. */
export function buildNoticePrecheck(version: string): string {
  requireVersion(version);
  return [
    // withdrawn_at is in the list because a withdrawn row is invisible to the
    // app but still sitting in the table: without it the operator sees a notice
    // that "already exists" and cannot tell why nobody is receiving it.
    `select id, kind, title_ko, published_at, withdrawn_at, min_app_version`,
    `from notices`,
    `where min_app_version = '${version}'`,
    `order by published_at desc;`,
  ].join("\n");
}
