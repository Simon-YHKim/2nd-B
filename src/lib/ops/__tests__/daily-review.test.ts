const requestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const scheduleNotificationAsync = jest.fn<Promise<string>, [Record<string, unknown>]>();
const setNotificationChannelAsync = jest.fn<Promise<null>, [string, Record<string, unknown>]>();
const cancelScheduledNotificationAsync = jest.fn<Promise<void>, [string]>();
const nativeSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: () => requestPermissionsAsync(),
  scheduleNotificationAsync: (request: Record<string, unknown>) => scheduleNotificationAsync(request),
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) =>
    setNotificationChannelAsync(id, channel),
  cancelScheduledNotificationAsync: (id: string) => cancelScheduledNotificationAsync(id),
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: (key: string, value: string) => nativeSetItem(key, value),
  },
}));

import {
  cancelDailyReview,
  dailyReviewSupported,
  scheduleDailyReview,
  setDailyReviewEnabledPref,
} from "../daily-review";
import { dailyReviewNotificationId } from "../notification-identity";
import {
  __resetAccountEpochForTests,
  beginAccountOwnerTransition,
  noteResolvedOwner,
} from "../../auth/account-epoch";

const OWNER = "account-a";

const originalNavigator = globalThis.navigator;

function setNavigatorProduct(product: string | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: product === undefined ? undefined : { product },
    configurable: true,
    writable: true,
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  __resetAccountEpochForTests();
  noteResolvedOwner(OWNER);
  nativeSetItem.mockReset();
  nativeSetItem.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
  jest.clearAllMocks();
});

describe("daily-review reminder (opt-in, on-device only)", () => {
  test("outside React Native reports unavailable without touching the module", async () => {
    setNavigatorProduct("Gecko");
    expect(dailyReviewSupported()).toBe(false);
    expect(await scheduleDailyReview(OWNER, 9, 0, "오늘의 정리")).toBe("unavailable");
    expect(await cancelDailyReview(OWNER)).toBe("unavailable");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("denied permission short-circuits before any scheduling", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    expect(await scheduleDailyReview(OWNER, 9, 0, "오늘의 정리")).toBe("denied");
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("invalid wall-clock times surface error before requesting permission", async () => {
    setNavigatorProduct("ReactNative");
    expect(await scheduleDailyReview(OWNER, 24, 0, "x")).toBe("error");
    expect(await scheduleDailyReview(OWNER, 9, 60, "x")).toBe("error");
    expect(await scheduleDailyReview(OWNER, -1, 0, "x")).toBe("error");
    expect(await scheduleDailyReview(OWNER, 9.5, 0, "x")).toBe("error");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("schedules a DAILY trigger under a stable id, clearing any prior instance first", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    const identifier = dailyReviewNotificationId(OWNER);
    scheduleNotificationAsync.mockResolvedValueOnce(identifier);
    expect(await scheduleDailyReview(OWNER, 8, 30, "오늘의 정리", "검토할 게 있어요")).toBe("scheduled");
    // prior instance cleared before re-scheduling (idempotent re-enable)
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(identifier);
    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      identifier: string;
      content: { title: string; body: string | null; data: Record<string, unknown> };
      trigger: { type: string; hour: number; minute: number; channelId: string };
    };
    expect(request.identifier).toBe(identifier);
    expect(request.content.title).toBe("오늘의 정리");
    expect(request.content.body).toBe("검토할 게 있어요");
    expect(request.content.data).toMatchObject({ _2bPrivacyGeneration: "notification-v2" });
    expect(request.trigger.type).toBe("daily");
    expect(request.trigger.hour).toBe(8);
    expect(request.trigger.minute).toBe(30);
    expect(request.trigger.channelId).toBe("daily-review");
    expect(setNotificationChannelAsync).toHaveBeenCalledWith(
      "daily-review",
      expect.objectContaining({ name: "Daily review" }),
    );
  });

  test("owner transition during permission wait prevents daily-review mutation", async () => {
    setNavigatorProduct("ReactNative");
    const permission = deferred<{ granted: boolean }>();
    requestPermissionsAsync.mockReturnValueOnce(permission.promise);

    const pending = scheduleDailyReview(OWNER, 8, 30, "오늘의 정리");
    await Promise.resolve();
    beginAccountOwnerTransition("account-b");
    permission.resolve({ granted: true });

    await expect(pending).resolves.toBe("error");
    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("owner transition during native daily scheduling compensates the stale A identifier", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    const scheduled = deferred<string>();
    scheduleNotificationAsync.mockReturnValueOnce(scheduled.promise);
    const identifier = dailyReviewNotificationId(OWNER);
    const pending = scheduleDailyReview(OWNER, 8, 30, "오늘의 정리");
    for (let turn = 0; turn < 10 && scheduleNotificationAsync.mock.calls.length === 0; turn += 1) {
      await Promise.resolve();
    }
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    beginAccountOwnerTransition("account-b");
    scheduled.resolve(identifier);

    await expect(pending).resolves.toBe("error");
    expect(cancelScheduledNotificationAsync).toHaveBeenLastCalledWith(identifier);
  });

  test("a timed-out daily schedule is cancelled after late native completion", async () => {
    jest.useFakeTimers();
    const scheduled = deferred<string>();
    const identifier = dailyReviewNotificationId(OWNER);
    try {
      setNavigatorProduct("ReactNative");
      requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
      scheduleNotificationAsync.mockReturnValueOnce(scheduled.promise);

      const pending = scheduleDailyReview(OWNER, 8, 30, "오늘의 정리");
      for (let turn = 0; turn < 10 && scheduleNotificationAsync.mock.calls.length === 0; turn += 1) {
        await Promise.resolve();
      }
      expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5_000);
      await expect(pending).resolves.toBe("error");
      scheduled.resolve(identifier);
      for (let turn = 0; turn < 10 && cancelScheduledNotificationAsync.mock.calls.length < 2; turn += 1) {
        await Promise.resolve();
      }
      expect(cancelScheduledNotificationAsync.mock.calls).toEqual([
        [identifier],
        [identifier],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("daily preference writes reject a held owner before touching native storage", async () => {
    setNavigatorProduct("ReactNative");
    beginAccountOwnerTransition("account-b");

    await expect(Promise.resolve(setDailyReviewEnabledPref(OWNER, true))).resolves.toBe(false);
    expect(nativeSetItem).not.toHaveBeenCalled();
  });

  test("daily preference write reports stale when the owner changes during storage", async () => {
    setNavigatorProduct("ReactNative");
    const write = deferred<void>();
    nativeSetItem.mockReturnValueOnce(write.promise);

    const pending = Promise.resolve(setDailyReviewEnabledPref(OWNER, true));
    for (let turn = 0; turn < 10 && nativeSetItem.mock.calls.length === 0; turn += 1) {
      await Promise.resolve();
    }
    expect(nativeSetItem).toHaveBeenCalledTimes(1);
    beginAccountOwnerTransition("account-b");
    write.resolve(undefined);

    await expect(pending).resolves.toBe(false);
  });

  test("cancel removes exactly our reminder id", async () => {
    setNavigatorProduct("ReactNative");
    expect(await cancelDailyReview(OWNER)).toBe("cancelled");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(dailyReviewNotificationId(OWNER));
  });

  test("a scheduling failure surfaces error, not a thrown exception", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    scheduleNotificationAsync.mockRejectedValueOnce(new Error("os"));
    expect(await scheduleDailyReview(OWNER, 9, 0, "오늘의 정리")).toBe("error");
  });
});
