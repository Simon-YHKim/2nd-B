// The one switch for reading the phone's location for the clock-row weather (weather-location.ts).
//
// Simon chose GPS for the weather on 2026-10-07 (Q-261007-39 = A) and then dropped the
// legal-review step (DECISIONS 26.10.07 13:18): the Location Information Act asks for set
// steps, not a review. Those steps are what this waits for:
//   - the privacy policy (Korean and English) says the location is used for the weather;
//   - the terms carry the location-based service clause (art. 19);
//   - a location_weather consent key exists, and minors cannot switch it on (art. 25 and
//     the open minor-location question in CLAUDE.md);
//   - the iOS permission text says weather.
// The small-business notice (art. 9-2) is filed by Simon within a month of launch
// (REQ-261007-01, HANDOFF). weather-location.test.ts fails the build if this is turned on
// while any of the four is missing.
// Simon authorized private-use activation on 2026-10-08 and will supply the
// public effective date and telephone later. GPS stays on the device: every
// weather request downloads the same public NOAA/NWS station observations.
// Server availability, adult eligibility and committed opt-in still gate the SDK.
export const WEATHER_LOCATION_ENABLED: boolean = true;

// No device coordinates or selected station enter a request, so provider or
// infrastructure request logs cannot retain the device's weather location.
// Public-launch paperwork remains tracked separately in the weather handoff.
export const WEATHER_LOCATION_BLOCKERS: readonly string[] = [];
