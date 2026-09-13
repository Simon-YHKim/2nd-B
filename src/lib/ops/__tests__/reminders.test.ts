const requestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const scheduleNotificationAsync = jest.fn<Promise<string>, [Record<string, unknown>]>();
const setNotificationChannelAsync = jest.fn<Promise<null>, [string, Record<string, unknown>]>();
const getAllScheduledNotificationsAsync = jest.fn<Promise<Array<{
  identifier: string;
  trigger: Record<string, unknown>;
}>>, []>();
const cancelScheduledNotificationAsync = jest.fn<Promise<void>, [string]>();
const getPresentedNotificationsAsync = jest.fn<Promise<Array<{ request: { identifier: string } }>>, []>();
const dismissNotificationAsync = jest.fn<Promise<void>, [string]>();
const clearLastNotificationResponseAsync = jest.fn<Promise<void>, []>();
const getItem = jest.fn<Promise<string | null>, [string]>();
const setItem = jest.fn<Promise<void>, [string, string]>();
const removeItem = jest.fn<Promise<void>, [string]>();
const supabaseGetSession = jest.fn<Promise<{
  data: { session: { user: { id: string } } | null };
  error: Error | null;
}>, []>();
const supabaseSignOut = jest.fn<Promise<{ error: Error | null }>, [unknown?]>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
    removeItem: (key: string) => removeItem(key),
  },
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () => supabaseGetSession(),
      signOut: (options?: unknown) => supabaseSignOut(options),
    },
  }),
}));

jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: () => requestPermissionsAsync(),
  scheduleNotificationAsync: (request: Record<string, unknown>) => scheduleNotificationAsync(request),
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) =>
    setNotificationChannelAsync(id, channel),
  getAllScheduledNotificationsAsync: () => getAllScheduledNotificationsAsync(),
  cancelScheduledNotificationAsync: (id: string) => cancelScheduledNotificationAsync(id),
  getPresentedNotificationsAsync: () => getPresentedNotificationsAsync(),
  dismissNotificationAsync: (id: string) => dismissNotificationAsync(id),
  clearLastNotificationResponseAsync: () => clearLastNotificationResponseAsync(),
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));

import {
  clearAccountScopedLocalNotifications,
  foregroundNotificationBehavior,
  migrateLegacyRoutineNotifications,
  remindersSupported,
  scheduleRoutineReminder,
} from "../reminders";
import {
  finalizeDeletedAccountSession,
  signOut as signOutWithCleanup,
} from "../../supabase/auth";

const originalNavigator = globalThis.navigator;

function setNavigatorProduct(product: string | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: product === undefined ? undefined : { product },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  getAllScheduledNotificationsAsync.mockResolvedValue([]);
  cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  getPresentedNotificationsAsync.mockResolvedValue([]);
  dismissNotificationAsync.mockResolvedValue(undefined);
  clearLastNotificationResponseAsync.mockResolvedValue(undefined);
  getItem.mockResolvedValue(null);
  setItem.mockResolvedValue(undefined);
  removeItem.mockResolvedValue(undefined);
  supabaseGetSession.mockResolvedValue({
    data: { session: { user: { id: "account-a" } } },
    error: null,
  });
  supabaseSignOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
  jest.clearAllMocks();
});

describe("routine reminders (O-R3 P2, on-device only)", () => {
  test("foreground handler asks the OS to actually show the banner (not suppress it)", async () => {
    // Without setNotificationHandler, expo-notifications hides foreground banners,
    // so a focus-timer notifyNow fired while on-screen would be invisible.
    await expect(foregroundNotificationBehavior()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  test("outside React Native scheduling reports unavailable without touching the module", async () => {
    setNavigatorProduct("Gecko");
    expect(remindersSupported()).toBe(false);
    expect(
      await scheduleRoutineReminder({ title: "x", startsAtIso: "2026-06-12T09:00:00.000Z" }),
    ).toBe("unavailable");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("denied permission short-circuits before any scheduling", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    expect(
      await scheduleRoutineReminder({ title: "x", startsAtIso: "2026-06-12T09:00:00.000Z" }),
    ).toBe("denied");
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("daily recurrence maps to a repeating local wall-clock trigger", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    scheduleNotificationAsync.mockResolvedValueOnce("id-1");
    const start = new Date("2026-06-12T21:30:00.000Z");
    expect(
      await scheduleRoutineReminder(
        {
          title: "Private routine title",
          description: "Private reason with personal details.",
          startsAtIso: start.toISOString(),
          recurrence: "daily",
        },
        { identifier: "ops-routine-routine-1" },
      ),
    ).toBe("scheduled");
    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      identifier: string;
      content: { title: string; body: string | null };
      trigger: { type: string; hour: number; minute: number; channelId: string };
    };
    expect(request.identifier).toBe("ops-routine-routine-1");
    expect(request.content).toEqual({
      title: "2nd Brain",
      body: "Open the app to view your routine.",
    });
    expect(JSON.stringify(request)).not.toContain("Private routine title");
    expect(JSON.stringify(request)).not.toContain("Private reason");
    expect(request.trigger.type).toBe("daily");
    expect(request.trigger.hour).toBe(start.getHours());
    expect(request.trigger.minute).toBe(start.getMinutes());
    expect(request.trigger.channelId).toBe("ops-routines");
    expect(setNotificationChannelAsync).toHaveBeenCalledWith(
      "ops-routines",
      expect.objectContaining({ name: "Routines" }),
    );
  });

  test("weekly recurrence carries the 1=Sunday weekday convention", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    scheduleNotificationAsync.mockResolvedValueOnce("id-2");
    const start = new Date("2026-06-12T21:30:00.000Z");
    await scheduleRoutineReminder(
      {
        title: "Weekly review",
        startsAtIso: start.toISOString(),
        recurrence: "weekly",
      },
      { identifier: "ops-routine-routine-2" },
    );
    const trigger = (scheduleNotificationAsync.mock.calls[0][0] as { trigger: { type: string; weekday: number } }).trigger;
    expect(trigger.type).toBe("weekly");
    expect(trigger.weekday).toBe(start.getDay() + 1);
  });

  test("recurring reminders fail closed before permission without a validated stable id", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await expect(
      scheduleRoutineReminder({ title: "Daily", startsAtIso: start, recurrence: "daily" }),
    ).resolves.toBe("error");
    await expect(
      scheduleRoutineReminder(
        { title: "Weekly", startsAtIso: start, recurrence: "weekly" },
        { identifier: "foreign-prefix-routine-1" },
      ),
    ).resolves.toBe("error");
    await expect(
      scheduleRoutineReminder(
        { title: "Weekly", startsAtIso: start, recurrence: "weekly" },
        { identifier: "ops-routine-bad id" },
      ),
    ).resolves.toBe("error");
    await expect(
      scheduleRoutineReminder(
        { title: "Weekly", startsAtIso: start, recurrence: "weekly" },
        { identifier: `ops-routine-${"x".repeat(129)}` },
      ),
    ).resolves.toBe("error");

    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("one-shot reminders in the past or invalid dates surface error instead of never firing", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    expect(
      await scheduleRoutineReminder({ title: "x", startsAtIso: "2001-01-01T00:00:00.000Z" }),
    ).toBe("error");
    expect(await scheduleRoutineReminder({ title: "x", startsAtIso: "garbage" })).toBe("error");
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("future one-shot schedules a date trigger; channel failure does not block", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    setNotificationChannelAsync.mockRejectedValueOnce(new Error("ios"));
    scheduleNotificationAsync.mockResolvedValueOnce("id-3");
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(
      await scheduleRoutineReminder({ title: "Once", startsAtIso: future.toISOString() }),
    ).toBe("scheduled");
    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      identifier?: string;
      content: { title: string; body: string | null };
      trigger: { type: string };
    };
    const trigger = request.trigger;
    expect(trigger.type).toBe("date");
    expect(request.identifier).toBeUndefined();
    expect(request.content).toEqual({
      title: "2nd Brain",
      body: "Open the app to view your routine.",
    });
  });

  test("upgrade migration removes only non-stable recurring notifications and is one-time", async () => {
    setNavigatorProduct("ReactNative");
    getItem.mockResolvedValueOnce(null).mockResolvedValueOnce("1");
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: "4bdbe7f0-legacy", trigger: { type: "daily" } },
      { identifier: "legacy-calendar", trigger: { type: "calendar", repeats: true } },
      { identifier: "ops-routine-current-1", trigger: { type: "weekly" } },
      { identifier: "legacy-one-shot", trigger: { type: "date" } },
    ]);

    await migrateLegacyRoutineNotifications();
    await migrateLegacyRoutineNotifications();

    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([
      ["4bdbe7f0-legacy"],
      ["legacy-calendar"],
    ]);
    expect(setItem).toHaveBeenCalledWith("ops.notifications.privacyMigration.v1", "1");
    expect(getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  test("upgrade migration leaves no completion marker after a cancellation failure", async () => {
    setNavigatorProduct("ReactNative");
    getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "legacy-private-id", trigger: { type: "weekly" } },
    ]);
    cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("private identifier"));

    await expect(migrateLegacyRoutineNotifications()).rejects.toMatchObject({
      name: "NotificationPrivacyMigrationError",
      message: "Local notification privacy migration failed.",
      failureCount: 1,
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  test("account cleanup removes only the scheduled/delivered snapshot and all account-local keys", async () => {
    setNavigatorProduct("ReactNative");
    getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "ops-routine-a-1", trigger: { type: "daily" } },
      { identifier: "legacy-one-shot", trigger: { type: "date" } },
    ]);
    getPresentedNotificationsAsync.mockResolvedValueOnce([
      { request: { identifier: "presented-a-1" } },
    ]);

    await expect(clearAccountScopedLocalNotifications()).resolves.toBeUndefined();

    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([
      ["ops-routine-a-1"],
      ["legacy-one-shot"],
    ]);
    expect(dismissNotificationAsync).toHaveBeenCalledWith("presented-a-1");
    expect(clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
    expect(removeItem.mock.calls).toEqual(expect.arrayContaining([
      ["ops.reminders.disabled"],
      ["ops.dailyReview.enabled.v1"],
      ["ops.dailyReview.hour.v1"],
    ]));
  });

  test("account cleanup waits for every operation and throws only a sanitized aggregate", async () => {
    setNavigatorProduct("ReactNative");
    getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "private-scheduled-id", trigger: { type: "daily" } },
    ]);
    getPresentedNotificationsAsync.mockResolvedValueOnce([
      { request: { identifier: "private-delivered-id" } },
    ]);
    cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("private scheduled payload"));
    dismissNotificationAsync.mockRejectedValueOnce(new Error("private delivered payload"));
    removeItem.mockRejectedValueOnce(new Error("private routine ids"));

    const error = await clearAccountScopedLocalNotifications().catch((caught: unknown) => caught);

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(dismissNotificationAsync).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({
      name: "AccountScopedNotificationCleanupError",
      message: "Account-scoped local notification cleanup failed.",
      failureCount: 3,
    });
    expect(String(error)).not.toContain("private");
  });

  test("central sign-out finishes strict cleanup before calling Supabase", async () => {
    setNavigatorProduct("ReactNative");
    const events: string[] = [];
    getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "scheduled-a", trigger: { type: "daily" } },
    ]);
    getPresentedNotificationsAsync.mockResolvedValueOnce([
      { request: { identifier: "delivered-a" } },
    ]);
    cancelScheduledNotificationAsync.mockImplementationOnce(async () => { events.push("scheduled"); });
    dismissNotificationAsync.mockImplementationOnce(async () => { events.push("delivered"); });
    clearLastNotificationResponseAsync.mockImplementationOnce(async () => { events.push("response"); });
    removeItem.mockImplementation(async () => { events.push("state"); });
    supabaseSignOut.mockImplementationOnce(async () => {
      events.push("sign-out");
      return { error: null };
    });

    await expect(signOutWithCleanup()).resolves.toBeUndefined();

    expect(events.at(-1)).toBe("sign-out");
    expect(events.slice(0, -1)).toEqual(expect.arrayContaining([
      "scheduled",
      "delivered",
      "response",
      "state",
    ]));
  });

  test("central sign-out does not invalidate the session when strict cleanup fails", async () => {
    setNavigatorProduct("ReactNative");
    getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("native failure detail"));

    await expect(signOutWithCleanup()).rejects.toMatchObject({
      name: "AccountScopedNotificationCleanupError",
    });
    expect(supabaseSignOut).not.toHaveBeenCalled();
  });

  test("terminal deletion runtime performs one cleanup, then signs out the proven owner", async () => {
    setNavigatorProduct("ReactNative");
    const events: string[] = [];
    getAllScheduledNotificationsAsync.mockImplementationOnce(async () => {
      events.push("scheduled-snapshot");
      return [{ identifier: "account-a-reminder", trigger: { type: "daily" } }];
    });
    cancelScheduledNotificationAsync.mockImplementationOnce(async () => { events.push("scheduled-clear"); });
    clearLastNotificationResponseAsync.mockImplementationOnce(async () => { events.push("response-clear"); });
    removeItem.mockImplementation(async () => { events.push("state-clear"); });
    supabaseSignOut.mockImplementationOnce(async () => {
      events.push("sign-out");
      return { error: null };
    });

    await expect(finalizeDeletedAccountSession(
      "account-a",
      () => true,
      () => { events.push("receipt-armed"); },
    )).resolves.toBe("signed-out");

    expect(events.indexOf("receipt-armed")).toBeGreaterThan(events.lastIndexOf("state-clear"));
    expect(events.at(-1)).toBe("sign-out");
    expect(removeItem).toHaveBeenCalledTimes(3);
  });

  test("terminal deletion rechecks the owner after cleanup and never signs out account B", async () => {
    setNavigatorProduct("ReactNative");
    let currentOwner = true;
    getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "account-a-reminder", trigger: { type: "daily" } },
    ]);
    removeItem.mockImplementation(async (key) => {
      if (key === "ops.dailyReview.hour.v1") currentOwner = false;
    });
    const armReceipt = jest.fn();

    await expect(finalizeDeletedAccountSession(
      "account-a",
      () => currentOwner,
      armReceipt,
    )).resolves.toBe("owner-changed");

    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([["account-a-reminder"]]);
    expect(supabaseGetSession).toHaveBeenCalledTimes(1);
    expect(armReceipt).not.toHaveBeenCalled();
    expect(supabaseSignOut).not.toHaveBeenCalled();
  });

  test("terminal deletion publishes the receipt without a second sign-out when A is already gone", async () => {
    setNavigatorProduct("ReactNative");
    supabaseGetSession.mockResolvedValue({ data: { session: null }, error: null });
    const armReceipt = jest.fn();

    await expect(finalizeDeletedAccountSession(
      "account-a",
      () => true,
      armReceipt,
    )).resolves.toBe("already-signed-out");

    expect(armReceipt).toHaveBeenCalledTimes(1);
    expect(supabaseSignOut).not.toHaveBeenCalled();
  });

  test("account cleanup has a bounded failure instead of hanging sign-out forever", async () => {
    setNavigatorProduct("ReactNative");
    getAllScheduledNotificationsAsync.mockReturnValueOnce(new Promise(() => undefined));

    const error = await clearAccountScopedLocalNotifications({ timeoutMs: 5 })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: "AccountScopedNotificationCleanupError",
      message: "Account-scoped local notification cleanup failed.",
    });
  });

  test("native cleanup fails closed when the notification module cannot load; web skips it", async () => {
    setNavigatorProduct("ReactNative");
    jest.resetModules();
    jest.doMock("expo-notifications", () => {
      throw new Error("removed from Expo Go");
    });

    try {
      const unavailableReminders = require("../reminders") as typeof import("../reminders");
      expect(unavailableReminders.remindersSupported()).toBe(false);
      await expect(
        unavailableReminders.scheduleRoutineReminder({
          title: "x",
          startsAtIso: "2026-06-12T09:00:00.000Z",
        }),
      ).resolves.toBe("unavailable");
      await expect(unavailableReminders.clearAccountScopedLocalNotifications()).rejects.toMatchObject({
        name: "AccountScopedNotificationCleanupError",
        failureCount: 1,
      });
      expect(removeItem.mock.calls).toEqual(expect.arrayContaining([
        ["ops.reminders.disabled"],
        ["ops.dailyReview.enabled.v1"],
        ["ops.dailyReview.hour.v1"],
      ]));

      setNavigatorProduct("Gecko");
      await expect(unavailableReminders.clearAccountScopedLocalNotifications()).resolves.toBeUndefined();
      expect(requestPermissionsAsync).not.toHaveBeenCalled();
    } finally {
      jest.dontMock("expo-notifications");
      jest.resetModules();
    }
  });
});
