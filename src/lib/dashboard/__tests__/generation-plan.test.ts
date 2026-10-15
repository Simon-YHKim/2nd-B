import { planDailyNote, type DailyNotePlanInput } from "../generation-plan";

const base: DailyNotePlanInput = {
  now: new Date("2026-10-07T06:00:00+09:00"),
  timeZone: "Asia/Seoul",
  trigger: "hourly",
  llmConsent: true,
  lastActiveAt: new Date("2026-10-06T10:00:00+09:00"),
  morningPush: false,
  attemptsToday: 0,
  claimedSlotKeys: [],
};
const plan = (over: Partial<DailyNotePlanInput> = {}) => planDailyNote({ ...base, ...over });

describe("W1 local slot preflight", () => {
  test.each([
    ["2026-10-07T06:00:00+09:00", "morning"],
    ["2026-10-07T13:00:00+09:00", "midday"],
    ["2026-10-07T20:00:00+09:00", "evening"],
  ])("selects the local slot at %s", (now, slot) => {
    expect(plan({ now: new Date(now) })).toEqual({
      kind: "generate", slot, localDate: "2026-10-07", slotKey: "2026-10-07:" + slot,
    });
  });

  test.each(["05:59:59", "07:00:00", "12:59:59", "14:00:00", "19:59:59", "21:00:00"])(
    "does not replay an old slot on an hourly tick at %s", (time) => {
      expect(plan({ now: new Date("2026-10-07T" + time + "+09:00") })).toEqual({
        kind: "skip", reason: "outside_slot_hour",
      });
    },
  );

  test.each([
    ["Asia/Kolkata", "2026-10-07T01:00:00Z"],
    ["Asia/Kathmandu", "2026-10-07T01:00:00Z"],
    ["Pacific/Chatham", "2026-10-06T17:00:00Z"],
  ])("an hourly UTC tick reaches %s despite a fractional offset", (timeZone, now) => {
    expect(plan({ timeZone, now: new Date(now) })).toMatchObject({ kind: "generate", slot: "morning" });
  });

  test.each([
    ["2026-03-08T10:00:00Z", "2026-03-08"],
    ["2026-11-01T11:00:00Z", "2026-11-01"],
  ])("uses the user's DST offset, not the server offset at %s", (now, date) => {
    expect(plan({ timeZone: "America/New_York", now: new Date(now), lastActiveAt: new Date(now) }))
      .toMatchObject({ kind: "generate", slot: "morning", localDate: date });
  });

  test("opening after seven inactive days generates only the current slot", () => {
    expect(plan({ trigger: "open", now: new Date("2026-10-07T16:30:00+09:00"), lastActiveAt: null }))
      .toMatchObject({ kind: "generate", slot: "midday", slotKey: "2026-10-07:midday" });
  });

  test("an opening before 06:00 shares the preceding evening's slot", () => {
    expect(plan({ trigger: "open", now: new Date("2027-01-01T01:00:00+09:00"), lastActiveAt: null }))
      .toEqual({ kind: "generate", slot: "evening", localDate: "2027-01-01", slotKey: "2026-12-31:evening" });
  });

  test.each([null, new Date("2026-09-30T06:00:00+09:00")])("skips inactive scheduled users (%s)", (lastActiveAt) => {
    expect(plan({ lastActiveAt })).toEqual({ kind: "skip", reason: "inactive" });
  });

  test("an explicit morning-push opt-in preserves scheduled generation despite inactivity", () => {
    expect(plan({ morningPush: true, lastActiveAt: null })).toMatchObject({ kind: "generate" });
  });

  test("a repeated tick and another device use the same persisted slot key", () => {
    const first = plan();
    expect(first.kind).toBe("generate");
    if (first.kind !== "generate") throw new Error("missing first slot");
    expect(plan({ claimedSlotKeys: [first.slotKey], now: new Date("2026-10-07T06:59:59+09:00") }))
      .toEqual({ kind: "skip", reason: "already_claimed" });
  });

  test("the current day's call cap also covers opening and time-zone changes", () => {
    expect(plan({ attemptsToday: 3, trigger: "open" })).toEqual({ kind: "skip", reason: "daily_limit" });
    expect(plan({ attemptsToday: 4 })).toEqual({ kind: "skip", reason: "daily_limit" });
  });

  test("revoking consent closes even a push-enabled user's path", () => {
    expect(plan({ llmConsent: false, morningPush: true })).toEqual({ kind: "skip", reason: "consent_off" });
  });

  test.each([
    { now: new Date("invalid") }, { timeZone: "Not/AZone" }, { timeZone: "" },
    { attemptsToday: -1 }, { attemptsToday: 0.5 }, { attemptsToday: Number.NaN },
    { lastActiveAt: new Date("invalid") }, { lastActiveAt: new Date("2026-10-08T00:00:00Z") },
  ])("refuses invalid persisted scheduling metadata without throwing: %j", (over) => {
    expect(() => plan(over)).not.toThrow();
    expect(plan(over)).toEqual({ kind: "skip", reason: "invalid_input" });
  });
});
