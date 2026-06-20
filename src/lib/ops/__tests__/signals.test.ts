import {
  ADHERENCE_WINDOW_DAYS,
  adherenceSinceKey,
  summarizeAdherence,
} from "../signals";

// Fixed "now" so day-key math is deterministic: 2026-06-20 (a Saturday).
const NOW = new Date(2026, 5, 20, 9, 0, 0);

function day(offsetBack: number): string {
  const d = new Date(2026, 5, 20 - offsetBack);
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("summarizeAdherence (deterministic, aggregate-only signal)", () => {
  test("returns '' when the domain has no managed routines (nothing to ground on)", () => {
    const out = summarizeAdherence("daily_focus", [], [], NOW);
    expect(out).toBe("");
  });

  test("returns '' when routines exist but none in the target domain", () => {
    const out = summarizeAdherence(
      "daily_focus",
      [{ id: "r1", domain_id: "home_reset" }],
      [{ routine_id: "r1", completed_on: day(0) }],
      NOW,
    );
    expect(out).toBe("");
  });

  test("counts DISTINCT days in the window and the current streak", () => {
    const routines = [{ id: "r1", domain_id: "daily_focus" }];
    const logs = [
      { routine_id: "r1", completed_on: day(0) }, // today
      { routine_id: "r1", completed_on: day(1) }, // yesterday
      { routine_id: "r1", completed_on: day(2) }, // 2 days ago
    ];
    const out = summarizeAdherence("daily_focus", routines, logs, NOW);
    expect(out).toContain("3/7 days done");
    expect(out).toContain("current streak 3d");
    expect(out).toContain("1 active routine(s)");
  });

  test("two routines completed the SAME day count as one done-day; streak breaks on a gap", () => {
    const routines = [
      { id: "r1", domain_id: "daily_focus" },
      { id: "r2", domain_id: "daily_focus" },
    ];
    const logs = [
      { routine_id: "r1", completed_on: day(0) },
      { routine_id: "r2", completed_on: day(0) }, // same day, dedupes
      { routine_id: "r1", completed_on: day(2) }, // gap at day(1) -> streak = 1
    ];
    const out = summarizeAdherence("daily_focus", routines, logs, NOW);
    expect(out).toContain("2/7 days done");
    expect(out).toContain("current streak 1d");
    expect(out).toContain("2 active routine(s)");
  });

  test("ignores logs outside the window and logs from other-domain routines", () => {
    const routines = [
      { id: "r1", domain_id: "daily_focus" },
      { id: "rOther", domain_id: "home_reset" },
    ];
    const logs = [
      { routine_id: "r1", completed_on: day(0) }, // in window
      { routine_id: "r1", completed_on: day(10) }, // out of window -> ignored
      { routine_id: "rOther", completed_on: day(1) }, // other domain -> ignored
    ];
    const out = summarizeAdherence("daily_focus", routines, logs, NOW);
    expect(out).toContain("1/7 days done");
    expect(out).toContain("current streak 1d");
  });

  test("zero recent completions reads as a slipping signal (0 days, 0 streak)", () => {
    const routines = [{ id: "r1", domain_id: "daily_focus" }];
    const out = summarizeAdherence("daily_focus", routines, [], NOW);
    expect(out).toContain("0/7 days done");
    expect(out).toContain("current streak 0d");
  });
});

describe("adherenceSinceKey (the log-query lower bound spans the window)", () => {
  test("is windowDays-1 days before today", () => {
    expect(adherenceSinceKey(NOW)).toBe(day(ADHERENCE_WINDOW_DAYS - 1));
    expect(adherenceSinceKey(NOW)).toBe("2026-06-14");
  });
});
