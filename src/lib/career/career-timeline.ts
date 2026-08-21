// Career CV timeline (rev2 P4d) — pure grouping for the 커리어 lens.
// Records tagged domain:career group by YEAR, newest first. An explicit
// `year:YYYY` tag (written by the 성과 입력 form) wins over created_at, so past
// accomplishments land on their real year, not the capture date.
//
// The body composer that used to live here served the three-box inline form and
// went with it; lib/career/achievement-form.ts composes the full seven-section
// entry now. 3C4P drilldown stays deferred to the rev2 prototype spec.

import { kstDayKey } from "@/lib/journal/streak";

export interface CareerRecordRow {
  id: string;
  kind: string;
  topic: string | null;
  body: string | null;
  tags: string[] | null;
  created_at: string;
}

export interface CareerYearGroup {
  year: string;
  items: CareerRecordRow[];
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
