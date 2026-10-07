// Career CV timeline (rev2 P4d) — pure grouping for the 커리어 lens.
// Records tagged domain:career (or career_achievement, see CAREER_TIMELINE_TAGS)
// group by YEAR, newest first. An explicit
// `year:YYYY` tag (written by the 성과 입력 form) wins over created_at, so past
// accomplishments land on their real year, not the capture date.
//
// The body composer that used to live here served the three-box inline form and
// went with it; lib/career/achievement-form.ts composes the full seven-section
// entry now. 3C4P drilldown stays deferred to the rev2 prototype spec.

import { kstDayKey } from "@/lib/journal/streak";
import { domainTagFor } from "@/lib/persona/domain-stars";
import { RECALL_INTERVIEW_TAG, systemTagsOf } from "@/lib/records/system-tags";

import { CAREER_ACHIEVEMENT_TAG } from "./achievement-form";

/**
 * A record is on the timeline when it carries ANY of these tags (Postgres `&&`,
 * supabase `.overlaps`): the career area tag, or the 성과 입력 form's own tag.
 *
 * Why the second one. Until 2026-10-05 the form put `domain:career` in `tags`,
 * where createRecord strips it and re-detects the area from keywords, so a
 * one-line achievement was stored as ["domain:collect", "career_achievement"]
 * (QA R2C-01). The form now files through `domainIntent`, but an installed app
 * that has not updated keeps writing the old shape, and rows already written stay
 * as they are (no data is rewritten). The form tag is only ever written by that
 * form, so matching it shows the user's own achievement where they wrote it
 * without guessing at anything else. It does not move the row to the career star:
 * area counts and brightness still read the stored domain tag.
 */
export const CAREER_TIMELINE_TAGS: readonly string[] = [domainTagFor("career"), CAREER_ACHIEVEMENT_TAG];

/** The same rule as the query, for a row already in hand. */
export function isCareerTimelineRow(row: Pick<CareerRecordRow, "tags">): boolean {
  return (row.tags ?? []).some((t) => CAREER_TIMELINE_TAGS.includes(t));
}

export interface CareerRecordRow {
  id: string;
  kind: string;
  topic: string | null;
  body: string | null;
  tags: string[] | null;
  /** The app's markers (0218). Absent when the database has no such column; the
   *  markers are then still in `tags` (records/system-tags.ts). */
  system_tags?: string[] | null;
  created_at: string;
}

export interface CareerYearGroup {
  year: string;
  items: CareerRecordRow[];
}

// Entry-screen metadata identifies the UI language, not the language of every answer.
// Legacy English interviews used a fixed generated title; other legacy titles
// remain unknown rather than inferring the user's writing language.
// The interview marker and the entry-ui marker are the app's (0218
// records.system_tags), so a user tag that says `interview` does not turn a note
// into an interview here.
export function careerRecordOrigin(row: CareerRecordRow): {
  source: "interview" | "record";
  entryUi: "ko" | "en" | null;
} {
  const markers = systemTagsOf(row);
  const interview = row.kind === "audit_response" && markers.includes(RECALL_INTERVIEW_TAG);
  if (!interview) return { source: "record", entryUi: null };
  const hasKoTag = markers.includes("entry-ui:ko");
  const hasEnTag = markers.includes("entry-ui:en");
  const entryUi = hasKoTag && hasEnTag ? null
    : hasKoTag ? "ko"
    : hasEnTag || row.topic === "Recall interview" ? "en" : null;
  return { source: "interview", entryUi };
}

export const CAREER_YEAR_TAG_PREFIX = "year:";

export function careerYearOf(row: CareerRecordRow): string {
  const yearTag = (row.tags ?? []).find((t) => /^year:\d{4}$/.test(t));
  if (yearTag) return yearTag.slice(CAREER_YEAR_TAG_PREFIX.length);
  // Fall back to the KST year, not the raw UTC year: created_at is a timestamptz
  // serialized as UTC, so a note captured at 08:00 KST on Jan 1 (23:00Z Dec 31) must
  // file under the new year the user sees, matching the app's KST day convention
  // (journal/streak, records/load-structured).
  return Number.isNaN(Date.parse(row.created_at))
    ? row.created_at.slice(0, 4)
    : kstDayKey(row.created_at).slice(0, 4);
}

/** Newest year first; items inside a year newest first (by created_at). */
export function groupCareerTimeline(rows: readonly CareerRecordRow[]): CareerYearGroup[] {
  const byYear = new Map<string, CareerRecordRow[]>();
  for (const row of rows) {
    const year = careerYearOf(row);
    const arr = byYear.get(year) ?? [];
    arr.push(row);
    byYear.set(year, arr);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, items]) => ({
      year,
      items: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }));
}
