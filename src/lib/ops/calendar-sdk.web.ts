// expo-calendar access seam, WEB side of the platform split -- fail-closed
// stub. The real require lives in ./calendar-sdk.ts; Metro resolves THIS file
// on web and ./calendar-sdk.ts on ios/android (and under tsc/jest).
//
// Web keeps the ICS download + Google Calendar URL path; the device hand-off
// already reported "unavailable" there, and this makes it true at bundle time
// (audit D5-11). Never reference expo-calendar here in any importable form --
// the type comes from the sibling via a type-only import (erased).

import type { ExpoCalendarModule } from "./calendar-sdk";

export type { ExpoCalendarModule } from "./calendar-sdk";

export function loadExpoCalendar(): ExpoCalendarModule | null {
  return null;
}
