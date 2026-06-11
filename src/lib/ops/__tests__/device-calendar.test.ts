const requestCalendarPermissions = jest.fn<Promise<{ granted: boolean }>, [boolean?]>();
const addEventWithForm = jest.fn<Promise<{ action: string }>, [Record<string, unknown>]>();
const getDefaultCalendarSync = jest.fn(() => ({ addEventWithForm }));

jest.mock("expo-calendar", () => ({
  requestCalendarPermissions: (...args: [boolean?]) => requestCalendarPermissions(...args),
  getDefaultCalendarSync: () => getDefaultCalendarSync(),
  Frequency: { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" },
}));

import { addEventToDeviceCalendar, deviceCalendarSupported } from "../device-calendar";

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

const EVENT = {
  title: "Evening reset",
  description: "Why it fits.",
  startsAtIso: "2026-06-12T21:00:00.000Z",
  durationMinutes: 20,
  recurrence: "daily" as const,
};

describe("device calendar hand-off (O-R3 P2)", () => {
  test("outside React Native everything reports unavailable without touching the module", async () => {
    setNavigatorProduct("Gecko");
    expect(deviceCalendarSupported()).toBe(false);
    expect(await addEventToDeviceCalendar(EVENT)).toBe("unavailable");
    expect(requestCalendarPermissions).not.toHaveBeenCalled();
  });

  test("denied permission short-circuits before any calendar access", async () => {
    setNavigatorProduct("ReactNative");
    requestCalendarPermissions.mockResolvedValueOnce({ granted: false });
    expect(await addEventToDeviceCalendar(EVENT)).toBe("denied");
    expect(getDefaultCalendarSync).not.toHaveBeenCalled();
    // iOS write-only scope: the narrowest permission that can create events.
    expect(requestCalendarPermissions).toHaveBeenCalledWith(true);
  });

  test("granted permission opens the prefilled OS form and maps the dialog result", async () => {
    setNavigatorProduct("ReactNative");
    requestCalendarPermissions.mockResolvedValue({ granted: true });
    addEventWithForm.mockResolvedValueOnce({ action: "saved" });
    expect(await addEventToDeviceCalendar(EVENT)).toBe("saved");
    const form = addEventWithForm.mock.calls[0][0];
    expect(form.title).toBe("Evening reset");
    expect(form.notes).toBe("Why it fits.");
    expect((form.startDate as Date).toISOString()).toBe("2026-06-12T21:00:00.000Z");
    expect((form.endDate as Date).toISOString()).toBe("2026-06-12T21:20:00.000Z");
    expect(form.recurrenceRule).toEqual({ frequency: "daily" });

    addEventWithForm.mockResolvedValueOnce({ action: "canceled" });
    expect(await addEventToDeviceCalendar(EVENT)).toBe("canceled");
    // Android always answers "done" - a completed hand-off counts as saved.
    addEventWithForm.mockResolvedValueOnce({ action: "done" });
    expect(await addEventToDeviceCalendar(EVENT)).toBe("saved");
  });

  test("invalid start date and thrown module errors degrade to error", async () => {
    setNavigatorProduct("ReactNative");
    expect(await addEventToDeviceCalendar({ ...EVENT, startsAtIso: "nope" })).toBe("error");
    requestCalendarPermissions.mockRejectedValueOnce(new Error("boom"));
    expect(await addEventToDeviceCalendar(EVENT)).toBe("error");
  });

  test("no recurrence and default duration fall through cleanly", async () => {
    setNavigatorProduct("ReactNative");
    requestCalendarPermissions.mockResolvedValue({ granted: true });
    addEventWithForm.mockResolvedValueOnce({ action: "done" });
    await addEventToDeviceCalendar({ title: "One-off", startsAtIso: "2026-06-12T21:00:00.000Z" });
    const form = addEventWithForm.mock.calls[0][0];
    expect(form.recurrenceRule).toBeUndefined();
    expect((form.endDate as Date).toISOString()).toBe("2026-06-12T21:30:00.000Z");
  });
});
