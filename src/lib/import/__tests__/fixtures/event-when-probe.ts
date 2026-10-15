// Run by event-when-zone.test.ts in a child process with TZ=America/New_York. Jest cannot
// switch the time zone inside its sandbox, and in Korea (UTC+9) or on CI (UTC) a date read
// with local getters from a UTC midnight is still the same date, so the all-day rule only
// shows its effect where the offset is negative.
import { eventWhen } from "../../event-when";

const event = (startIso: string | null, endIso: string | null, allDay: boolean) => ({ title: "x", startIso, endIso, allDay });
process.stdout.write(JSON.stringify({
  // Control: proves the zone took effect (a UTC midnight is the evening before here).
  localDateOfUtcMidnight: new Date("2026-10-02T00:00:00.000Z").getDate(),
  allDay: eventWhen(event("2026-10-02T00:00:00.000Z", "2026-10-03T00:00:00.000Z", true)),
  allDaySpan: eventWhen(event("2026-10-02T00:00:00.000Z", "2026-10-05T00:00:00.000Z", true)),
  timed: eventWhen(event(new Date(2026, 9, 2, 14, 0).toISOString(), new Date(2026, 9, 2, 15, 30).toISOString(), false)),
}));
