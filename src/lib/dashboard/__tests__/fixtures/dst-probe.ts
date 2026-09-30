// Run by refresh-cadence.test.ts in a child process with TZ=America/New_York.
// Jest cannot switch the time zone inside its sandbox, and Korea has no daylight-saving gap.
import { nextRefreshAt, shouldRefreshAfterResume } from "../../refresh-schedule";

// 2026-03-08 02:30 does not exist in New York (clocks jump from 02:00 to 03:00).
const settings = { enabled: true, intervalMinutes: 1440 as const, anchorTime: "02:30" };
const next = nextRefreshAt(new Date(2026, 2, 7, 10, 0), settings);
const gapHour = new Date(2026, 2, 8, 2, 30).getHours();
process.stdout.write(JSON.stringify({
  gapHour,
  nextDate: next ? next.getDate() : null,
  nextHour: next ? next.getHours() : null,
  resumes: shouldRefreshAfterResume(new Date(2026, 2, 7, 10, 0), new Date(2026, 2, 11, 8, 0), settings),
}));
