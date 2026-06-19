// Wave 1: applyFocusSessionComplete loads active routines and logs a completion
// for ONLY the daily_focus routines, via the existing idempotent
// logRoutineCompletion. Deterministic, no LLM. We mock the supabase client so
// listActiveRoutines + the upsert both resolve in-memory.

const upsertMock = jest.fn().mockResolvedValue({ error: null });

const activeRoutines = [
  { id: "r-focus", user_id: "user-1", domain_id: "daily_focus", title: "Deep work", reason: null, recurrence: "daily", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-01T00:00:00.000Z" },
  { id: "r-ex", user_id: "user-1", domain_id: "exercise_routine", title: "Move", reason: null, recurrence: "daily", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-01T00:00:00.000Z" },
  { id: "r-focus-2", user_id: "user-1", domain_id: "daily_focus", title: "Reading block", reason: null, recurrence: "daily", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-02T00:00:00.000Z" },
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

import { applyFocusSessionComplete } from "../routines";

describe("applyFocusSessionComplete (deterministic, daily_focus only)", () => {
  beforeEach(() => upsertMock.mockClear());

  test("ticks every daily_focus routine and skips other domains", async () => {
    const now = new Date(2026, 5, 12, 9, 30); // local 2026-06-12
    const completed = await applyFocusSessionComplete("user-1", now);
    expect(completed).toEqual(["r-focus", "r-focus-2"]);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    const ids = upsertMock.mock.calls.map((c) => c[0].routine_id);
    expect(ids).toEqual(["r-focus", "r-focus-2"]);
    expect(ids).not.toContain("r-ex");
  });

  test("writes the local day key and the idempotent conflict policy", async () => {
    const now = new Date(2026, 5, 12, 9, 30);
    await applyFocusSessionComplete("user-1", now);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toEqual({ user_id: "user-1", routine_id: "r-focus", completed_on: "2026-06-12" });
    expect(opts).toEqual({ onConflict: "routine_id,completed_on", ignoreDuplicates: true });
  });

  test("re-running the same day is idempotent (same upsert payload, DB collapses)", async () => {
    const now = new Date(2026, 5, 12, 9, 30);
    await applyFocusSessionComplete("user-1", now);
    const first = upsertMock.mock.calls.map((c) => JSON.stringify(c));
    upsertMock.mockClear();
    await applyFocusSessionComplete("user-1", now);
    const second = upsertMock.mock.calls.map((c) => JSON.stringify(c));
    expect(second).toEqual(first);
  });
});
