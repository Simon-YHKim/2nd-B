import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const requestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const scheduleNotificationAsync = jest.fn<Promise<string>, [Record<string, unknown>]>();
const setNotificationChannelAsync = jest.fn<Promise<null>, [string, Record<string, unknown>]>();
const cancelAllScheduledNotificationsAsync = jest.fn<Promise<void>, []>();
const dismissAllNotificationsAsync = jest.fn<Promise<void>, []>();
const removeItem = jest.fn<Promise<void>, [string]>();
const supabaseSignOut = jest.fn<Promise<{ error: Error | null }>, []>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: (key: string) => removeItem(key),
  },
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { signOut: () => supabaseSignOut() } }),
}));

jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: () => requestPermissionsAsync(),
  scheduleNotificationAsync: (request: Record<string, unknown>) => scheduleNotificationAsync(request),
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) =>
    setNotificationChannelAsync(id, channel),
  cancelAllScheduledNotificationsAsync: () => cancelAllScheduledNotificationsAsync(),
  dismissAllNotificationsAsync: () => dismissAllNotificationsAsync(),
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));

import {
  clearAccountScopedLocalNotifications,
  foregroundNotificationBehavior,
  remindersSupported,
  scheduleRoutineReminder,
} from "../reminders";
import { signOut as signOutWithCleanup } from "../../supabase/auth";

const originalNavigator = globalThis.navigator;
const accountSource = readFileSync(resolve(process.cwd(), "src/app/account.tsx"), "utf8");
const deepSpaceSource = readFileSync(
  resolve(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
  "utf8",
);

function setNavigatorProduct(product: string | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: product === undefined ? undefined : { product },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  cancelAllScheduledNotificationsAsync.mockResolvedValue(undefined);
  dismissAllNotificationsAsync.mockResolvedValue(undefined);
  removeItem.mockResolvedValue(undefined);
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
      await scheduleRoutineReminder({
        title: "Private routine title",
        description: "Private reason with personal details.",
        startsAtIso: start.toISOString(),
        recurrence: "daily",
      }, { identifier: "ops-routine-routine-1" }),
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

  test("account cleanup attempts scheduled, delivered, and local-state cleanup", async () => {
    await expect(clearAccountScopedLocalNotifications()).resolves.toBeUndefined();

    expect(cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith("ops.reminders.disabled");
  });

  test("account cleanup waits for every operation and throws only a sanitized aggregate", async () => {
    cancelAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("private scheduled payload"));
    dismissAllNotificationsAsync.mockRejectedValueOnce(new Error("private delivered payload"));
    removeItem.mockRejectedValueOnce(new Error("private routine ids"));

    const error = await clearAccountScopedLocalNotifications().catch((caught: unknown) => caught);

    expect(cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      name: "AccountScopedNotificationCleanupError",
      message: "Account-scoped local notification cleanup failed.",
      failureCount: 3,
    });
    expect(String(error)).not.toContain("private");
  });

  test("central sign-out finishes strict cleanup before calling Supabase", async () => {
    const events: string[] = [];
    cancelAllScheduledNotificationsAsync.mockImplementationOnce(async () => { events.push("scheduled"); });
    dismissAllNotificationsAsync.mockImplementationOnce(async () => { events.push("delivered"); });
    removeItem.mockImplementationOnce(async () => { events.push("state"); });
    supabaseSignOut.mockImplementationOnce(async () => {
      events.push("sign-out");
      return { error: null };
    });

    await expect(signOutWithCleanup()).resolves.toBeUndefined();

    expect(new Set(events.slice(0, 3))).toEqual(new Set(["scheduled", "delivered", "state"]));
    expect(events[3]).toBe("sign-out");
  });

  test("central sign-out does not invalidate the session when strict cleanup fails", async () => {
    cancelAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("native failure detail"));

    await expect(signOutWithCleanup()).rejects.toMatchObject({
      name: "AccountScopedNotificationCleanupError",
    });
    expect(supabaseSignOut).not.toHaveBeenCalled();
  });

  test("both terminal deletion screens attempt cleanup separately before sign-out and navigation", () => {
    for (const source of [accountSource, deepSpaceSource]) {
      const deletion = source.indexOf("await requestAccountDeletion()");
      const cleanup = source.indexOf("await clearAccountScopedLocalNotifications()", deletion);
      const signOut = source.indexOf("await signOut()", cleanup);
      const redirect = source.indexOf('router.replace("/sign-in")', signOut);

      expect(deletion).toBeGreaterThan(-1);
      expect(cleanup).toBeGreaterThan(deletion);
      expect(signOut).toBeGreaterThan(cleanup);
      expect(redirect).toBeGreaterThan(signOut);
      expect(source.slice(cleanup, signOut)).toContain("notification cleanup after deletion failed");
    }
  });

  test("DeepSpace schedules a saved routine under the persisted routine id", () => {
    const persisted = deepSpaceSource.indexOf("const routine = await createRoutineFromRecommendation");
    const scheduled = deepSpaceSource.indexOf("await scheduleRoutineReminder", persisted);
    const stableId = deepSpaceSource.indexOf("identifier: routineReminderId(routine.id)", scheduled);

    expect(persisted).toBeGreaterThan(-1);
    expect(scheduled).toBeGreaterThan(persisted);
    expect(stableId).toBeGreaterThan(scheduled);
  });

  test("native cleanup fails closed when the notifications module cannot be loaded; web skips it", async () => {
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
      expect(removeItem).toHaveBeenCalledWith("ops.reminders.disabled");

      setNavigatorProduct("Gecko");
      await expect(unavailableReminders.clearAccountScopedLocalNotifications()).resolves.toBeUndefined();
      expect(requestPermissionsAsync).not.toHaveBeenCalled();
    } finally {
      jest.dontMock("expo-notifications");
      jest.resetModules();
    }
  });
});
