// Device-calendar hand-off (O-R3 P2). Opens the OS "new event" form prefilled
// via expo-calendar, so the user reviews and saves inside their OWN calendar
// app (Samsung/Google/Apple calendars all sit behind the device provider -
// this is the path that covers "the calendar app the user actually uses").
//
// Native-only: web keeps the ICS download + Google Calendar URL from P1.
// NOTE (G4): the module needs a native build - in Expo Go / current web
// deploys every entry point degrades to "unavailable" and the /ops screen
// simply doesn't render the button. No silent failures.

import type { OpsEventInput } from "./push";

type ExpoCalendarModule = typeof import("expo-calendar");
type CalendarRecurrenceRule = import("expo-calendar").RecurrenceRule;

let expoCalendarModule: ExpoCalendarModule | null | undefined;

function loadExpoCalendarModule(): ExpoCalendarModule | null {
  if (expoCalendarModule !== undefined) return expoCalendarModule;
  try {
    expoCalendarModule = require("expo-calendar") as ExpoCalendarModule;
  } catch {
    // Expo Go / web may not have this native module available.
    expoCalendarModule = null;
  }
  return expoCalendarModule;
}

export type DeviceCalendarResult =
  // "done" is Android's only answer (the OS doesn't say whether the user
  // saved or canceled the form) - treat it as a completed hand-off.
  | "saved"
  | "canceled"
  | "denied"
  | "unavailable"
  | "error";

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

/** True when the native module is present AND we're on a native runtime. */
export function deviceCalendarSupported(): boolean {
  if (!isReactNativeRuntime()) return false;
  const Calendar = loadExpoCalendarModule();
  if (!Calendar) return false;
  try {
    return (
      typeof Calendar.requestCalendarPermissions === "function" &&
      typeof Calendar.getDefaultCalendarSync === "function"
    );
  } catch {
    return false;
  }
}

function recurrenceFor(
  input: OpsEventInput,
  Calendar: ExpoCalendarModule,
): CalendarRecurrenceRule | undefined {
  if (input.recurrence === "daily") return { frequency: Calendar.Frequency.DAILY };
  if (input.recurrence === "weekly") return { frequency: Calendar.Frequency.WEEKLY };
  return undefined;
}

const DEFAULT_DURATION_MIN = 30;

/**
 * Opens the OS event form prefilled with the recommendation. Call ONLY behind
 * the standing-consent gate (privacy_prefs.ops_push), same as every push.
 */
export async function addEventToDeviceCalendar(input: OpsEventInput): Promise<DeviceCalendarResult> {
  if (!deviceCalendarSupported()) return "unavailable";
  const Calendar = loadExpoCalendarModule();
  if (!Calendar) return "unavailable";
  const start = new Date(input.startsAtIso);
  if (Number.isNaN(start.getTime())) return "error";
  const minutes =
    typeof input.durationMinutes === "number" && input.durationMinutes > 0
      ? Math.min(input.durationMinutes, 24 * 60)
      : DEFAULT_DURATION_MIN;
  const end = new Date(start.getTime() + minutes * 60_000);
  try {
    // writeOnly: iOS grants event creation without exposing existing
    // calendars/events - the narrowest permission that does the job.
    const permission = await Calendar.requestCalendarPermissions(true);
    if (!permission.granted) return "denied";
    const calendar = Calendar.getDefaultCalendarSync();
    const result = await calendar.addEventWithForm({
      title: input.title,
      notes: input.description,
      startDate: start,
      endDate: end,
      recurrenceRule: recurrenceFor(input, Calendar),
    });
    if (result.action === "canceled") return "canceled";
    return "saved";
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ops] device calendar hand-off failed", (e as Error).message);
    }
    return "error";
  }
}
