// expo-location access seam. This is the ONLY place src/ requires expo-location;
// weather-location.ts takes the module from here.
//
// Contract (same as ../ops/calendar-sdk.ts): never throws; memoizes the first answer;
// returns null when the module cannot be loaded. One file for every platform: on web
// expo-location answers through the browser's geolocation, which is what localhost
// shows (localhost and the app are the same software).

export type ExpoLocationModule = typeof import("expo-location");

let cached: ExpoLocationModule | null | undefined;

export function loadExpoLocation(): ExpoLocationModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require("expo-location") as ExpoLocationModule;
  } catch {
    cached = null;
  }
  return cached;
}
