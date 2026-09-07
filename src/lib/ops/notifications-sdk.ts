// expo-notifications access seam, NATIVE/DEFAULT side of the platform split.
// This is the ONLY place src/ requires expo-notifications; reminders.ts,
// daily-review.ts and the permissions screen all take the module from here.
//
// WHY A SEAM (audit D5-11): those modules used to hold their own
// try { require("expo-notifications") } at module or function scope. That
// keeps Expo Go from throwing, but Metro follows require() statically, so the
// SDK rode into the web entry where every caller no-ops anyway. Putting the
// require in one tiny module lets ./notifications-sdk.web.ts answer null on
// web with zero SDK reference, without duplicating the scheduling logic.
//
// Contract (same as the old inline guards): never throws; returns null when
// the module cannot be loaded (Expo Go SDK 53+ throws on require).

export type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

export function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require("expo-notifications") as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}
