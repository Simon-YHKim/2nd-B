// /focus today tally (QA round 2, 2026-10-05).
//
// R2C-12 · the picker offered 성장 · 커리어 · 학습 · 관계 · 건강 and promised "별에 기록".
//   It now offers the six life areas and the copy claims only the on-screen count.
// R2C-13 · "약 N분" was sessions × the preset picked NOW: one 15-minute session read
//   15 → 25 → 50 as the preset changed. Minutes are now each session's own length.
//
// Render tests are blocked here (RN 0.85): the rules are pure functions, and the
// screen and the copy are held to them by source and locale contracts below.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LIFE_AREAS } from "../../dashboard/model";
import {
  EMPTY_FOCUS_DAY,
  FOCUS_AREAS,
  completeFocusSession,
  focusCountKey,
  focusLogKey,
  focusedMinutesToday,
  readFocusArea,
  readFocusDay,
  serializeFocusLog,
} from "../focus-tally";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("focus areas = the six life areas (R2C-12)", () => {
  test("the picker offers exactly the dashboard's areas, in its order", () => {
    expect([...FOCUS_AREAS]).toEqual([...LIFE_AREAS]);
    expect(FOCUS_AREAS).toHaveLength(6);
    // The old canon list had 학습 (learning), which is neither a star nor an area.
    expect(FOCUS_AREAS as readonly string[]).not.toContain("learning");
  });

  test("a stored pick reads back; anything else falls back to the first area", () => {
    expect(readFocusArea("relation")).toBe("relation");
    expect(readFocusArea(null)).toBe("career");
    // The previous build stored an index into the five canon labels.
    expect(readFocusArea("3")).toBe("career");
    expect(readFocusArea("learning")).toBe("career");
  });
});

describe("today's minutes are the sessions' own lengths (R2C-13)", () => {
  test("one 15-minute session is 15 minutes, whatever preset is picked afterwards", () => {
    const day = completeFocusSession(EMPTY_FOCUS_DAY, "relation", 15);
    // The bug: doneToday * focusMin gave 15 / 25 / 50 for presets 15 / 25 / 50.
    // The total no longer takes a preset at all.
    expect(focusedMinutesToday(day)).toBe(15);
    expect(day.count).toBe(1);
  });

  test("mixed lengths add up", () => {
    let day = completeFocusSession(EMPTY_FOCUS_DAY, "career", 15);
    day = completeFocusSession(day, "career", 25);
    day = completeFocusSession(day, "health", 50);
    expect(focusedMinutesToday(day)).toBe(90);
    expect(day.byArea).toEqual({ career: 2, health: 1 });
  });

  test("a day counted before lengths were stored shows no total, never an estimate", () => {
    // focus_done_<day> = 2 from the previous build, no log yet.
    let day = readFocusDay("2", null);
    expect(day.count).toBe(2);
    expect(focusedMinutesToday(day)).toBeNull();
    // A new session after the update still cannot complete an honest total.
    day = completeFocusSession(day, "growth", 25);
    expect(day.count).toBe(3);
    expect(focusedMinutesToday(day)).toBeNull();
  });

  test("stored and read back, the day is the same day", () => {
    let day = completeFocusSession(EMPTY_FOCUS_DAY, "finance", 15);
    day = completeFocusSession(day, "recreation", 50);
    const back = readFocusDay(String(day.count), serializeFocusLog(day));
    expect(back).toEqual(day);
    expect(focusedMinutesToday(back)).toBe(65);
  });

  test("corrupt or foreign values read as nothing instead of throwing", () => {
    expect(readFocusDay(null, null)).toEqual(EMPTY_FOCUS_DAY);
    expect(readFocusDay("abc", "{not json")).toEqual(EMPTY_FOCUS_DAY);
    expect(readFocusDay("-4", JSON.stringify({ minutes: -1, timed: 2 }))).toEqual(EMPTY_FOCUS_DAY);
    const foreign = readFocusDay(
      "1",
      JSON.stringify({ minutes: 15, timed: 1, byArea: { learning: 3, career: 1, health: -2 } }),
    );
    expect(foreign.byArea).toEqual({ career: 1 });
    // A log never makes the count smaller than the sessions it timed.
    expect(readFocusDay(null, JSON.stringify({ minutes: 30, timed: 2, byArea: {} })).count).toBe(2);
  });

  test("storage keys: the count key keeps its old name, the log is per day", () => {
    expect(focusCountKey("2026-10-05")).toBe("focus_done_2026-10-05");
    expect(focusLogKey("2026-10-05")).toBe("focus_log_2026-10-05");
  });
});

describe("DeepSpaceFocusScreen wiring (source contract)", () => {
  const giant = read("src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx").replace(/\r\n?/g, "\n");
  const from = giant.indexOf("export function DeepSpaceFocusScreen()");
  const screen = giant.slice(from, giant.indexOf("\n}\n", from));

  test("the screen is where the slice says", () => {
    expect(from).toBeGreaterThan(0);
    expect(screen).toContain("<DockShell");
  });

  test("minutes come from the stored day, not the current preset", () => {
    expect(screen).toContain("completeFocusSession(d, doneArea, prev.config.focusMinutes)");
    expect(screen).toContain("focusedMinutesToday(day)");
    expect(screen).not.toMatch(/\*\s*focusMin\b/);
  });

  test("the picker is the life areas with the dashboard's labels, not the canon stars", () => {
    expect(screen).toContain("FOCUS_AREAS.map(");
    expect(screen).toContain("t(`phone.areas.${a}`)");
    expect(giant).not.toContain("FOCUS_STARS");
    expect(giant).not.toContain("focus.stars.");
    expect(giant).not.toContain("focus_star_");
    expect(read("src", "lib", "canon", "index.ts")).not.toMatch(/focusStars:/);
  });
});

describe("focus copy claims only what happens (R2C-12)", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  // What the screen renders. None of it may say the session goes to a star.
  const RENDERED = [
    "leadPre",
    "leadArea",
    "leadPost",
    "forWhichArea",
    "todayCount",
    "todaySub",
    "todaySubGoalOnly",
    "todayAreaCount",
    "alarmFocusTitle",
    "alarmFocusBodyArea",
  ] as const;
  const STAR_WORD: Record<(typeof LOCALES)[number], RegExp> = {
    en: /\bstars?\b/i,
    ko: /별/,
    es: /estrella/i,
    pt: /estrela/i,
    id: /bintang/i,
  };

  for (const locale of LOCALES) {
    test(`${locale}: every rendered key exists and none promises a star`, () => {
      const ops = JSON.parse(read("locales", locale, "ops.json")) as {
        focus: Record<string, unknown>;
        phone: { areas: Record<string, string> };
      };
      for (const key of RENDERED) {
        const value = ops.focus[key];
        expect(typeof value).toBe("string");
        expect(value as string).not.toMatch(STAR_WORD[locale]);
      }
      expect(ops.focus).not.toHaveProperty("stars");
      expect(ops.focus).not.toHaveProperty("forWhichStar");
      for (const area of LIFE_AREAS) expect(typeof ops.phone.areas[area]).toBe("string");
    });
  }
});
