// Push builders (O-R3 P1): turn an accepted recommendation into something the
// user's own calendar/todo apps can open TODAY, with no OAuth and no new
// dependency. Pure + tested; the /ops screen stays a thin consumer.
//
//   - buildIcsEvent          → RFC 5545 text (web: downloaded .ics opens in
//                              the default calendar app on every platform)
//   - buildGoogleCalendarUrl → calendar.google.com prefilled-event deep link
//                              (works signed-in on web AND opens the Google
//                              Calendar app on Android/iOS via Linking)
//   - buildChecklistShareText→ plain-text checklist for the OS share sheet
//                              (every todo/notes app accepts shared text)

export interface OpsEventInput {
  title: string;
  description?: string;
  /** ISO 8601 start (with timezone or Z). Invalid input → builders return null. */
  startsAtIso: string;
  durationMinutes?: number;
  recurrence?: "daily" | "weekly";
}

const DEFAULT_DURATION_MIN = 30;

function toUtcBasic(date: Date): string {
  // 20260611T093000Z - the RFC 5545 / Google template UTC basic format.
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseStart(input: OpsEventInput): { start: Date; end: Date } | null {
  const start = new Date(input.startsAtIso);
  if (Number.isNaN(start.getTime())) return null;
  const minutes =
    typeof input.durationMinutes === "number" && input.durationMinutes > 0
      ? Math.min(input.durationMinutes, 24 * 60)
      : DEFAULT_DURATION_MIN;
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

function rrule(recurrence: OpsEventInput["recurrence"]): string | null {
  if (recurrence === "daily") return "FREQ=DAILY";
  if (recurrence === "weekly") return "FREQ=WEEKLY";
  return null;
}

// RFC 5545 TEXT escaping: backslash first, then structural characters.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Builds a single-event VCALENDAR. Returns null when the start date is invalid. */
export function buildIcsEvent(input: OpsEventInput, now: Date = new Date()): string | null {
  const range = parseStart(input);
  if (!range) return null;
  const title = input.title.trim();
  if (title.length === 0) return null;
  const stamp = toUtcBasic(now);
  // Deterministic enough for a hand-off file: stamp + start + title length.
  const uid = `ops-${toUtcBasic(range.start)}-${title.length}@2nd-brain`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//2nd-Brain//ops//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toUtcBasic(range.start)}`,
    `DTEND:${toUtcBasic(range.end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  const description = input.description?.trim();
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  const rule = rrule(input.recurrence);
  if (rule) lines.push(`RRULE:${rule}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Prefilled Google Calendar event URL. Returns null when the start is invalid. */
export function buildGoogleCalendarUrl(input: OpsEventInput): string | null {
  const range = parseStart(input);
  if (!range) return null;
  const title = input.title.trim();
  if (title.length === 0) return null;
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", title);
  params.set("dates", `${toUtcBasic(range.start)}/${toUtcBasic(range.end)}`);
  const description = input.description?.trim();
  if (description) params.set("details", description);
  const rule = rrule(input.recurrence);
  if (rule) params.set("recur", `RRULE:${rule}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Plain-text checklist for the OS share sheet (todo/notes apps take text). */
export function buildChecklistShareText(title: string, items: readonly string[]): string {
  const head = title.trim();
  const body = items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => `- [ ] ${item}`)
    .join("\n");
  return body.length > 0 ? `${head}\n\n${body}` : head;
}
