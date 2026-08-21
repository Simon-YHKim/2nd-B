// Jest mock for expo-localization (native ESM module, not transformed by ts-jest).
// Same reason as the expo-crypto mock next to this file.
//
// The default is a region-less locale, which is the case that matters most: it
// makes "the platform told us nothing" the DEFAULT in tests, so any code path
// that quietly assumes a country will fail here rather than in someone's hands.
// A test that wants a country sets it explicitly:
//
//   const loc = require("expo-localization");
//   loc.__setRegion("DE");
let region = null;

module.exports = {
  getLocales: () => [
    { languageTag: "en-US", languageCode: "en", regionCode: region, textDirection: "ltr" },
  ],
  getCalendars: () => [{ calendar: "gregory", timeZone: "UTC", uses24hourClock: true }],
  /** Test helper: set the region the next getLocales() call reports. */
  __setRegion: (value) => {
    region = value ?? null;
  },
};
