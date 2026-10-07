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
export const WEATHER_LOCATION_ENABLED: boolean = false;

// A disclosure's presence is necessary, not evidence that it has taken effect.
// The provider explicitly logs coordinates; never silently interpret the
// server-no-retention decision as applying only to our own database.
export const WEATHER_LOCATION_BLOCKERS: readonly string[] = [
  "MET Norway coordinate logs conflict with the no-server-retention condition; provider retention period unconfirmed",
  "weather addenda effective date, advance notice, full operator address and phone not finalized",
  "0232/0233 and weather Edge not deployed; infrastructure coordinate logging and execution countries unconfirmed",
];
