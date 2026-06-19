// Phase B Slice 1: applyHealthAutoComplete loads active routines, runs the pure
// (no-LLM) mapping, and writes a completion tagged with source_sample_id. We
// mock the supabase client so listActiveRoutines + logRoutineCompletion both
// resolve in-memory.

const upsertMock = jest.fn().mockResolvedValue({ error: null });

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
      select: () => selectChain(),
      upsert: upsertMock,
    }),
  }),
}));

import { applyHealthAutoComplete } from "../routines";

describe("applyHealthAutoComplete (deterministic, writes source_sample_id)", () => {
  beforeEach(() => upsertMock.mockClear());

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
});
