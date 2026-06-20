// Google Calendar IN-bound connector (personal-data import hub, G2). Fetches the
// user's upcoming primary-calendar events with an access token obtained via the
// GIS token model (src/lib/google/gisToken.ts) and serializes them to RFC 5545
// .ics text, so the EXISTING .ics import pipeline (src/lib/import/ics.ts ->
// proposals -> review -> ratify -> history) handles everything with ZERO new
// parse/propose surface. Read-only (calendar.readonly), on-device, no LLM (no
// C1/C3/C9), $0, no new dependency.
//
// The pure functions (parseGoogleEvents / the date helpers / googleEventsToIcs)
// are unit-tested and round-trip through parseIcs to prove pipeline compatibility.

export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const CALENDAR_EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const MAX_EVENTS = 250;

/** The subset of a Google Calendar API event we read. */
export interface GoogleEvent {
  summary: string;
  /** RFC3339 datetime when the event is timed. */
  startDateTime?: string;
  endDateTime?: string;
  /** YYYY-MM-DD when the event is all-day. */
  startDate?: string;
  endDate?: string;
}

/** Defensive parse of the Calendar API response (`{ items: [...] }`) → events. */
export function parseGoogleEvents(json: unknown): GoogleEvent[] {
  const items =
    json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items)
      ? (json as { items: unknown[] }).items
      : Array.isArray(json)
        ? (json as unknown[])
        : [];
  const out: GoogleEvent[] = [];
  for (const item of items) {
    if (out.length >= MAX_EVENTS) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.status === "cancelled") continue;
    const summary =
      typeof row.summary === "string" && row.summary.trim() ? row.summary.trim() : "(untitled)";
    const start = row.start && typeof row.start === "object" ? (row.start as Record<string, unknown>) : undefined;
    const end = row.end && typeof row.end === "object" ? (row.end as Record<string, unknown>) : undefined;
    const ev: GoogleEvent = { summary };
    if (start) {
      if (typeof start.dateTime === "string") ev.startDateTime = start.dateTime;
      else if (typeof start.date === "string") ev.startDate = start.date;
    }
    if (end) {
      if (typeof end.dateTime === "string") ev.endDateTime = end.dateTime;
      else if (typeof end.date === "string") ev.endDate = end.date;
    }
    // An event with no usable start can't become a calendar row — drop it.
    if (!ev.startDateTime && !ev.startDate) continue;
    out.push(ev);
  }
  return out;
}

/** RFC3339 timed datetime → ICS UTC compact "YYYYMMDDTHHMMSSZ", or null. */
export function rfc3339ToIcsUtc(value: string): string | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  // toISOString() -> "2026-06-21T06:00:00.000Z"; drop separators + milliseconds.
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** All-day "YYYY-MM-DD" → ICS date "YYYYMMDD", or null. */
export function dateToIcsDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** Escape ICS text per RFC 5545 (backslash, semicolon, comma, newline). */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Serialize events to a minimal RFC 5545 VCALENDAR. The output begins with
 * BEGIN:VCALENDAR so detectImportKind() routes it to the .ics parser, and every
 * field (SUMMARY / DTSTART / DTEND) is in a shape parseIcs() reads.
 */
export function googleEventsToIcs(events: ReadonlyArray<GoogleEvent>): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//2nd-Brain//Google Calendar import//EN"];
  for (const ev of events) {
    const allDay = !ev.startDateTime;
    const dtStart = ev.startDateTime ? rfc3339ToIcsUtc(ev.startDateTime) : ev.startDate ? dateToIcsDate(ev.startDate) : null;
    if (!dtStart) continue;
    const dtEnd = ev.endDateTime ? rfc3339ToIcsUtc(ev.endDateTime) : ev.endDate ? dateToIcsDate(ev.endDate) : null;
    lines.push("BEGIN:VEVENT");
    lines.push(`SUMMARY:${icsEscape(ev.summary)}`);
    lines.push(allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`);
    if (dtEnd) lines.push(allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export type CalendarFetchError = "no_token" | "fetch_failed" | "bad_response";

/**
 * Fetch upcoming primary-calendar events with a GIS access token. Network side
 * (not pure): the parse it delegates to (parseGoogleEvents) is the tested part.
 */
export async function fetchCalendarEvents(
  accessToken: string,
  opts: { signal?: AbortSignal; timeMinIso?: string; maxResults?: number } = {},
): Promise<GoogleEvent[]> {
  if (!accessToken) throw "no_token" as CalendarFetchError;
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(Math.max(1, opts.maxResults ?? 100), MAX_EVENTS)),
    timeMin: opts.timeMinIso ?? new Date().toISOString(),
  });
  let res: Response;
  try {
    res = await fetch(`${CALENDAR_EVENTS_ENDPOINT}?${params.toString()}`, {
      signal: opts.signal,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  } catch {
    throw "fetch_failed" as CalendarFetchError;
  }
  if (!res.ok) throw "fetch_failed" as CalendarFetchError;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw "bad_response" as CalendarFetchError;
  }
  return parseGoogleEvents(json);
}
