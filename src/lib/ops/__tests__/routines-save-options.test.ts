const mockSingle = jest.fn();
const mockInsert = jest.fn();
const mockAbort = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));
import { createRoutineFromRecommendation } from "../routines";

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockImplementation((row: Record<string, unknown>) => ({ select: () => {
    const query = {
      abortSignal: (signal: AbortSignal) => { mockAbort(signal); return query; },
      single: () => { mockSingle(); return Promise.resolve({ data: { ...row, id: "r1", created_at: "2026-10-09T00:00:00Z" }, error: null }); },
    };
    return query;
  } }));
});

test("weekly routines without a clock persist the explicit weekday", async () => {
  const row = await createRoutineFromRecommendation("owner-a", "daily_focus", { title: "Plan week", reason: "", recurrence: "weekly" }, { weekday: 1 });
  expect(row.weekday).toBe(1);
  expect(row.reminder_time).toBeNull();
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ weekday: 1, reminder_time: null, recurrence: "weekly" }));
});

test("legacy calls still derive the weekday from their start and daily ignores a weekday option", async () => {
  const start = new Date(2026, 9, 9, 9, 15).toISOString();
  const weekly = await createRoutineFromRecommendation("owner-a", "daily_focus", { title: "Plan week", reason: "", recurrence: "weekly", startsAtIso: start });
  expect(weekly.weekday).toBe(5);
  expect(weekly.reminder_time).toBe("09:15");
  const daily = await createRoutineFromRecommendation("owner-a", "daily_focus", { title: "Plan day", reason: "", recurrence: "daily" }, { weekday: 3 });
  expect(daily.weekday).toBeNull();
});

test("invalid weekday and aborted ownership requests perform no insert", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(createRoutineFromRecommendation("owner-a", "daily_focus", { title: "Plan", reason: "", recurrence: "weekly" }, { weekday: 8 })).rejects.toThrow("weekday");
  await expect(createRoutineFromRecommendation("owner-a", "daily_focus", { title: "Plan", reason: "" }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(mockFrom).not.toHaveBeenCalled();
});

test("the owner cancellation signal reaches the exact pending Supabase write", async () => {
  const controller = new AbortController();
  await createRoutineFromRecommendation("owner-a", "daily_focus", { title: "Plan", reason: "" }, { signal: controller.signal });
  expect(mockAbort).toHaveBeenCalledWith(controller.signal);
  expect(mockInsert).toHaveBeenCalledTimes(1);
});
