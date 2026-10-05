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
//   added when it finishes and stored. A day counted before lengths were kept has
//   no honest total, so the minutes are hidden for it rather than estimated.
import { LIFE_AREAS, type LifeArea } from "@/lib/dashboard/model";

/** The areas the picker offers, in the dashboard's order. */
export const FOCUS_AREAS: readonly LifeArea[] = LIFE_AREAS;

/** Device-local storage keys. The count key predates this module and keeps its name. */
export const FOCUS_AREA_KEY = "focus_area";
export function focusCountKey(day: string): string {
  return `focus_done_${day}`;
}
export function focusLogKey(day: string): string {
  return `focus_log_${day}`;
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
 * Today's tally from the two stored values. Tolerant: a missing, corrupt or
 * foreign value reads as nothing rather than throwing, and a log can never make
 * the count smaller than the sessions it timed.
 */
export function readFocusDay(countRaw: string | null, logRaw: string | null): FocusDay {
  const n = countRaw == null ? NaN : Number(countRaw);
  let count = Number.isInteger(n) && n > 0 ? n : 0;
  let minutes = 0;
  let timed = 0;
  const byArea: Partial<Record<LifeArea, number>> = {};
  if (logRaw) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(logRaw);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === "object") {
      const log = parsed as Record<string, unknown>;
      const m = countOf(log.minutes);
      const t = countOf(log.timed);
      if (m !== null && t !== null) {
        minutes = m;
        timed = t;
      }
      if (log.byArea && typeof log.byArea === "object") {
        for (const [area, value] of Object.entries(log.byArea as Record<string, unknown>)) {
          const c = countOf(value);
          if (isFocusArea(area) && c !== null && c > 0) byArea[area] = c;
        }
      }
    }
  }
  count = Math.max(count, timed);
  return { count, minutes, timed, byArea };
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

export function serializeFocusLog(day: FocusDay): string {
  return JSON.stringify({ minutes: day.minutes, timed: day.timed, byArea: day.byArea });
}

/**
 * Minutes actually focused today: the stored lengths of today's sessions, never
 * `count × the current preset`. Null when part of today was counted before
 * lengths were stored, because then there is no true total to show.
 */
export function focusedMinutesToday(day: FocusDay): number | null {
  return day.timed === day.count ? day.minutes : null;
}
