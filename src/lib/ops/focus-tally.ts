// /focus 의 하루 집계 — pure. The screen (DeepSpaceFocusScreen) only stores and
// renders what this module decides, so the rules below are testable without a
// render (render tests are blocked in this repo, RN 0.85).
//
// Two defects shaped it (QA round 2, 2026-10-05):
//
// R2C-12 · The picker offered 성장 · 커리어 · 학습 · 관계 · 건강 and promised "끝나면 X 별에
//   기록합니다". Those five were neither the seven stars nor the six life areas
//   ("학습" is in neither), and nothing reached any star: the pick only fed a
//   device-local counter this screen reads back. The pick is now one of the six
//   life areas (dashboard/model LIFE_AREAS, labelled with the dashboard's own
//   phone.areas.* strings), stored by area id, and the copy claims only what
//   happens: the session is counted for that area in today's summary here. It is
//   deliberately NOT written as a domain:* record. A finished timer is not
//   something learned about the person, and brightness must not rise on its own
//   (the same rule chat autosave follows). Feeding the areas would be a separate
//   product decision.
//
// R2C-13 · "약 N분" was `sessions × the preset chosen now`, so switching 15 → 50
//   rewrote a finished day from 15 to 50 minutes. Each session's own length is now
//   added when it finishes and stored. A record in which some session has no
//   stored length has no honest total, so the minutes are hidden rather than
//   estimated.
//
// Owner (gate FC-01 · FC-03, 2026-10-05) · the tally and the pick are stored per
//   account (focus.day.v1.<owner> · focus.area.v1.<owner>, I/O in ./focus-store) and
//   purged with the account. The shared keys the previous build wrote
//   (focus_done_<day>, focus_star_idx, focus_star_done_<day>) carry no owner, so
//   nothing here reads them: another account's count must not appear as yours.
import { LIFE_AREAS, type LifeArea } from "@/lib/dashboard/model";

/** The areas the picker offers, in the dashboard's order. */
export const FOCUS_AREAS: readonly LifeArea[] = LIFE_AREAS;

/** Device-local storage keys, one pair per account (purged with it, ./focus-store). */
export function focusDayKey(owner: string): string {
  return `focus.day.v1.${owner}`;
}
export function focusAreaKey(owner: string): string {
  return `focus.area.v1.${owner}`;
}

export interface FocusDay {
  /** Focus sessions finished today. */
  count: number;
  /** Sum of the lengths, in minutes, of the sessions whose length is stored. */
  minutes: number;
  /** How many of `count` have a stored length. Fewer than `count` = total unknown. */
  timed: number;
  /** Sessions per area today (device-local; nothing else reads it). */
  byArea: Partial<Record<LifeArea, number>>;
}

export const EMPTY_FOCUS_DAY: FocusDay = { count: 0, minutes: 0, timed: 0, byArea: {} };

export function isFocusArea(value: unknown): value is LifeArea {
  return typeof value === "string" && (LIFE_AREAS as readonly string[]).includes(value);
}

/** The stored pick, or the first area when nothing valid is stored. */
export function readFocusArea(raw: string | null): LifeArea {
  return isFocusArea(raw) ? raw : FOCUS_AREAS[0];
}

function countOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Today's tally from the account's stored record. Tolerant: a missing, corrupt or
 * foreign value reads as nothing rather than throwing, a record from another KST
 * day reads as nothing (the summary is today's), and the count can never be
 * smaller than the sessions the record timed.
 */
export function readFocusDay(raw: string | null, today: string): FocusDay {
  if (!raw) return EMPTY_FOCUS_DAY;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") return EMPTY_FOCUS_DAY;
  const record = parsed as Record<string, unknown>;
  if (record.day !== today) return EMPTY_FOCUS_DAY;
  let count = countOf(record.count) ?? 0;
  let minutes = 0;
  let timed = 0;
  const m = countOf(record.minutes);
  const t = countOf(record.timed);
  if (m !== null && t !== null) {
    minutes = m;
    timed = t;
  }
  const byArea: Partial<Record<LifeArea, number>> = {};
  if (record.byArea && typeof record.byArea === "object") {
    for (const [area, value] of Object.entries(record.byArea as Record<string, unknown>)) {
      const c = countOf(value);
      if (isFocusArea(area) && c !== null && c > 0) byArea[area] = c;
    }
  }
  count = Math.max(count, timed);
  return { count, minutes, timed, byArea };
}

/**
 * Two tallies of the same day added together. The screen starts from an empty
 * tally and adds the stored one when it is read back, so a session finished
 * before the read lands (or while it keeps failing) is kept, not overwritten.
 */
export function addFocusDays(a: FocusDay, b: FocusDay): FocusDay {
  const byArea: Partial<Record<LifeArea, number>> = { ...a.byArea };
  for (const [area, n] of Object.entries(b.byArea) as [LifeArea, number][]) {
    byArea[area] = (byArea[area] ?? 0) + n;
  }
  return {
    count: a.count + b.count,
    minutes: a.minutes + b.minutes,
    timed: a.timed + b.timed,
    byArea,
  };
}

/** One finished session of `minutes` length, counted for `area`. */
export function completeFocusSession(day: FocusDay, area: LifeArea, minutes: number): FocusDay {
  const length = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  return {
    count: day.count + 1,
    minutes: day.minutes + length,
    timed: day.timed + (length > 0 ? 1 : 0),
    byArea: { ...day.byArea, [area]: (day.byArea[area] ?? 0) + 1 },
  };
}

/**
 * The screen's tally. `owner` travels with it, so a tally is only ever written
 * under the account it was counted for (FC-01). `restored` = the stored record has
 * been read back; until then nothing is written, because a write would replace a
 * record this screen has not seen (FC-03).
 */
export interface FocusTally {
  owner: string | null;
  day: FocusDay;
  restored: boolean;
}

/** A new owner (or none) starts from nothing, never from the previous owner's tally. */
export function freshFocusTally(owner: string | null): FocusTally {
  return { owner, day: EMPTY_FOCUS_DAY, restored: false };
}

/**
 * The stored record for `owner` was read back: add it to the sessions counted
 * since the screen opened. A read for another owner, or a second read after the
 * first one landed, changes nothing.
 */
export function restoreFocusTally(current: FocusTally, owner: string, stored: FocusDay): FocusTally {
  if (current.owner !== owner || current.restored) return current;
  return { owner, day: addFocusDays(stored, current.day), restored: true };
}

/** What may be written now: nothing before the read-back, nothing without an owner, nothing empty. */
export function focusTallyToSave(tally: FocusTally): { owner: string; day: FocusDay } | null {
  if (!tally.owner || !tally.restored || tally.day.count <= 0) return null;
  return { owner: tally.owner, day: tally.day };
}

/** The stored record: today's tally tagged with its KST day. */
export function serializeFocusDay(today: string, day: FocusDay): string {
  return JSON.stringify({
    day: today,
    count: day.count,
    minutes: day.minutes,
    timed: day.timed,
    byArea: day.byArea,
  });
}

/**
 * Minutes actually focused today: the stored lengths of today's sessions, never
 * `count × the current preset`. Null when some counted session has no stored
 * length, because then there is no true total to show.
 */
export function focusedMinutesToday(day: FocusDay): number | null {
  return day.timed === day.count ? day.minutes : null;
}
