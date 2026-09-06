// expo-calendar access seam, NATIVE/DEFAULT side of the platform split. This
// is the ONLY place src/ requires expo-calendar; device-calendar.ts takes the
// module from here.
//
// WHY A SEAM (audit D5-11): device-calendar.ts used to lazy-require the SDK
// itself. Metro follows require() statically, so the module rode into the web
// entry although the web path is the ICS download + Google Calendar URL and
// the device hand-off reports "unavailable" there. ./calendar-sdk.web.ts
// answers null on web with zero SDK reference.
//
// Contract (same as the old inline loader): never throws; memoizes the first
// answer; returns null when the module cannot be loaded (Expo Go / web).

export type ExpoCalendarModule = typeof import("expo-calendar");
// Re-exported so device-calendar.ts can name the rule type without referencing
// the SDK package itself (the guard forbids that outside this seam).
export type CalendarRecurrenceRule = import("expo-calendar").RecurrenceRule;

let cached: ExpoCalendarModule | null | undefined;

export function loadExpoCalendar(): ExpoCalendarModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require("expo-calendar") as ExpoCalendarModule;
  } catch {
    // Expo Go / web may not have this native module available.
    cached = null;
  }
  return cached;
}
