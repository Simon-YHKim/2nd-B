// When a calendar event happens, as one short string. Kept apart from proposals.ts, which
// pulls in i18next and the locale files, so that a test can run it in a child process
// under another time zone: Jest cannot switch the zone inside its sandbox, and the all-day
// rule below only shows its effect where the offset is negative.
import type { CalendarEvent } from "./ics";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * When an event happens, written the same way in every language: "2026-10-02 14:00~15:00",
 * "2026-10-02 23:30~10-03 01:00", "2026-10-02" (all day) or "2026-10-02~10-04" (an all-day
 * span; its end date is exclusive). Timed events read in the device's local time. All-day
 * events are stored at UTC midnight (parseIcsDate, and Android's own calendar), so they read
 * in UTC or they would land a day early in a positive-offset zone. Null without a readable
 * start. A calendar import used to keep the title only, so a saved import said what but
 * never when, while the Google Calendar tile promised "titles + times".
 */
export function eventWhen(event: CalendarEvent): string | null {
  const start = event.startIso ? new Date(event.startIso) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const parsedEnd = event.endIso ? new Date(event.endIso) : null;
  const end = parsedEnd && parsedEnd.getTime() > start.getTime() ? parsedEnd : null;
  if (event.allDay) {
    const day = `${start.getUTCFullYear()}-${two(start.getUTCMonth() + 1)}-${two(start.getUTCDate())}`;
    const last = end ? new Date(end.getTime() - 86_400_000) : null;
    if (!last || last.getTime() <= start.getTime()) return day;
    return `${day}~${two(last.getUTCMonth() + 1)}-${two(last.getUTCDate())}`;
  }
  const at = `${start.getFullYear()}-${two(start.getMonth() + 1)}-${two(start.getDate())} ${two(start.getHours())}:${two(start.getMinutes())}`;
  if (!end) return at;
  const until = `${two(end.getHours())}:${two(end.getMinutes())}`;
  const sameDay =
    end.getFullYear() === start.getFullYear() && end.getMonth() === start.getMonth() && end.getDate() === start.getDate();
  return sameDay ? `${at}~${until}` : `${at}~${two(end.getMonth() + 1)}-${two(end.getDate())} ${until}`;
}
