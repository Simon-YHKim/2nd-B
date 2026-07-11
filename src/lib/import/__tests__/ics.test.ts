import { parseIcs, parseIcsDate } from "../ics";

describe("parseIcsDate", () => {
  test("UTC, floating, and date-only", () => {
    expect(parseIcsDate("20240105T154200Z").iso).toBe("2024-01-05T15:42:00.000Z");
    expect(parseIcsDate("20240105T154200").dateOnly).toBe(false);
    const d = parseIcsDate("20240105");
    expect(d.dateOnly).toBe(true);
    // date-only anchors at UTC midnight so the calendar date is preserved in ANY
    // timezone. Regression: local midnight rolled the ISO date back a day in
    // positive-offset zones (KST +9), importing an all-day event as the day before.
    expect(d.iso).toBe("2024-01-05T00:00:00.000Z");
    expect(parseIcsDate("garbage").iso).toBeNull();
  });
});

describe("parseIcs", () => {
  test("reads VEVENTs (summary + start/end), unfolds long lines", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "SUMMARY:Standup mee",
      " ting",
      "DTSTART:20240105T090000Z",
      "DTEND:20240105T093000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Holiday",
      "DTSTART;VALUE=DATE:20240106",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const out = parseIcs(ics);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("Standup meeting"); // unfolded
    expect(out[0].startIso).toBe("2024-01-05T09:00:00.000Z");
    expect(out[0].endIso).toBe("2024-01-05T09:30:00.000Z");
    expect(out[0].allDay).toBe(false);
    expect(out[1].title).toBe("Holiday");
    expect(out[1].allDay).toBe(true);
    expect(out[1].startIso).toBe("2024-01-06T00:00:00.000Z"); // date preserved, not rolled back
  });

  test("untitled fallback + empty input", () => {
    const ics = "BEGIN:VEVENT\nDTSTART:20240105T090000Z\nEND:VEVENT";
    expect(parseIcs(ics)[0].title).toBe("(untitled)");
    expect(parseIcs("")).toEqual([]);
  });
});
