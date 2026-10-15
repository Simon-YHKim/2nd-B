// The phone-calendar reader with the gate switched on. The real gate is false, and
// phone-calendar-gate.test.ts covers that state.
const getPermissions = jest.fn();
const requestPermissions = jest.fn();
const getCalendars = jest.fn();

jest.mock("expo-calendar", () => ({
  getCalendarPermissions: (writeOnly?: boolean) => getPermissions(writeOnly),
  requestCalendarPermissions: (writeOnly?: boolean) => requestPermissions(writeOnly),
  getCalendars: (entityType?: string) => getCalendars(entityType),
  EntityTypes: { EVENT: "event", REMINDER: "reminder" },
  EventStatus: { NONE: "none", CONFIRMED: "confirmed", TENTATIVE: "tentative", CANCELED: "canceled" },
}));
jest.mock("../phone-calendar-gate", () => ({ PHONE_CALENDAR_READ_ENABLED: true }));

import {
  PHONE_CALENDAR_EVENT_CAP,
  listPhoneCalendars,
  phoneCalendarStatus,
  readPhoneCalendar,
  requestPhoneCalendarAccess,
} from "../phone-calendar";

const originalNavigator = globalThis.navigator;
function setProduct(product: string): void {
  Object.defineProperty(globalThis, "navigator", { value: { product }, configurable: true, writable: true });
}

function calendar(id: string, events: unknown[] | Error, isVisible = true) {
  return {
    id,
    title: `Calendar ${id}`,
    isVisible,
    listEvents: jest.fn(async () => {
      if (events instanceof Error) throw events;
      return events;
    }),
  };
}

const range = { start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-03T00:00:00.000Z") };

beforeEach(() => {
  setProduct("ReactNative");
  getPermissions.mockResolvedValue({ granted: true, status: "granted", canAskAgain: true });
  requestPermissions.mockResolvedValue({ granted: true, status: "granted", canAskAgain: true });
  getCalendars.mockResolvedValue([]);
});
afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
  jest.clearAllMocks();
});

test("checking the status never shows a prompt, and asks for full (read) access", async () => {
  await expect(phoneCalendarStatus()).resolves.toBe("granted");
  expect(getPermissions).toHaveBeenCalledWith(undefined);
  expect(requestPermissions).not.toHaveBeenCalled();
});

test("status maps the OS answer: undetermined, blocked for good, or unavailable when it throws", async () => {
  getPermissions.mockResolvedValueOnce({ granted: false, status: "undetermined", canAskAgain: true });
  await expect(phoneCalendarStatus()).resolves.toBe("undetermined");
  getPermissions.mockResolvedValueOnce({ granted: false, status: "denied", canAskAgain: false });
  await expect(phoneCalendarStatus()).resolves.toBe("blocked");
  // Android merges read and write: write alone comes back as undetermined, not granted.
  getPermissions.mockResolvedValueOnce({ granted: false, status: "undetermined", canAskAgain: true });
  await expect(phoneCalendarStatus()).resolves.toBe("undetermined");
  getPermissions.mockRejectedValueOnce(new Error("Expo Go"));
  await expect(phoneCalendarStatus()).resolves.toBe("unavailable");
});

test("only the explicit request asks the OS", async () => {
  await expect(requestPhoneCalendarAccess()).resolves.toBe("granted");
  expect(requestPermissions).toHaveBeenCalledTimes(1);
  expect(requestPermissions).toHaveBeenCalledWith(undefined);
});

test("reading without access returns null and never asks", async () => {
  getPermissions.mockResolvedValue({ granted: false, status: "undetermined", canAskAgain: true });
  await expect(readPhoneCalendar(range)).resolves.toBeNull();
  await expect(listPhoneCalendars()).resolves.toBeNull();
  expect(requestPermissions).not.toHaveBeenCalled();
  expect(getCalendars).not.toHaveBeenCalled();
});

test("keeps title, start, end and all-day only, drops canceled and untitled events, oldest first", async () => {
  const work = calendar("work", [
    { title: "Review", startDate: "2026-10-02T05:00:00.000Z", endDate: "2026-10-02T06:00:00.000Z", allDay: false, status: "confirmed", notes: "secret", location: "Room 4", organizerEmail: "boss@example.com" },
    { title: "Canceled", startDate: "2026-10-01T05:00:00.000Z", endDate: "2026-10-01T06:00:00.000Z", allDay: false, status: "canceled" },
    { title: "  ", startDate: "2026-10-01T07:00:00.000Z", allDay: false, status: "confirmed" },
  ]);
  const home = calendar("home", [
    { title: "Holiday", startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: "2026-10-02T00:00:00.000Z", allDay: true, status: "confirmed" },
  ]);
  getCalendars.mockResolvedValue([work, home]);
  const read = await readPhoneCalendar(range);
  expect(read).toEqual({
    complete: true,
    events: [
      { title: "Holiday", startIso: "2026-10-01T00:00:00.000Z", endIso: "2026-10-02T00:00:00.000Z", allDay: true },
      { title: "Review", startIso: "2026-10-02T05:00:00.000Z", endIso: "2026-10-02T06:00:00.000Z", allDay: false },
    ],
  });
  expect(getCalendars).toHaveBeenCalledWith("event");
  expect(work.listEvents).toHaveBeenCalledWith(range.start, range.end);
});

test("hidden calendars are skipped, chosen calendars narrow the read, and the picker lists the visible ones", async () => {
  const shown = calendar("shown", [{ title: "A", startDate: "2026-10-02T01:00:00.000Z", allDay: false }]);
  const other = calendar("other", [{ title: "B", startDate: "2026-10-02T02:00:00.000Z", allDay: false }]);
  const hidden = calendar("hidden", [{ title: "C", startDate: "2026-10-02T03:00:00.000Z", allDay: false }], false);
  getCalendars.mockResolvedValue([shown, other, hidden]);
  expect((await readPhoneCalendar(range))?.events.map((e) => e.title)).toEqual(["A", "B"]);
  expect((await readPhoneCalendar(range, ["other"]))?.events.map((e) => e.title)).toEqual(["B"]);
  expect(hidden.listEvents).not.toHaveBeenCalled();
  await expect(listPhoneCalendars()).resolves.toEqual([
    { id: "shown", title: "Calendar shown" },
    { id: "other", title: "Calendar other" },
  ]);
});

test("a calendar that fails keeps the others and marks the read incomplete; so does the cap", async () => {
  getCalendars.mockResolvedValue([
    calendar("broken", new Error("provider")),
    calendar("fine", [{ title: "Kept", startDate: "2026-10-02T01:00:00.000Z", allDay: false }]),
  ]);
  await expect(readPhoneCalendar(range)).resolves.toEqual({
    complete: false,
    events: [{ title: "Kept", startIso: "2026-10-02T01:00:00.000Z", endIso: null, allDay: false }],
  });
  const many = Array.from({ length: PHONE_CALENDAR_EVENT_CAP + 1 }, (_, i) => ({
    title: `E${i}`,
    startDate: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    allDay: false,
  }));
  getCalendars.mockResolvedValue([calendar("busy", many)]);
  const capped = await readPhoneCalendar(range);
  expect(capped?.complete).toBe(false);
  expect(capped?.events).toHaveLength(PHONE_CALENDAR_EVENT_CAP);
});

test("off the React Native runtime (web, jest default) nothing is available", async () => {
  setProduct("Gecko");
  await expect(phoneCalendarStatus()).resolves.toBe("unavailable");
  await expect(readPhoneCalendar(range)).resolves.toBeNull();
  expect(getPermissions).not.toHaveBeenCalled();
});
