// /focus today tally (QA round 2, 2026-10-05).
//
// R2C-12 · the picker offered 성장 · 커리어 · 학습 · 관계 · 건강 and promised "별에 기록".
//   It now offers the six life areas and the copy claims only the on-screen count.
// R2C-13 · "약 N분" was sessions × the preset picked NOW: one 15-minute session read
//   15 → 25 → 50 as the preset changed. Minutes are now each session's own length.
//
// Gate FC-01 · the tally and the pick are stored per account and purged with it;
//   the shared keys of the previous build are never read as anyone's.
// Gate FC-03 · a read that fails holds every write, so a finished session cannot
//   overwrite a stored count the screen never saw; the next read adds the two.
//
// Render tests are blocked here (RN 0.85): the rules are pure functions, and the
// screen and the copy are held to them by source and locale contracts below.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const nativeValues = new Map<string, string>();
let failReads = false;
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      if (failReads) throw new Error("storage unavailable");
      return nativeValues.get(key) ?? null;
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      nativeValues.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      nativeValues.delete(key);
    }),
  },
}));

import {
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
} from "../../account/local-deletion-fence";
import { LIFE_AREAS } from "../../dashboard/model";
import {
  loadFocusArea,
  loadFocusDay,
  purgeFocusForDeletedAccount,
  saveFocusArea,
  saveFocusDay,
} from "../focus-store";
import {
  EMPTY_FOCUS_DAY,
  FOCUS_AREAS,
  completeFocusSession,
  focusAreaKey,
  focusDayKey,
  focusTallyToSave,
  focusedMinutesToday,
  freshFocusTally,
  readFocusArea,
  readFocusDay,
  restoreFocusTally,
  serializeFocusDay,
} from "../focus-tally";

const TODAY = "2026-10-05";

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

  test("a record with a session of no stored length shows no total, never an estimate", () => {
    const day = readFocusDay(JSON.stringify({ day: TODAY, count: 2, minutes: 15, timed: 1, byArea: {} }), TODAY);
    expect(day.count).toBe(2);
    expect(focusedMinutesToday(day)).toBeNull();
  });

  test("stored and read back the same day, the day is the same day", () => {
    let day = completeFocusSession(EMPTY_FOCUS_DAY, "finance", 15);
    day = completeFocusSession(day, "recreation", 50);
    const back = readFocusDay(serializeFocusDay(TODAY, day), TODAY);
    expect(back).toEqual(day);
    expect(focusedMinutesToday(back)).toBe(65);
    // The summary is today's: yesterday's record reads as nothing.
    expect(readFocusDay(serializeFocusDay("2026-10-04", day), TODAY)).toEqual(EMPTY_FOCUS_DAY);
  });

  test("corrupt or foreign values read as nothing instead of throwing", () => {
    expect(readFocusDay(null, TODAY)).toEqual(EMPTY_FOCUS_DAY);
    expect(readFocusDay("{not json", TODAY)).toEqual(EMPTY_FOCUS_DAY);
    expect(readFocusDay("3", TODAY)).toEqual(EMPTY_FOCUS_DAY);
    expect(readFocusDay(JSON.stringify({ day: TODAY, count: -4, minutes: -1, timed: 2 }), TODAY)).toEqual(
      EMPTY_FOCUS_DAY,
    );
    const foreign = readFocusDay(
      JSON.stringify({ day: TODAY, count: 1, minutes: 15, timed: 1, byArea: { learning: 3, career: 1, health: -2 } }),
      TODAY,
    );
    expect(foreign.byArea).toEqual({ career: 1 });
    // A record never makes the count smaller than the sessions it timed.
    expect(readFocusDay(JSON.stringify({ day: TODAY, minutes: 30, timed: 2, byArea: {} }), TODAY).count).toBe(2);
  });
});

describe("a failed read never lets a finished session overwrite the stored day (gate FC-03)", () => {
  const stored = readFocusDay(
    JSON.stringify({ day: TODAY, count: 3, minutes: 75, timed: 3, byArea: { career: 3 } }),
    TODAY,
  );

  test("nothing is written before the stored record is read back", () => {
    // The read failed: the tally stays unrestored while a session finishes.
    let tally = freshFocusTally("owner-a");
    tally = { ...tally, day: completeFocusSession(tally.day, "health", 25) };
    expect(tally.day.count).toBe(1);
    // The bug wrote count 1 over the stored 3 here.
    expect(focusTallyToSave(tally)).toBeNull();
  });

  test("the read that lands later adds the stored day to what was counted meanwhile", () => {
    let tally = freshFocusTally("owner-a");
    tally = { ...tally, day: completeFocusSession(tally.day, "health", 25) };
    tally = restoreFocusTally(tally, "owner-a", stored);
    expect(tally.restored).toBe(true);
    expect(tally.day.count).toBe(4);
    expect(focusedMinutesToday(tally.day)).toBe(100);
    expect(tally.day.byArea).toEqual({ career: 3, health: 1 });
    expect(focusTallyToSave(tally)).toEqual({ owner: "owner-a", day: tally.day });
    // A second read that lands after the first adds nothing twice.
    expect(restoreFocusTally(tally, "owner-a", stored)).toBe(tally);
  });

  test("a read for another account never lands in this one's tally", () => {
    const tally = freshFocusTally("owner-b");
    expect(restoreFocusTally(tally, "owner-a", stored)).toBe(tally);
    expect(focusTallyToSave(freshFocusTally(null))).toBeNull();
    expect(focusTallyToSave(restoreFocusTally(tally, "owner-b", EMPTY_FOCUS_DAY))).toBeNull();
  });
});

describe("the tally and the pick belong to one account (gate FC-01)", () => {
  const OWNER = "owner-a";
  const OTHER = "owner-b";
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  beforeEach(() => {
    nativeValues.clear();
    failReads = false;
    __resetAccountLocalDeletionFencesForTests();
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "ReactNative" } });
  });
  afterAll(() => {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });

  test("both keys carry the owner", () => {
    expect(focusDayKey(OWNER)).toBe("focus.day.v1.owner-a");
    expect(focusAreaKey(OWNER)).toBe("focus.area.v1.owner-a");
  });

  test("one account's sessions and pick are not another's", async () => {
    const day = completeFocusSession(EMPTY_FOCUS_DAY, "relation", 25);
    await expect(saveFocusDay(OWNER, TODAY, day)).resolves.toBe(true);
    await expect(saveFocusArea(OWNER, "relation")).resolves.toBe(true);
    await expect(loadFocusDay(OWNER, TODAY)).resolves.toEqual(day);
    await expect(loadFocusArea(OWNER)).resolves.toBe("relation");
    await expect(loadFocusDay(OTHER, TODAY)).resolves.toEqual(EMPTY_FOCUS_DAY);
    await expect(loadFocusArea(OTHER)).resolves.toBe(FOCUS_AREAS[0]);
  });

  test("the previous build's ownerless keys are nobody's", async () => {
    nativeValues.set(`focus_done_${TODAY}`, "3");
    nativeValues.set("focus_star_idx", "3");
    nativeValues.set(`focus_star_done_${TODAY}`, JSON.stringify({ "3": 3 }));
    await expect(loadFocusDay(OWNER, TODAY)).resolves.toEqual(EMPTY_FOCUS_DAY);
    await expect(loadFocusArea(OWNER)).resolves.toBe(FOCUS_AREAS[0]);
  });

  test("a storage read failure rejects instead of reading as an empty day", async () => {
    failReads = true;
    await expect(loadFocusDay(OWNER, TODAY)).rejects.toThrow("storage unavailable");
  });

  test("account deletion purges this account's keys and leaves another's", async () => {
    const day = completeFocusSession(EMPTY_FOCUS_DAY, "career", 15);
    for (const owner of [OWNER, OTHER]) {
      await saveFocusDay(owner, TODAY, day);
      await saveFocusArea(owner, "career");
    }
    await expect(purgeFocusForDeletedAccount(OWNER)).resolves.toBe(true);
    expect(nativeValues.has(focusDayKey(OWNER))).toBe(false);
    expect(nativeValues.has(focusAreaKey(OWNER))).toBe(false);
    expect(nativeValues.has(focusDayKey(OTHER))).toBe(true);
    expect(nativeValues.has(focusAreaKey(OTHER))).toBe(true);
    await expect(purgeFocusForDeletedAccount("  ")).resolves.toBe(false);
  });

  test("after the deletion fence, a late session or pick writes nothing", async () => {
    await expect(installAccountLocalDeletionFence(OWNER)).resolves.toBe(true);
    const day = completeFocusSession(EMPTY_FOCUS_DAY, "career", 15);
    await expect(saveFocusDay(OWNER, TODAY, day)).resolves.toBe(false);
    await expect(saveFocusArea(OWNER, "career")).resolves.toBe(false);
    expect([...nativeValues.keys()]).toEqual([`account.deletionFence.v1:${OWNER}`]);
  });

  test("the account purge lists it", () => {
    expect(read("src", "lib", "account", "local-purge.ts")).toContain(
      "observe(() => purgeFocusForDeletedAccount(owner)),",
    );
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
    expect(screen).toContain("completeFocusSession(cur.day, doneArea, prev.config.focusMinutes)");
    expect(screen).toContain("focusedMinutesToday(day)");
    expect(screen).not.toMatch(/\*\s*focusMin\b/);
  });

  test("storage is per account and goes through lib/ops/focus-store (gate FC-01)", () => {
    // No ownerless key and no direct storage call left in the screen.
    expect(screen).not.toContain("AsyncStorage");
    expect(giant).not.toContain("focus_done_");
    expect(screen).toContain("saveFocusDay(save.owner, kstDateToday(), save.day)");
    expect(screen).toContain("saveFocusArea(userId, next)");
    // A new account re-reads its own tally and pick.
    expect(screen).toContain("setTally(freshFocusTally(userId));");
    expect(screen).toContain("}, [userId, restoreTally]);");
    expect(screen).toContain("const day = tally.owner === userId ? tally.day : EMPTY_FOCUS_DAY;");
  });

  test("a failed read holds writes and is retried (gate FC-03)", () => {
    expect(screen).toContain("const save = focusTallyToSave(tally);");
    expect(screen).toContain("setTally((cur) => restoreFocusTally(cur, owner, stored))");
    expect(screen).toContain("if (tally.owner && !tally.restored && tally.day.count > 0) restoreTally(tally.owner);");
    expect(screen).not.toContain("Promise.all(");
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
