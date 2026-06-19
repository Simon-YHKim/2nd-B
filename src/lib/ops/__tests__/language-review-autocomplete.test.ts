// Wave 1: applyLanguageReviewComplete loads active routines and logs a
// completion for ONLY the language_practice routines, via the existing
// idempotent logRoutineCompletion. Deterministic, no LLM. The supabase client
// is mocked so listActiveRoutines + the upsert resolve in-memory.

const upsertMock = jest.fn().mockResolvedValue({ error: null });

const activeRoutines = [
  { id: "r-lang", user_id: "user-1", domain_id: "language_practice", title: "Spanish cards", reason: null, recurrence: "daily", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-01T00:00:00.000Z" },
  { id: "r-focus", user_id: "user-1", domain_id: "daily_focus", title: "Deep work", reason: null, recurrence: "daily", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-01T00:00:00.000Z" },
  { id: "r-lang-2", user_id: "user-1", domain_id: "language_practice", title: "French verbs", reason: null, recurrence: "daily", reminder_time: null, weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-06-02T00:00:00.000Z" },
];

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

import { applyLanguageReviewComplete } from "../routines";

describe("applyLanguageReviewComplete (deterministic, language_practice only)", () => {
  beforeEach(() => upsertMock.mockClear());

  test("ticks every language_practice routine and skips other domains", async () => {
    const now = new Date(2026, 5, 12, 9, 30); // local 2026-06-12
    const completed = await applyLanguageReviewComplete("user-1", now);
    expect(completed).toEqual(["r-lang", "r-lang-2"]);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    const ids = upsertMock.mock.calls.map((c) => c[0].routine_id);
    expect(ids).toEqual(["r-lang", "r-lang-2"]);
    expect(ids).not.toContain("r-focus");
  });

  test("writes the local day key and the idempotent conflict policy", async () => {
    const now = new Date(2026, 5, 12, 9, 30);
    await applyLanguageReviewComplete("user-1", now);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toEqual({ user_id: "user-1", routine_id: "r-lang", completed_on: "2026-06-12" });
    expect(opts).toEqual({ onConflict: "routine_id,completed_on", ignoreDuplicates: true });
  });

  test("re-running the same day is idempotent (same upsert payload, DB collapses)", async () => {
    const now = new Date(2026, 5, 12, 9, 30);
    await applyLanguageReviewComplete("user-1", now);
    const first = upsertMock.mock.calls.map((c) => JSON.stringify(c));
    upsertMock.mockClear();
    await applyLanguageReviewComplete("user-1", now);
    const second = upsertMock.mock.calls.map((c) => JSON.stringify(c));
    expect(second).toEqual(first);
  });
});
