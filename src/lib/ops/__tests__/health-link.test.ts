// Phase B Slice 1: the DETERMINISTIC health → routine mapping. No LLM, pure.

import {
  STEP_GOAL,
  SLEEP_MIN_MINUTES,
  localDayKeyFromIso,
  routinesSatisfiedBy,
  sampleSatisfiesDomain,
} from "../health-link";

const routines = [
  { id: "r-ex", domain_id: "exercise_routine" },
  { id: "r-health", domain_id: "health_routine" },
  { id: "r-ideas", domain_id: "exercise_ideas" },
  { id: "r-reading", domain_id: "reading_list" },
];

describe("sampleSatisfiesDomain (constant rule table)", () => {
  test("a workout of any size satisfies exercise_routine but not health_routine", () => {
    const s = { metricType: "workout" as const, value: 5 };
    expect(sampleSatisfiesDomain(s, "exercise_routine")).toBe(true);
    expect(sampleSatisfiesDomain(s, "health_routine")).toBe(false);
  });

  test("steps over goal satisfy both activity domains; under goal satisfies neither", () => {
    const over = { metricType: "steps" as const, value: STEP_GOAL };
    const under = { metricType: "steps" as const, value: STEP_GOAL - 1 };
    expect(sampleSatisfiesDomain(over, "exercise_routine")).toBe(true);
    expect(sampleSatisfiesDomain(over, "health_routine")).toBe(true);
    expect(sampleSatisfiesDomain(under, "exercise_routine")).toBe(false);
    expect(sampleSatisfiesDomain(under, "health_routine")).toBe(false);
  });

  test("sleep over the minimum satisfies health_routine only; under does not", () => {
    const ok = { metricType: "sleep" as const, value: SLEEP_MIN_MINUTES };
    const short = { metricType: "sleep" as const, value: SLEEP_MIN_MINUTES - 1 };
    expect(sampleSatisfiesDomain(ok, "health_routine")).toBe(true);
    expect(sampleSatisfiesDomain(ok, "exercise_routine")).toBe(false);
    expect(sampleSatisfiesDomain(short, "health_routine")).toBe(false);
  });

  test("non-activity domains (exercise_ideas + the other 11) never auto-complete", () => {
    const strong = { metricType: "workout" as const, value: 999 };
    for (const d of ["exercise_ideas", "reading_list", "money_check", "side_project"] as const) {
      expect(sampleSatisfiesDomain(strong, d)).toBe(false);
    }
  });
});

describe("routinesSatisfiedBy (pure mapping over active routines)", () => {
  test("a workout sample auto-completes exercise_routine only", () => {
    const hits = routinesSatisfiedBy(
      { metricType: "workout", value: 30, startedAt: "2026-06-12T08:00:00.000Z" },
      routines,
    );
    expect(hits.map((h) => h.routineId)).toEqual(["r-ex"]);
  });

  test("steps over goal auto-complete both exercise_routine and health_routine", () => {
    const hits = routinesSatisfiedBy(
      { metricType: "steps", value: STEP_GOAL + 500, startedAt: "2026-06-12T09:00:00.000Z" },
      routines,
    );
    expect(hits.map((h) => h.routineId).sort()).toEqual(["r-ex", "r-health"]);
  });

  test("steps under goal complete nothing", () => {
    const hits = routinesSatisfiedBy(
      { metricType: "steps", value: 100, startedAt: "2026-06-12T09:00:00.000Z" },
      routines,
    );
    expect(hits).toEqual([]);
  });

  test("completedOn is the local day key derived from started_at", () => {
    const hits = routinesSatisfiedBy(
      { metricType: "workout", value: 20, startedAt: "2026-06-12T08:00:00.000Z" },
      routines,
    );
    expect(hits[0]?.completedOn).toBe(localDayKeyFromIso("2026-06-12T08:00:00.000Z"));
  });
});
