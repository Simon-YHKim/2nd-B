// Constants for community-format moderation (migration 0097).
//
// The community clipper format list is the app's only public user-to-user
// surface, so Play policy requires an in-app report + block path. This module
// is deliberately dependency-free (no supabase, no theme, no components) so it
// can be imported from the data layer, the UI, and the tests without adding a
// require edge.

/**
 * How many distinct reporters it takes to hide a shared format from the whole
 * community. Mirrored by the `v_count >= 3` guard in
 * db/migrations/0097_ugc_block_report.sql; the pair is pinned by
 * src/lib/wiki/__tests__/ugc-block-report-migration.test.ts so neither side can
 * drift alone.
 */
export const COMMUNITY_REPORT_HIDE_THRESHOLD = 3;

/**
 * The closed list of report reasons, matching the CHECK constraint on
 * content_reports.reason. Fixed reasons rather than free text is a deliberate
 * repeat of 0064 decision #6: free text from one user about another is itself a
 * moderation surface, and third-party PII under PIPA.
 */
export const REPORT_REASONS = ["spam", "off_topic", "offensive", "impersonation", "other"] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** Narrow an arbitrary string to a known reason. */
export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}
