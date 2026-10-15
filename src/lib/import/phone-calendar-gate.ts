// The one switch for reading the phone's calendar (phone-calendar.ts).
//
// Simon decided on 2026-10-02 (Q-261001-01 = B) that events read from the phone calendar are
// saved into the user's records and wiki. That cannot switch on in code alone:
//   - Android already declares READ_CALENDAR, and expo-calendar asks for read and write
//     together there, so the OS permission says nothing about what the user agreed to;
//   - an OTA update ships JS to builds that are already installed;
//   - the privacy policy, the consent text, the iOS permission text and the store forms do
//     not mention calendar reading yet (DECISIONS 26.10.02).
// So this stays false until all of them do. phone-calendar-gate.test.ts fails the build if it
// is turned on while the policy, the iOS text or the calendar_import consent key is missing.
export const PHONE_CALENDAR_READ_ENABLED: boolean = false;
