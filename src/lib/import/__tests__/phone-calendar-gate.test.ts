// Turning on the phone-calendar read is a policy step, not a code step (DECISIONS 26.10.02).
// While the gate is off, nothing in phone-calendar.ts may touch the SDK. It may only be on
// once the privacy policy (Korean and English), the iOS permission text and the
// calendar_import consent key all cover calendar reading.
import { readFileSync } from "node:fs";
import path from "node:path";

const sdkCalls = jest.fn();
jest.mock("expo-calendar", () => ({
  getCalendarPermissions: () => sdkCalls("getCalendarPermissions"),
  requestCalendarPermissions: () => sdkCalls("requestCalendarPermissions"),
  getCalendars: () => sdkCalls("getCalendars"),
  EntityTypes: { EVENT: "event" },
  EventStatus: { CANCELED: "canceled" },
}));

import { PRIVACY_PREF_KEYS } from "../../privacy/prefs";
import { PHONE_CALENDAR_READ_ENABLED } from "../phone-calendar-gate";
import { listPhoneCalendars, phoneCalendarStatus, readPhoneCalendar, requestPhoneCalendarAccess } from "../phone-calendar";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

interface Disclosure {
  policy: string;
  iosText: string;
  prefKeys: readonly string[];
}

/** What is still missing before the read may switch on. Empty means ready. */
function missingBeforeOn({ policy, iosText, prefKeys }: Disclosure): string[] {
  const missing: string[] = [];
  if (!/캘린더/.test(policy) || !/calendar/i.test(policy)) missing.push("privacy policy (ko + en) says nothing about the calendar");
  if (!iosText || /only to add/i.test(iosText)) missing.push("the iOS permission text still says the app only adds events");
  if (!prefKeys.includes("calendar_import")) missing.push("no calendar_import consent key");
  return missing;
}

function repoDisclosure(): Disclosure {
  const plugins = (JSON.parse(read("app.json")) as { expo: { plugins: unknown[] } }).expo.plugins;
  const calendarPlugin = plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-calendar") as
    | [string, { calendarPermission?: string }]
    | undefined;
  return {
    policy: read("docs/legal/privacy-policy.md"),
    iosText: String(calendarPlugin?.[1]?.calendarPermission ?? ""),
    prefKeys: PRIVACY_PREF_KEYS as readonly string[],
  };
}

test("the readiness check names each missing piece and passes only when all three are there", () => {
  const ready: Disclosure = {
    policy: "기기 캘린더 일정 ... device calendar events",
    iosText: "The app reads your calendar events to keep them in your records.",
    prefKeys: ["health_import", "calendar_import"],
  };
  expect(missingBeforeOn(ready)).toEqual([]);
  expect(missingBeforeOn({ ...ready, policy: "device calendar events" })).toHaveLength(1);
  expect(missingBeforeOn({ ...ready, iosText: "The app uses your calendar only to add routine items you approve on screen." })).toHaveLength(1);
  expect(missingBeforeOn({ ...ready, prefKeys: ["health_import"] })).toHaveLength(1);
});

test("the gate may be on only when the policy, the iOS text and the consent key cover calendar reading", () => {
  const missing = missingBeforeOn(repoDisclosure());
  if (PHONE_CALENDAR_READ_ENABLED) expect(missing).toEqual([]);
  // Today all three are missing, which is why the gate is off.
  else expect(missing).toContain("no calendar_import consent key");
});

(PHONE_CALENDAR_READ_ENABLED ? describe.skip : describe)("while the gate is off", () => {
  const originalNavigator = globalThis.navigator;
  beforeEach(() => {
    // A native runtime, so it is the gate and not the platform check that stops each call.
    Object.defineProperty(globalThis, "navigator", { value: { product: "ReactNative" }, configurable: true, writable: true });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
  });

  test("every entry point answers off and never touches the SDK", async () => {
    await expect(phoneCalendarStatus()).resolves.toBe("off");
    await expect(requestPhoneCalendarAccess()).resolves.toBe("off");
    await expect(listPhoneCalendars()).resolves.toBeNull();
    await expect(readPhoneCalendar({ start: new Date(0), end: new Date() })).resolves.toBeNull();
    expect(sdkCalls).not.toHaveBeenCalled();
  });
});
