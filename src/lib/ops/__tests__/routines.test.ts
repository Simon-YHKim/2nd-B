import {
  deriveReminder,
  localDayKey,
  mapRecurrence,
  routineDueToday,
  weekStreak,
} from "../routines";
import type { OpsRecommendation } from "../recommend";

describe("ops routines pure helpers (O-R3 P3)", () => {
  describe("mapRecurrence", () => {
    test("passes through daily and weekly, collapses absent to none", () => {
      expect(mapRecurrence({ recurrence: "daily" })).toBe("daily");
      expect(mapRecurrence({ recurrence: "weekly" })).toBe("weekly");
      expect(mapRecurrence({ recurrence: undefined })).toBe("none");
    });
  });

  describe("deriveReminder", () => {
    test("no start → both null", () => {
      expect(deriveReminder({ startsAtIso: undefined, recurrence: "daily" })).toEqual({
        reminder_time: null,
        weekday: null,
      });
    });

    test("invalid start → both null", () => {
      expect(deriveReminder({ startsAtIso: "not-a-date", recurrence: "daily" })).toEqual({
        reminder_time: null,
        weekday: null,
      });
    });

    test("daily keeps local HH:MM and drops weekday", () => {
      // 2026-06-12 is a Friday; build a local-time date so the test is TZ-stable.
      const d = new Date(2026, 5, 12, 7, 5, 0);
      const out = deriveReminder({ startsAtIso: d.toISOString(), recurrence: "daily" });
      expect(out.reminder_time).toBe("07:05");
      expect(out.weekday).toBeNull();
    });

    test("weekly carries the local weekday", () => {
      const d = new Date(2026, 5, 12, 18, 30, 0); // Friday → getDay() 5
      const out = deriveReminder({ startsAtIso: d.toISOString(), recurrence: "weekly" });
      expect(out.reminder_time).toBe("18:30");
      expect(out.weekday).toBe(5);
    });
  });

  describe("routineDueToday", () => {
    const friday = new Date(2026, 5, 12, 9, 0, 0); // getDay() = 5

    test("daily is always due", () => {
      expect(routineDueToday({ recurrence: "daily", weekday: null }, friday)).toBe(true);
    });

    test("weekly due only when weekday matches", () => {
      expect(routineDueToday({ recurrence: "weekly", weekday: 5 }, friday)).toBe(true);
      expect(routineDueToday({ recurrence: "weekly", weekday: 2 }, friday)).toBe(false);
    });

    test("weekly with no weekday is never due (avoids daily noise)", () => {
      expect(routineDueToday({ recurrence: "weekly", weekday: null }, friday)).toBe(false);
    });

    test("none is never due", () => {
      expect(routineDueToday({ recurrence: "none", weekday: null }, friday)).toBe(false);
    });

    test("weekly matches across every weekday", () => {
      for (let wd = 0; wd < 7; wd++) {
        const day = new Date(2026, 5, 7 + wd, 9, 0, 0); // 2026-06-07 is a Sunday
        expect(day.getDay()).toBe(wd);
        expect(routineDueToday({ recurrence: "weekly", weekday: wd }, day)).toBe(true);
        expect(routineDueToday({ recurrence: "weekly", weekday: (wd + 1) % 7 }, day)).toBe(false);
      }
    });
  });

  describe("weekStreak", () => {
    const now = new Date(2026, 5, 12, 9, 0, 0);
    const key = (offset: number) => {
      const d = new Date(2026, 5, 12 - offset);
      return localDayKey(d);
    };

    test("empty logs → 0", () => {
      expect(weekStreak([], now)).toBe(0);
    });

    test("today only → 1", () => {
      expect(weekStreak([{ completed_on: key(0) }], now)).toBe(1);
    });

    test("three consecutive days ending today → 3", () => {
      expect(
        weekStreak([{ completed_on: key(0) }, { completed_on: key(1) }, { completed_on: key(2) }], now),
      ).toBe(3);
    });

    test("a gap breaks the streak", () => {
      // today + 2 days ago (1 day ago missing) → streak is just today.
      expect(weekStreak([{ completed_on: key(0) }, { completed_on: key(2) }], now)).toBe(1);
    });

    test("missing today → 0 even with prior days", () => {
      expect(weekStreak([{ completed_on: key(1) }, { completed_on: key(2) }], now)).toBe(0);
    });

    test("caps at 7", () => {
      const logs = Array.from({ length: 10 }, (_, i) => ({ completed_on: key(i) }));
      expect(weekStreak(logs, now)).toBe(7);
    });

    test("duplicate completed_on entries do not over-count", () => {
      expect(weekStreak([{ completed_on: key(0) }, { completed_on: key(0) }], now)).toBe(1);
    });
  });
});

describe("createRoutineFromRecommendation mapping (via pure derivations)", () => {
  // The Supabase call is exercised through its derivations: mapRecurrence +
  // deriveReminder are the only transforms the insert applies, so verifying the
  // mapping here keeps the test node-pure (no client mock needed).
  test("a weekly rec maps recurrence + reminder_time + weekday", () => {
    const d = new Date(2026, 5, 12, 8, 15, 0); // Friday
    const rec: OpsRecommendation = {
      title: "Morning stretch",
      reason: "You logged stiff mornings.",
      startsAtIso: d.toISOString(),
      durationMinutes: 15,
      recurrence: "weekly",
      checklist: ["roll out mat", "5 min stretch"],
    };
    expect(mapRecurrence(rec)).toBe("weekly");
    expect(deriveReminder(rec)).toEqual({ reminder_time: "08:15", weekday: 5 });
  });

  test("a no-recurrence rec collapses to none with no weekday", () => {
    const rec: OpsRecommendation = { title: "Book a checkup", reason: "Overdue per your notes." };
    expect(mapRecurrence(rec)).toBe("none");
    expect(deriveReminder(rec)).toEqual({ reminder_time: null, weekday: null });
  });
});
