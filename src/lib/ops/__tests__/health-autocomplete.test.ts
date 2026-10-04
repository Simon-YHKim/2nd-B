// Phase B Slice 1: applyHealthAutoComplete loads active routines, runs the pure
// (no-LLM) mapping, and writes a completion tagged with source_sample_id. We
// mock the supabase client so listActiveRoutines + logRoutineCompletion both
// resolve in-memory.

const upsertMock = jest.fn().mockResolvedValue({ error: null });
const selectMock = jest.fn();

const activeRoutines = [
  { id: "r-ex", user_id: "user-1", domain_id: "exercise_routine", title: "Move", reason: null, recurrence: "daily", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-01T00:00:00.000Z" },
  { id: "r-ideas", user_id: "user-1", domain_id: "exercise_ideas", title: "Ideas", reason: null, recurrence: "none", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-01T00:00:00.000Z" },
];

// listActiveRoutines: .from().select().eq().eq().order() resolving the rows.
function selectChain() {
  const order = () => Promise.resolve({ data: activeRoutines, error: null });
  const eq2 = () => ({ order });
  const eq1 = () => ({ eq: eq2 });
  return { eq: eq1 };
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => {
        selectMock();
        return selectChain();
      },
      upsert: upsertMock,
    }),
  }),
}));

import { applyHealthAutoComplete } from "../routines";

describe("applyHealthAutoComplete (deterministic, writes source_sample_id)", () => {
  beforeEach(() => {
    upsertMock.mockClear();
    selectMock.mockClear();
  });

  test("a workout sample auto-completes exercise_routine with the sample id", async () => {
    const completed = await applyHealthAutoComplete("user-1", {
      id: "sample-99",
      metricType: "workout",
      value: 30,
      startedAt: "2026-06-12T08:00:00.000Z",
    });
    expect(completed).toEqual(["r-ex"]);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toMatchObject({
      user_id: "user-1",
      routine_id: "r-ex",
      completed_on: "2026-06-12",
      source_sample_id: "sample-99",
    });
    expect(opts).toEqual({ onConflict: "routine_id,completed_on", ignoreDuplicates: true });
  });

  test("a sub-goal steps sample completes nothing (no LLM, pure threshold)", async () => {
    const completed = await applyHealthAutoComplete("user-1", {
      id: "sample-1",
      metricType: "steps",
      value: 100,
      startedAt: "2026-06-12T08:00:00.000Z",
    });
    expect(completed).toEqual([]);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("routines handed in by the caller are used as they are, without another query", async () => {
    const completed = await applyHealthAutoComplete(
      "user-1",
      { id: "sample-7", metricType: "workout", value: 30, startedAt: "2026-06-12T08:00:00.000Z" },
      [{ id: "r-only", domain_id: "exercise_routine", created_at: "2026-06-01T00:00:00.000Z" }],
    );
    expect(completed).toEqual(["r-only"]);
    expect(selectMock).not.toHaveBeenCalled();
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ routine_id: "r-only", source_sample_id: "sample-7" });
  });

  test("a sample from a day before the routine existed does not complete it", async () => {
    // The automatic read reaches back to yesterday; a routine made this morning must not get
    // yesterday's tick (that would start its streak on a day it did not exist).
    const workout = { id: "sample-8", metricType: "workout" as const, value: 30, startedAt: "2026-06-12T08:00:00.000Z" };
    const madeLater = [{ id: "r-new", domain_id: "exercise_routine", created_at: "2026-06-14T09:00:00.000Z" }];
    expect(await applyHealthAutoComplete("user-1", workout, madeLater)).toEqual([]);
    expect(upsertMock).not.toHaveBeenCalled();
    // Same day as the routine, or an unreadable created_at: no restriction.
    const sameDay = [{ id: "r-same", domain_id: "exercise_routine", created_at: "2026-06-12T07:00:00.000Z" }];
    expect(await applyHealthAutoComplete("user-1", workout, sameDay)).toEqual(["r-same"]);
    const unreadable = [{ id: "r-odd", domain_id: "exercise_routine", created_at: "not a date" }];
    expect(await applyHealthAutoComplete("user-1", workout, unreadable)).toEqual(["r-odd"]);
  });
});
