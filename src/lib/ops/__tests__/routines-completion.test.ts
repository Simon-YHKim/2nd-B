// Completion dedupe: logRoutineCompletion must upsert on the unique key so a
// double-tap (optimistic check) never creates a second row. We mock the
// supabase client and capture the upsert call shape.

const upsertMock = jest.fn().mockResolvedValue({ error: null });

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}));

import { logRoutineCompletion } from "../routines";

describe("logRoutineCompletion dedupe (O-R3 P3)", () => {
  beforeEach(() => upsertMock.mockClear());

  test("upserts on the (routine_id, completed_on) unique key, ignoring duplicates", async () => {
    await logRoutineCompletion("user-1", "routine-1", "2026-06-12");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toEqual({ user_id: "user-1", routine_id: "routine-1", completed_on: "2026-06-12" });
    expect(opts).toEqual({ onConflict: "routine_id,completed_on", ignoreDuplicates: true });
  });

  test("a repeated completion for the same day is still a single upsert (idempotent)", async () => {
    await logRoutineCompletion("user-1", "routine-1", "2026-06-12");
    await logRoutineCompletion("user-1", "routine-1", "2026-06-12");
    expect(upsertMock).toHaveBeenCalledTimes(2);
    // Both calls carry identical payload + the do-nothing conflict policy, so
    // the DB collapses them to one row.
    expect(upsertMock.mock.calls[0]).toEqual(upsertMock.mock.calls[1]);
  });

  test("throws when the upsert errors", async () => {
    upsertMock.mockResolvedValueOnce({ error: new Error("rls denied") });
    await expect(logRoutineCompletion("user-1", "routine-1", "2026-06-12")).rejects.toThrow("rls denied");
  });
});
