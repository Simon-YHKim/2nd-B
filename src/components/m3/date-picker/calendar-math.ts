// Pure date helpers for the M3 calendar date picker. ISO = "YYYY-MM-DD".
//
// Dependency-light (dayjs only, already a project dep) and side-effect free so
// the grid / clamp / validation logic is unit-tested without a renderer. Because
// ISO dates are zero-padded, plain string comparison is chronological, so
// compare / clamp / disabled need no parsing at all.
import dayjs from "dayjs";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Build an ISO date from a year, 0-based month, and day. */
export function toISO(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

/** Today as a local ISO date. Only the picker calls this; safe in app + jest. */
export function todayISO(): string {
  return dayjs().format("YYYY-MM-DD");
}

/** True only for a real calendar date in canonical YYYY-MM-DD form. */
export function isValidISO(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = dayjs(value);
  // The round-trip rejects overflow dates (e.g. 2005-02-30 → normalised away).
  return d.isValid() && d.format("YYYY-MM-DD") === value;
}

/** Chronological compare of two ISO dates: -1 | 0 | 1. */
export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Clamp an ISO date into [min, max] (either bound optional). */
export function clampISO(value: string, min?: string, max?: string): string {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

/** Whether an ISO date falls outside [min, max]. */
export function isDisabledISO(value: string, min?: string, max?: string): boolean {
  if (min && value < min) return true;
  if (max && value > max) return true;
  return false;
}

export interface DayCell {
  day: number;
  iso: string;
}

/**
 * A month laid out as weeks of 7 cells, Sunday-first. Leading / trailing blanks
 * are null so every row has exactly 7 entries and the grid is a clean rectangle.
 */
export function monthGrid(year: number, month0: number): (DayCell | null)[][] {
  const first = dayjs(`${year}-${pad2(month0 + 1)}-01`);
  const startDow = first.day(); // 0 = Sunday … 6 = Saturday
  const total = first.daysInMonth();
  const flat: (DayCell | null)[] = [];
  for (let i = 0; i < startDow; i++) flat.push(null);
  for (let d = 1; d <= total; d++) flat.push({ day: d, iso: toISO(year, month0, d) });
  while (flat.length % 7 !== 0) flat.push(null);
  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) weeks.push(flat.slice(i, i + 7));
  return weeks;
}

/** Descending list of years in [minYear, maxYear] (newest first). */
export function yearsDescending(minYear: number, maxYear: number): number[] {
  const out: number[] = [];
  for (let y = maxYear; y >= minYear; y--) out.push(y);
  return out;
}

/** Year of a valid ISO date, or null. */
export function isoYear(value: string): number | null {
  return isValidISO(value) ? Number(value.slice(0, 4)) : null;
}

/** 0-based month of a valid ISO date, or null. */
export function isoMonth0(value: string): number | null {
  return isValidISO(value) ? Number(value.slice(5, 7)) - 1 : null;
}
