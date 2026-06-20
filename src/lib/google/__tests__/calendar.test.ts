import { parseIcs } from "../../import/ics";
import { detectImportKind } from "../../import/detect";
import {
  parseGoogleEvents,
  rfc3339ToIcsUtc,
  dateToIcsDate,
  googleEventsToIcs,
  type GoogleEvent,
} from "../calendar";

describe("parseGoogleEvents", () => {
  it("reads timed and all-day events from the API items shape", () => {
    const json = {
      items: [
        { summary: "Standup", start: { dateTime: "2026-06-22T09:00:00+09:00" }, end: { dateTime: "2026-06-22T09:30:00+09:00" } },
        { summary: "Holiday", start: { date: "2026-06-25" }, end: { date: "2026-06-26" } },
      ],
    };
    const events = parseGoogleEvents(json);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ summary: "Standup", startDateTime: "2026-06-22T09:00:00+09:00" });
    expect(events[1]).toMatchObject({ summary: "Holiday", startDate: "2026-06-25" });
  });

  it("skips cancelled events and events with no start", () => {
    const json = {
      items: [
        { summary: "Cancelled", status: "cancelled", start: { dateTime: "2026-06-22T09:00:00Z" } },
        { summary: "No start" },
      ],
    };
    expect(parseGoogleEvents(json)).toHaveLength(0);
  });

  it("falls back to (untitled) and tolerates junk", () => {
    expect(parseGoogleEvents({ items: [{ start: { date: "2026-06-25" } }] })[0].summary).toBe("(untitled)");
    expect(parseGoogleEvents(null)).toEqual([]);
    expect(parseGoogleEvents({ items: "nope" })).toEqual([]);
  });
});

describe("date helpers", () => {
  it("converts an RFC3339 datetime to ICS UTC compact form", () => {
    // 09:00 KST (+09:00) == 00:00 UTC.
    expect(rfc3339ToIcsUtc("2026-06-22T09:00:00+09:00")).toBe("20260622T000000Z");
    expect(rfc3339ToIcsUtc("2026-06-22T00:00:00Z")).toBe("20260622T000000Z");
    expect(rfc3339ToIcsUtc("not-a-date")).toBeNull();
  });

  it("converts an all-day date to ICS date form", () => {
    expect(dateToIcsDate("2026-06-25")).toBe("20260625");
    expect(dateToIcsDate("2026/06/25")).toBeNull();
  });
});

describe("googleEventsToIcs → parseIcs roundtrip", () => {
  const events: GoogleEvent[] = [
    { summary: "Standup; daily", startDateTime: "2026-06-22T09:00:00+09:00", endDateTime: "2026-06-22T09:30:00+09:00" },
    { summary: "Holiday", startDate: "2026-06-25", endDate: "2026-06-26" },
  ];

  it("produces ICS the import pipeline detects and parses", () => {
    const ics = googleEventsToIcs(events);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(detectImportKind("", ics)).toBe("ics");

    const parsed = parseIcs(ics);
    expect(parsed).toHaveLength(2);
    // RFC 5545 escaping is decoded as literal text by our reader's SUMMARY pass-through.
    expect(parsed[0].title).toContain("Standup");
    expect(parsed[0].startIso).toBe("2026-06-22T00:00:00.000Z");
    expect(parsed[0].allDay).toBe(false);
    expect(parsed[1].allDay).toBe(true);
    expect(parsed[1].startIso).not.toBeNull();
  });

  it("drops events whose start can't be serialized", () => {
    const ics = googleEventsToIcs([{ summary: "bad", startDateTime: "nonsense" }]);
    expect(parseIcs(ics)).toHaveLength(0);
  });
});
