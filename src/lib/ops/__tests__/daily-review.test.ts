const requestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const scheduleNotificationAsync = jest.fn<Promise<string>, [Record<string, unknown>]>();
const setNotificationChannelAsync = jest.fn<Promise<null>, [string, Record<string, unknown>]>();
const cancelScheduledNotificationAsync = jest.fn<Promise<void>, [string]>();

jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: () => requestPermissionsAsync(),
  scheduleNotificationAsync: (request: Record<string, unknown>) => scheduleNotificationAsync(request),
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) =>
    setNotificationChannelAsync(id, channel),
  cancelScheduledNotificationAsync: (id: string) => cancelScheduledNotificationAsync(id),
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));

import { cancelDailyReview, dailyReviewSupported, scheduleDailyReview } from "../daily-review";

const originalNavigator = globalThis.navigator;

function setNavigatorProduct(product: string | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: product === undefined ? undefined : { product },
    configurable: true,
    writable: true,
  });
}

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
    expect(await scheduleDailyReview(9, 0, "오늘의 정리")).toBe("unavailable");
    expect(await cancelDailyReview()).toBe("unavailable");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("denied permission short-circuits before any scheduling", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    expect(await scheduleDailyReview(9, 0, "오늘의 정리")).toBe("denied");
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("invalid wall-clock times surface error before requesting permission", async () => {
    setNavigatorProduct("ReactNative");
    expect(await scheduleDailyReview(24, 0, "x")).toBe("error");
    expect(await scheduleDailyReview(9, 60, "x")).toBe("error");
    expect(await scheduleDailyReview(-1, 0, "x")).toBe("error");
    expect(await scheduleDailyReview(9.5, 0, "x")).toBe("error");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test("schedules a DAILY trigger under a stable id, clearing any prior instance first", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    scheduleNotificationAsync.mockResolvedValueOnce("daily-review-reminder");
    expect(await scheduleDailyReview(8, 30, "오늘의 정리", "검토할 게 있어요")).toBe("scheduled");
    // prior instance cleared before re-scheduling (idempotent re-enable)
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("daily-review-reminder");
    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      identifier: string;
      content: { title: string; body: string | null };
      trigger: { type: string; hour: number; minute: number; channelId: string };
    };
    expect(request.identifier).toBe("daily-review-reminder");
    expect(request.content.title).toBe("오늘의 정리");
    expect(request.content.body).toBe("검토할 게 있어요");
    expect(request.trigger.type).toBe("daily");
    expect(request.trigger.hour).toBe(8);
    expect(request.trigger.minute).toBe(30);
    expect(request.trigger.channelId).toBe("daily-review");
    expect(setNotificationChannelAsync).toHaveBeenCalledWith(
      "daily-review",
      expect.objectContaining({ name: "Daily review" }),
    );
  });

  test("cancel removes exactly our reminder id", async () => {
    setNavigatorProduct("ReactNative");
    expect(await cancelDailyReview()).toBe("cancelled");
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("daily-review-reminder");
  });

  test("a scheduling failure surfaces error, not a thrown exception", async () => {
    setNavigatorProduct("ReactNative");
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    scheduleNotificationAsync.mockRejectedValueOnce(new Error("os"));
    expect(await scheduleDailyReview(9, 0, "오늘의 정리")).toBe("error");
  });
});
