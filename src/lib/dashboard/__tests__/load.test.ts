const queryCalls: { table: string; field?: string; value?: unknown; limit?: number }[] = [];
let privacyResult = { data: { privacy_prefs: { health_import: false } }, error: null as Error | null };
let recordsResult = { data: [{ id: "own-record", kind: "note", body: "My words", tags: [], created_at: "2026-09-25T00:00:00Z" }], error: null as Error | null };
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  from: (table: string) => {
    queryCalls.push({ table });
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { queryCalls.push({ table, field, value }); return query; },
      contains: (field: string, value: unknown) => { queryCalls.push({ table, field, value }); return query; },
      order: () => query,
      limit: (limit: number) => { queryCalls.push({ table, limit }); return Promise.resolve(recordsResult); },
      maybeSingle: () => Promise.resolve(privacyResult),
    };
    return query;
  },
}) }));
jest.mock("../../import/history", () => ({ getImportHistory: jest.fn().mockResolvedValue([]) }));
jest.mock("../../ops/routines", () => ({ listActiveRoutines: jest.fn().mockResolvedValue([]), listCompletionsSince: jest.fn().mockResolvedValue([]) }));
jest.mock("../../supabase/health", () => ({ listRecentSamples: jest.fn().mockResolvedValue([]) }));
jest.mock("../../ops/reminders", () => ({ remindersSupported: jest.fn().mockReturnValue(false) }));
jest.mock("../../ops/notifications-sdk", () => ({ loadNotifications: jest.fn().mockReturnValue(null) }));

import { loadDashboard } from "../load";
import { listRecentSamples } from "../../supabase/health";
import { getImportHistory } from "../../import/history";
import { listActiveRoutines, listCompletionsSince } from "../../ops/routines";
import { remindersSupported } from "../../ops/reminders";
import { loadNotifications } from "../../ops/notifications-sdk";
import { routineNotificationId } from "../../ops/notification-identity";

beforeEach(() => {
  jest.clearAllMocks();
  queryCalls.length = 0;
  privacyResult = { data: { privacy_prefs: { health_import: false } }, error: null };
  recordsResult.error = null;
  jest.mocked(remindersSupported).mockReturnValue(false);
  jest.mocked(loadNotifications).mockReturnValue(null);
  jest.mocked(listActiveRoutines).mockResolvedValue([]);
});

test("every remote and local data read is scoped to the requested owner", async () => {
  const data = await loadDashboard("alice", false, new Date(2026, 8, 25, 10));
  expect(data.ownerId).toBe("alice");
  expect(queryCalls.filter((call) => call.field === "user_id" || call.field === "id").map((call) => call.value)).toEqual(["alice", "alice", "alice"]);
  expect(getImportHistory).toHaveBeenCalledWith("alice");
  expect(listActiveRoutines).toHaveBeenCalledWith("alice");
  expect(listCompletionsSince).toHaveBeenCalledWith("alice", "2026-09-25");
  expect(queryCalls.filter((call) => call.limit).map((call) => call.limit)).toEqual([80, 3]);
  expect(queryCalls).toContainEqual({ table: "records", field: "tags", value: ["interview"] });
});

test.each([true, null])("restricted or unknown age (%s) never reads health data or consent", async (age) => {
  privacyResult.data.privacy_prefs.health_import = true;
  const data = await loadDashboard("owner", age);
  expect(listRecentSamples).not.toHaveBeenCalled();
  expect(queryCalls.some((call) => call.table === "users")).toBe(false);
  expect(data.healthEnabled).toBe(false);
});

test("an adult's health is read only with stored explicit consent", async () => {
  await loadDashboard("owner", false);
  expect(listRecentSamples).not.toHaveBeenCalled();
  privacyResult.data.privacy_prefs.health_import = true;
  const data = await loadDashboard("owner", false);
  expect(listRecentSamples).toHaveBeenCalledWith("owner", 24);
  expect(data.healthEnabled).toBe(true);
});

test("read failures remain errors instead of empty data or a disabled consent claim", async () => {
  recordsResult.error = new Error("offline");
  privacyResult.error = new Error("offline");
  jest.mocked(listActiveRoutines).mockRejectedValueOnce(new Error("offline"));
  const data = await loadDashboard("owner", false);
  expect(data.records).toEqual({ ok: false });
  expect(data.routines).toEqual({ ok: false });
  expect(data.health).toEqual({ ok: false });
  expect(data.imports).toEqual({ ok: true, value: [] });
});

test("notification inspection counts only this account and never requests permission or schedules", async () => {
  const requestPermissionsAsync = jest.fn();
  const scheduleNotificationAsync = jest.fn();
  jest.mocked(remindersSupported).mockReturnValue(true);
  jest.mocked(loadNotifications).mockReturnValue({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
    getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([
      { identifier: routineNotificationId("owner", "a") },
      { identifier: routineNotificationId("someone-else", "b") },
      { identifier: "unowned-legacy" },
    ]), requestPermissionsAsync, scheduleNotificationAsync,
  } as unknown as NonNullable<ReturnType<typeof loadNotifications>>);
  const data = await loadDashboard("owner", false);
  expect(data.notifications).toEqual({ ok: true, value: { permission: "granted", scheduled: 1 } });
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  expect(scheduleNotificationAsync).not.toHaveBeenCalled();
});

test("a stalled provider expires while other data remains available", async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(listActiveRoutines).mockReturnValueOnce(new Promise(() => undefined));
    const pending = loadDashboard("owner", false);
    await jest.advanceTimersByTimeAsync(8_001);
    const data = await pending;
    expect(data.routines).toEqual({ ok: false });
    expect(data.records.ok).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
