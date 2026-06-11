import { buildChecklistShareText, buildGoogleCalendarUrl, buildIcsEvent } from "../push";

const NOW = new Date("2026-06-11T09:00:00.000Z");

describe("ops push builders (O-R3 P1)", () => {
  test("builds a valid single-event VCALENDAR with escaping and CRLF lines", () => {
    const ics = buildIcsEvent(
      {
        title: "Stretch; then read, slowly",
        description: "Line one\nLine two",
        startsAtIso: "2026-06-12T21:30:00.000Z",
        durationMinutes: 20,
      },
      NOW,
    );
    expect(ics).not.toBeNull();
    const text = ics as string;
    expect(text).toContain("BEGIN:VCALENDAR\r\n");
    expect(text).toContain("DTSTART:20260612T213000Z");
    expect(text).toContain("DTEND:20260612T215000Z");
    expect(text).toContain("SUMMARY:Stretch\\; then read\\, slowly");
    expect(text).toContain("DESCRIPTION:Line one\\nLine two");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text).not.toContain("RRULE");
  });

  test("recurrence maps to RRULE and default duration is 30 minutes", () => {
    const ics = buildIcsEvent(
      { title: "Daily reset", startsAtIso: "2026-06-12T12:00:00.000Z", recurrence: "daily" },
      NOW,
    ) as string;
    expect(ics).toContain("RRULE:FREQ=DAILY");
    expect(ics).toContain("DTEND:20260612T123000Z");
  });

  test("invalid start or empty title returns null instead of a broken file", () => {
    expect(buildIcsEvent({ title: "x", startsAtIso: "not-a-date" }, NOW)).toBeNull();
    expect(buildIcsEvent({ title: "   ", startsAtIso: "2026-06-12T12:00:00Z" }, NOW)).toBeNull();
    expect(buildGoogleCalendarUrl({ title: "x", startsAtIso: "garbage" })).toBeNull();
  });

  test("Google Calendar URL carries template fields with proper encoding", () => {
    const url = buildGoogleCalendarUrl({
      title: "Plan & review",
      description: "From 2nd-Brain",
      startsAtIso: "2026-06-12T21:30:00.000Z",
      durationMinutes: 45,
      recurrence: "weekly",
    }) as string;
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Plan+%26+review");
    expect(url).toContain("dates=20260612T213000Z%2F20260612T221500Z");
    expect(url).toContain("recur=RRULE%3AFREQ%3DWEEKLY");
  });

  test("checklist share text renders unchecked boxes and skips blank items", () => {
    expect(buildChecklistShareText("Home reset", ["Desk", " ", "Sink"])).toBe(
      "Home reset\n\n- [ ] Desk\n- [ ] Sink",
    );
    expect(buildChecklistShareText("Just a title", [])).toBe("Just a title");
  });
});
