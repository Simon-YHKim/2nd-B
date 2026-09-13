const requestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const getPermissionsAsync = jest.fn<Promise<{
  granted: boolean;
  status: string;
  canAskAgain: boolean;
}>, []>();
const scheduleNotificationAsync = jest.fn<Promise<string>, [Record<string, unknown>]>();
const setNotificationChannelAsync = jest.fn<Promise<null>, [string, Record<string, unknown>]>();
const getAllScheduledNotificationsAsync = jest.fn<Promise<Array<{
  identifier: string;
  trigger: Record<string, unknown>;
  content?: { data?: Record<string, unknown> };
}>>, []>();
const cancelScheduledNotificationAsync = jest.fn<Promise<void>, [string]>();
const getPresentedNotificationsAsync = jest.fn<Promise<Array<{
  request: { identifier: string; content?: { data?: Record<string, unknown> } };
}>>, []>();
const dismissNotificationAsync = jest.fn<Promise<void>, [string]>();
const clearLastNotificationResponseAsync = jest.fn<Promise<void>, []>();
const getLastNotificationResponse = jest.fn<
  { notification: { request: { identifier: string; content?: { data?: Record<string, unknown> } } } } | null,
  []
>();
const clearLastNotificationResponse = jest.fn<void, []>();
const getItem = jest.fn<Promise<string | null>, [string]>();
const setItem = jest.fn<Promise<void>, [string, string]>();
const removeItem = jest.fn<Promise<void>, [string]>();
const supabaseGetSession = jest.fn<Promise<{
  data: { session: { access_token: string; user: { id: string } } | null };
  error: Error | null;
}>, []>();
const supabaseSignOut = jest.fn<Promise<{ error: Error | null }>, [unknown?]>();
const supabaseSignIn = jest.fn<Promise<{
  data: { user: { id: string } | null };
  error: Error | null;
}>, [{ email: string; password: string }]>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
    removeItem: (key: string) => removeItem(key),
  },
}));

// The sign-out integration intentionally resolves the native auth adapter when
// navigator.product is ReactNative. Keep this suite at the storage boundary:
// SecureStore/Crypto have their own native adapter tests, while these assertions
// need the same observable backing calls as notification preference cleanup.
jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: () => ({
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
    removeItem: (key: string) => removeItem(key),
  }),
  migrateLegacyNativePlaintextAtStartup: async () => undefined,
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () => supabaseGetSession(),
      signOut: (options?: unknown) => supabaseSignOut(options),
      signInWithPassword: (credentials: { email: string; password: string }) =>
        supabaseSignIn(credentials),
    },
  }),
}));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => getPermissionsAsync(),
  requestPermissionsAsync: () => requestPermissionsAsync(),
  scheduleNotificationAsync: (request: Record<string, unknown>) => scheduleNotificationAsync(request),
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) =>
    setNotificationChannelAsync(id, channel),
  getAllScheduledNotificationsAsync: () => getAllScheduledNotificationsAsync(),
  cancelScheduledNotificationAsync: (id: string) => cancelScheduledNotificationAsync(id),
  getPresentedNotificationsAsync: () => getPresentedNotificationsAsync(),
  dismissNotificationAsync: (id: string) => dismissNotificationAsync(id),
  clearLastNotificationResponseAsync: () => clearLastNotificationResponseAsync(),
  getLastNotificationResponse: () => getLastNotificationResponse(),
  clearLastNotificationResponse: () => clearLastNotificationResponse(),
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));

import {
  clearAccountScopedLocalNotifications,
  disableReminder,
  enableReminder,
  foregroundNotificationBehavior,
  migrateLegacyRoutineNotifications,
  notifyNow,
  remindersSupported,
  routineReminderId,
  scheduleRoutineReminder,
} from "../reminders";
import {
  dailyReviewNotificationId,
  notificationPrivacyData,
  oneShotNotificationId,
} from "../notification-identity";
import {
  signOut as signOutWithCleanup,
} from "../../supabase/auth";
import {
  __resetAccountEpochForTests,
  beginAccountOwnerTransition,
  noteResolvedOwner,
} from "../../auth/account-epoch";

const originalNavigator = globalThis.navigator;
const LEGACY_NOTIFICATION_KEYS = [
  "ops.reminders.disabled",
  "ops.dailyReview.enabled.v1",
  "ops.dailyReview.hour.v1",
] as const;

function accessToken(userId: string, sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.signature`;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setNavigatorProduct(product: string | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: product === undefined ? undefined : { product },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  __resetAccountEpochForTests();
  noteResolvedOwner("account-a");
  getPermissionsAsync.mockResolvedValue({
    granted: true,
    status: "granted",
    canAskAgain: false,
  });
  getAllScheduledNotificationsAsync.mockResolvedValue([]);
  cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  getPresentedNotificationsAsync.mockResolvedValue([]);
  dismissNotificationAsync.mockResolvedValue(undefined);
  clearLastNotificationResponseAsync.mockResolvedValue(undefined);
  getLastNotificationResponse.mockReturnValue(null);
  getItem.mockResolvedValue(null);
  setItem.mockResolvedValue(undefined);
  removeItem.mockResolvedValue(undefined);
  supabaseGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: accessToken("account-a", "session-a"),
        user: { id: "account-a" },
      },
    },
    error: null,
  });
  supabaseSignOut.mockResolvedValue({ error: null });
  supabaseSignIn.mockResolvedValue({ data: { user: { id: "account-b" } }, error: null });
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
      await scheduleRoutineReminder(
        { title: "x", startsAtIso: "2026-06-12T09:00:00.000Z" },
        { ownerId: "account-a" },
      ),
    ).toBe("unavailable");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("denied permission short-circuits before any scheduling", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    expect(
      await scheduleRoutineReminder(
        { title: "x", startsAtIso: "2026-06-12T09:00:00.000Z" },
        { ownerId: "account-a" },
      ),
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
        {
          ownerId: "account-a",
          identifier: routineReminderId("account-a", "routine-1"),
        },
      ),
    ).toBe("scheduled");
    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      identifier: string;
      content: { title: string; body: string | null; data: Record<string, unknown> };
      trigger: { type: string; hour: number; minute: number; channelId: string };
    };
    expect(request.identifier).toBe(routineReminderId("account-a", "routine-1"));
    expect(request.content).toMatchObject({
      title: "2nd Brain",
      body: "Open the app to view your routine.",
      data: { _2bPrivacyGeneration: "notification-v2" },
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
      {
        ownerId: "account-a",
        identifier: routineReminderId("account-a", "routine-2"),
      },
    );
    const trigger = (scheduleNotificationAsync.mock.calls[0][0] as { trigger: { type: string; weekday: number } }).trigger;
    expect(trigger.type).toBe("weekly");
    expect(trigger.weekday).toBe(start.getDay() + 1);
  });

  test("focus completion one-shot is owner-marked and keeps personal labels off the lock screen", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    scheduleNotificationAsync.mockResolvedValueOnce("focus-id");

    await expect(notifyNow("account-a", "Private focus", "Private selected star"))
      .resolves.toBe("scheduled");

    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      identifier: string;
      content: { title: string; body: string; data: Record<string, unknown> };
    };
    expect(request.identifier).toMatch(/^ops-v2-[0-9a-f]{16}-once-/);
    expect(request.content).toMatchObject({
      title: "2nd Brain",
      body: "Open the app to view your completed timer.",
      data: { _2bPrivacyGeneration: "notification-v2" },
    });
    expect(JSON.stringify(request)).not.toContain("Private");
  });

  test("frozen legacy calls without an explicit owner fail closed", async () => {
    setNavigatorProduct("ReactNative");

    await expect(notifyNow("Legacy title", "Legacy body")).resolves.toBe("error");
    await expect(scheduleRoutineReminder({
      title: "Legacy routine",
      startsAtIso: new Date(Date.now() + 60_000).toISOString(),
    })).resolves.toBe("error");

    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("owner transition during permission wait prevents an immediate notification", async () => {
    setNavigatorProduct("ReactNative");
    const permission = deferred<{ granted: boolean }>();
    requestPermissionsAsync.mockReturnValueOnce(permission.promise);

    const pending = notifyNow("account-a", "Private focus", "Private selected star");
    await Promise.resolve();
    beginAccountOwnerTransition("account-b");
    permission.resolve({ granted: true });

    await expect(pending).resolves.toBe("error");
    expect(setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("owner transition during native routine scheduling compensates the stale A identifier", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    const scheduled = deferred<string>();
    scheduleNotificationAsync.mockReturnValueOnce(scheduled.promise);
    const identifier = routineReminderId("account-a", "routine-race");
    const pending = scheduleRoutineReminder({
      title: "Private routine",
      startsAtIso: new Date(Date.now() + 60_000).toISOString(),
      recurrence: "daily",
    }, { ownerId: "account-a", identifier });
    for (let turn = 0; turn < 10 && scheduleNotificationAsync.mock.calls.length === 0; turn += 1) {
      await Promise.resolve();
    }
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    beginAccountOwnerTransition("account-b");
    scheduled.resolve(identifier);

    await expect(pending).resolves.toBe("error");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(identifier);
  });

  test("a timed-out native schedule is cancelled when it eventually settles", async () => {
    jest.useFakeTimers();
    const scheduled = deferred<string>();
    const identifier = routineReminderId("account-a", "routine-timeout");
    try {
      setNavigatorProduct("ReactNative");
      requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
      scheduleNotificationAsync.mockReturnValueOnce(scheduled.promise);

      const pending = scheduleRoutineReminder({
        title: "Private routine",
        startsAtIso: new Date(Date.now() + 60_000).toISOString(),
        recurrence: "daily",
      }, { ownerId: "account-a", identifier });
      for (let turn = 0; turn < 10 && scheduleNotificationAsync.mock.calls.length === 0; turn += 1) {
        await Promise.resolve();
      }
      expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5_000);
      await expect(pending).resolves.toBe("error");
      scheduled.resolve(identifier);
      for (let turn = 0; turn < 10 && cancelScheduledNotificationAsync.mock.calls.length === 0; turn += 1) {
        await Promise.resolve();
      }
      expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(identifier);
    } finally {
      jest.useRealTimers();
    }
  });

  test("owner transition during permission lookup prevents enabling account A state", async () => {
    setNavigatorProduct("ReactNative");
    const permission = deferred<{
      granted: boolean;
      status: string;
      canAskAgain: boolean;
    }>();
    getPermissionsAsync.mockReturnValueOnce(permission.promise);

    const pending = enableReminder("account-a", "routine-race");
    await Promise.resolve();
    beginAccountOwnerTransition("account-b");
    permission.resolve({ granted: true, status: "granted", canAskAgain: false });

    await expect(pending).resolves.toBe(false);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("owner transition during disabled-state read prevents A writes and cancellation", async () => {
    setNavigatorProduct("ReactNative");
    const stored = deferred<string | null>();
    getItem.mockReturnValueOnce(stored.promise);

    const pending = disableReminder("account-a", "routine-race");
    await Promise.resolve();
    beginAccountOwnerTransition("account-b");
    stored.resolve(null);

    await expect(pending).resolves.toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  test("recurring reminders fail closed before permission without a validated stable id", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await expect(
      scheduleRoutineReminder(
        { title: "Daily", startsAtIso: start, recurrence: "daily" },
        { ownerId: "account-a" },
      ),
    ).resolves.toBe("error");
    await expect(
      scheduleRoutineReminder(
        { title: "Weekly", startsAtIso: start, recurrence: "weekly" },
        { ownerId: "account-a", identifier: "foreign-prefix-routine-1" },
      ),
    ).resolves.toBe("error");
    await expect(
      scheduleRoutineReminder(
        { title: "Weekly", startsAtIso: start, recurrence: "weekly" },
        { ownerId: "account-a", identifier: "ops-routine-bad id" },
      ),
    ).resolves.toBe("error");
    await expect(
      scheduleRoutineReminder(
        { title: "Weekly", startsAtIso: start, recurrence: "weekly" },
        { ownerId: "account-a", identifier: `ops-routine-${"x".repeat(129)}` },
      ),
    ).resolves.toBe("error");

    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("one-shot reminders in the past or invalid dates surface error instead of never firing", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    expect(
      await scheduleRoutineReminder(
        { title: "x", startsAtIso: "2001-01-01T00:00:00.000Z" },
        { ownerId: "account-a" },
      ),
    ).toBe("error");
    expect(await scheduleRoutineReminder(
      { title: "x", startsAtIso: "garbage" },
      { ownerId: "account-a" },
    )).toBe("error");
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("future one-shot schedules a date trigger; channel failure does not block", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    setNotificationChannelAsync.mockRejectedValueOnce(new Error("ios"));
    scheduleNotificationAsync.mockResolvedValueOnce("id-3");
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(
      await scheduleRoutineReminder(
        { title: "Once", startsAtIso: future.toISOString() },
        { ownerId: "account-a" },
      ),
    ).toBe("scheduled");
    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      identifier?: string;
      content: { title: string; body: string | null; data: Record<string, unknown> };
      trigger: { type: string };
    };
    const trigger = request.trigger;
    expect(trigger.type).toBe("date");
    expect(request.identifier).toMatch(/^ops-v2-[0-9a-f]{16}-once-/);
    expect(request.content).toMatchObject({
      title: "2nd Brain",
      body: "Open the app to view your routine.",
      data: { _2bPrivacyGeneration: "notification-v2" },
    });
  });

  test("upgrade migration removes every pre-v2 notification and is one-time", async () => {
    setNavigatorProduct("ReactNative");
    getItem.mockResolvedValueOnce(null).mockResolvedValueOnce("1");
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: "4bdbe7f0-legacy", trigger: { type: "daily" } },
      { identifier: "legacy-calendar", trigger: { type: "calendar", repeats: true } },
      { identifier: "ops-routine-old-stable", trigger: { type: "weekly" } },
      { identifier: "legacy-one-shot", trigger: { type: "date" } },
    ]);

    await migrateLegacyRoutineNotifications();
    await migrateLegacyRoutineNotifications();

    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([
      ["4bdbe7f0-legacy"],
      ["legacy-calendar"],
      ["ops-routine-old-stable"],
      ["legacy-one-shot"],
    ]);
    expect(setItem).toHaveBeenCalledWith("ops.notifications.privacyMigration.v2", "1");
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

    await expect(clearAccountScopedLocalNotifications("account-a")).resolves.toBeUndefined();

    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([
      ["ops-routine-a-1"],
      ["legacy-one-shot"],
    ]);
    expect(dismissNotificationAsync).toHaveBeenCalledWith("presented-a-1");
    expect(clearLastNotificationResponse).not.toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledTimes(6);
    const removedKeys = removeItem.mock.calls.map(([key]) => key);
    expect(removedKeys).toEqual(expect.arrayContaining(LEGACY_NOTIFICATION_KEYS));
    expect(removedKeys.filter((key) => key.includes("ops.account.v2."))).toHaveLength(3);
  });

  test("account cleanup removes web mirrors for every account-local key", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const removeWebItem = jest.fn<void, [string]>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { removeItem: removeWebItem },
    });

    try {
      await expect(clearAccountScopedLocalNotifications("account-a")).resolves.toBeUndefined();

      expect(removeWebItem).toHaveBeenCalledTimes(6);
      expect(removeWebItem.mock.calls.map(([key]) => key)).toEqual(
        removeItem.mock.calls.map(([key]) => key),
      );
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
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

    const error = await clearAccountScopedLocalNotifications("account-a").catch((caught: unknown) => caught);

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(dismissNotificationAsync).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledTimes(6);
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
    getLastNotificationResponse.mockReturnValueOnce({
      notification: { request: { identifier: "legacy-response" } },
    });
    clearLastNotificationResponse.mockImplementationOnce(() => { events.push("response"); });
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

  test("account cleanup has a bounded failure instead of hanging sign-out forever", async () => {
    setNavigatorProduct("ReactNative");
    getAllScheduledNotificationsAsync.mockReturnValueOnce(new Promise(() => undefined));

    const error = await clearAccountScopedLocalNotifications("account-a", { timeoutMs: 5 })
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
        }, { ownerId: "account-a" }),
      ).resolves.toBe("unavailable");
      await expect(unavailableReminders.clearAccountScopedLocalNotifications("account-a")).rejects.toMatchObject({
        name: "AccountScopedNotificationCleanupError",
        failureCount: 1,
      });
      expect(removeItem).toHaveBeenCalledTimes(6);
      const removedKeys = removeItem.mock.calls.map(([key]) => key);
      expect(removedKeys).toEqual(expect.arrayContaining(LEGACY_NOTIFICATION_KEYS));
      expect(removedKeys.filter((key) => key.includes("ops.account.v2."))).toHaveLength(3);

      setNavigatorProduct("Gecko");
      await expect(unavailableReminders.clearAccountScopedLocalNotifications("account-a")).resolves.toBeUndefined();
      expect(requestPermissionsAsync).not.toHaveBeenCalled();
    } finally {
      jest.dontMock("expo-notifications");
      jest.resetModules();
    }
  });

  test("v2 identifiers are generation-marked and account namespaced", () => {
    const accountA = routineReminderId("account-a", "routine-1");
    const accountB = routineReminderId("account-b", "routine-1");

    expect(accountA).toMatch(/^ops-v2-[0-9a-f]{16}-routine-routine-1$/);
    expect(accountB).toMatch(/^ops-v2-[0-9a-f]{16}-routine-routine-1$/);
    expect(accountA).not.toBe(accountB);
    expect(accountA).not.toContain("account-a");
  });

  test("privacy migration removes every pre-v2 scheduled and presented surface", async () => {
    setNavigatorProduct("ReactNative");
    const currentA = routineReminderId("account-a", "current");
    const currentB = routineReminderId("account-b", "current");
    const currentDaily = dailyReviewNotificationId("account-a");
    const currentOneShot = oneShotNotificationId("account-b");
    const prefixOnlyIsNotAContract = routineReminderId("account-c", "unmarked");
    getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "legacy-private-once", trigger: { type: "date" } },
      { identifier: "ops-routine-old-private", trigger: { type: "weekly" } },
      { identifier: prefixOnlyIsNotAContract, trigger: { type: "weekly" } },
      { identifier: currentA, trigger: { type: "weekly" }, content: { data: notificationPrivacyData("account-a") } },
      { identifier: currentDaily, trigger: { type: "daily" }, content: { data: notificationPrivacyData("account-a") } },
      { identifier: currentOneShot, trigger: { type: "date" }, content: { data: notificationPrivacyData("account-b") } },
    ]);
    getPresentedNotificationsAsync.mockResolvedValueOnce([
      { request: { identifier: "legacy-presented-private" } },
      { request: { identifier: currentB, content: { data: notificationPrivacyData("account-b") } } },
    ]);
    getLastNotificationResponse.mockReturnValueOnce({
      notification: { request: { identifier: "legacy-response-private" } },
    });

    await migrateLegacyRoutineNotifications();

    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([
      ["legacy-private-once"],
      ["ops-routine-old-private"],
      [prefixOnlyIsNotAContract],
    ]);
    expect(dismissNotificationAsync.mock.calls).toEqual([["legacy-presented-private"]]);
    expect(clearLastNotificationResponse).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith("ops.notifications.privacyMigration.v2", "1");
  });

  test("a timed-out A cleanup can finish late only against A namespaced targets", async () => {
    setNavigatorProduct("ReactNative");
    const accountAId = routineReminderId("account-a", "shared");
    const accountBId = routineReminderId("account-b", "shared");
    getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: accountAId, trigger: { type: "weekly" }, content: { data: notificationPrivacyData("account-a") } },
      { identifier: accountBId, trigger: { type: "weekly" }, content: { data: notificationPrivacyData("account-b") } },
    ]);
    getLastNotificationResponse.mockReturnValueOnce({
      notification: {
        request: { identifier: accountBId, content: { data: notificationPrivacyData("account-b") } },
      },
    });
    let releaseLateA: (() => void) | undefined;
    cancelScheduledNotificationAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseLateA = resolve;
    }));

    const error = await clearAccountScopedLocalNotifications("account-a", { timeoutMs: 5 })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ name: "AccountScopedNotificationCleanupError" });
    expect(cancelScheduledNotificationAsync.mock.calls).toEqual([[accountAId]]);
    expect(clearLastNotificationResponse).not.toHaveBeenCalled();
    const removedAKeys = removeItem.mock.calls.map(([key]) => key);
    expect(removedAKeys).toHaveLength(6);
    expect(removedAKeys).toEqual(expect.arrayContaining(LEGACY_NOTIFICATION_KEYS));
    expect(removedAKeys.filter((key) => key.includes(".v2."))).toHaveLength(3);
    expect(removedAKeys.every((key) => !key.includes("account-a"))).toBe(true);
    await expect(clearAccountScopedLocalNotifications("account-b", { timeoutMs: 20 }))
      .resolves.toBeUndefined();
    const removedBKeys = removeItem.mock.calls.slice(6).map(([key]) => key);
    expect(removedBKeys).toHaveLength(6);
    expect(removedBKeys).toEqual(expect.arrayContaining(LEGACY_NOTIFICATION_KEYS));
    const removedAV2Keys = removedAKeys.filter((key) => key.includes(".v2."));
    const removedBV2Keys = removedBKeys.filter((key) => key.includes(".v2."));
    expect(removedBV2Keys).toHaveLength(3);
    expect(removedBV2Keys.every((key) => !removedAV2Keys.includes(key))).toBe(true);
    releaseLateA?.();
    await Promise.resolve();
    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalledWith(accountBId);
  });
});
