// iCalendar (.ics) import parser (personal-data import, 🟡 일정).
//
// Pairs with the existing ICS *builder* (src/lib/ops/push.ts) — this is the read
// side: a user exports their calendar (Google Takeout / Apple Calendar / any app
// produces RFC 5545 .ics) and we read the events. Pure: no network, no LLM, no
// storage. Defensive line-unfolding + datetime parsing; unknown lines ignored.

export interface CalendarEvent {
  title: string;
  /** ISO start, or null when unparseable. */
  startIso: string | null;
  endIso: string | null;
  allDay: boolean;
}

const MAX_EVENTS = 5000;
const TITLE_MAX = 200;

/** RFC 5545 line unfolding: a leading space/tab continues the previous line. */
function unfold(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Parse "20240105T154200Z" / "20240105T154200" / "20240105" → ISO. */
export function parseIcsDate(value: string): { iso: string | null; dateOnly: boolean } {
  const v = value.trim();
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) {
    const [, y, mo, d, h, mi, s, z] = dt;
    const iso = z
      ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString()
      : new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString();
    return { iso: Number.isNaN(Date.parse(iso)) ? null : iso, dateOnly: false };
  }
  const dOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dOnly) {
    const [, y, mo, d] = dOnly;
    // Date-only (all-day) values carry no time or zone. Anchor at UTC midnight so
    // toISOString() preserves the calendar date. new Date(y,mo,d) uses LOCAL
    // midnight, which in a positive-offset zone (e.g. KST, +9) rolls the ISO date
    // back a day — an all-day event on the 15th would import as the 14th.
    const date = new Date(Date.UTC(+y, +mo - 1, +d));
    return { iso: Number.isNaN(date.getTime()) ? null : date.toISOString(), dateOnly: true };
  }
  return { iso: null, dateOnly: false };
}

/** propertyName from a possibly-parametered key like "DTSTART;VALUE=DATE". */
function propName(key: string): string {
  return key.split(";")[0].toUpperCase();
}

/** Parse an .ics document into events. Pure. */
export function parseIcs(raw: string): CalendarEvent[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const out: CalendarEvent[] = [];
  let cur: { title: string; start: ReturnType<typeof parseIcsDate> | null; end: ReturnType<typeof parseIcsDate> | null } | null =
    null;

  for (const line of unfold(raw)) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      if (line.trim() === "BEGIN:VEVENT") cur = { title: "", start: null, end: null };
      continue;
    }
    const key = line.slice(0, idx);
    const val = line.slice(idx + 1);
    const name = propName(key);

    if (name === "BEGIN" && val.trim() === "VEVENT") {
      cur = { title: "", start: null, end: null };
    } else if (name === "END" && val.trim() === "VEVENT") {
      if (cur && out.length < MAX_EVENTS) {
        out.push({
          title: cur.title.trim().slice(0, TITLE_MAX) || "(untitled)",
          startIso: cur.start?.iso ?? null,
          endIso: cur.end?.iso ?? null,
          allDay: cur.start?.dateOnly ?? false,
        });
      }
      cur = null;
    } else if (cur) {
      if (name === "SUMMARY") cur.title = val;
      else if (name === "DTSTART") cur.start = parseIcsDate(val);
      else if (name === "DTEND") cur.end = parseIcsDate(val);
    }
  }
  return out;
}
