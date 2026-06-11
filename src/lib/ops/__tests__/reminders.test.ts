const requestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const scheduleNotificationAsync = jest.fn<Promise<string>, [Record<string, unknown>]>();
const setNotificationChannelAsync = jest.fn<Promise<null>, [string, Record<string, unknown>]>();

jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: () => requestPermissionsAsync(),
  scheduleNotificationAsync: (request: Record<string, unknown>) => scheduleNotificationAsync(request),
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) =>
    setNotificationChannelAsync(id, channel),
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
  AndroidImportance: { DEFAULT: 3 },
}));

import { remindersSupported, scheduleRoutineReminder } from "../reminders";

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

describe("routine reminders (O-R3 P2, on-device only)", () => {
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
        title: "Evening reset",
        description: "Why.",
        startsAtIso: start.toISOString(),
        recurrence: "daily",
      }),
    ).toBe("scheduled");
    const request = scheduleNotificationAsync.mock.calls[0][0] as {
      content: { title: string };
      trigger: { type: string; hour: number; minute: number; channelId: string };
    };
    expect(request.content.title).toBe("Evening reset");
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
    await scheduleRoutineReminder({
      title: "Weekly review",
      startsAtIso: start.toISOString(),
      recurrence: "weekly",
    });
    const trigger = (scheduleNotificationAsync.mock.calls[0][0] as { trigger: { type: string; weekday: number } }).trigger;
    expect(trigger.type).toBe("weekly");
    expect(trigger.weekday).toBe(start.getDay() + 1);
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
    const trigger = (scheduleNotificationAsync.mock.calls[0][0] as { trigger: { type: string } }).trigger;
    expect(trigger.type).toBe("date");
  });
});
