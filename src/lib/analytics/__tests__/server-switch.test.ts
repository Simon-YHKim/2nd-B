// Q-261024-72 (Simon 2026-10-24): the settings line shows "saved · not sending now"
// when the operator switch runtime_flags.analytics_enabled is off.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const select = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => select(table, columns, column, value),
      }),
    }),
  }),
}));

import { analyticsToggleValue, readAnalyticsServerSwitch } from "../server-switch";

const ROOT = resolve(__dirname, "../../../..");

beforeEach(() => {
  select.mockReset();
  jest.useRealTimers();
});

describe("readAnalyticsServerSwitch", () => {
  test("reads only the analytics switch row", async () => {
    select.mockResolvedValue({ data: [{ key: "analytics_enabled", enabled: true }], error: null });
    await expect(readAnalyticsServerSwitch()).resolves.toBe(true);
    expect(select).toHaveBeenCalledWith("runtime_flags", "key, enabled", "key", "analytics_enabled");
  });

  test("a switch row set to false reads as off", async () => {
    select.mockResolvedValue({ data: [{ key: "analytics_enabled", enabled: false }], error: null });
    await expect(readAnalyticsServerSwitch()).resolves.toBe(false);
  });

  test("a missing row reads as off, the same default the sending gate uses", async () => {
    select.mockResolvedValue({ data: [], error: null });
    await expect(readAnalyticsServerSwitch()).resolves.toBe(false);
  });

  test("a query error is unknown, not off", async () => {
    select.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(readAnalyticsServerSwitch()).resolves.toBeNull();
  });

  test("a thrown request is unknown", async () => {
    select.mockRejectedValue(new Error("offline"));
    await expect(readAnalyticsServerSwitch()).resolves.toBeNull();
  });

  test("no answer within the timeout is unknown", async () => {
    jest.useFakeTimers();
    select.mockReturnValue(new Promise(() => undefined));
    const pending = readAnalyticsServerSwitch();
    jest.advanceTimersByTime(5_000);
    await expect(pending).resolves.toBeNull();
  });
});

describe("analyticsToggleValue", () => {
  test.each([
    [{ minor: true, on: true, serverOn: true }, "lockedUnder18"],
    [{ minor: true, on: false, serverOn: false }, "lockedUnder18"],
    [{ minor: false, on: false, serverOn: false }, "off"],
    [{ minor: false, on: false, serverOn: true }, "off"],
    [{ minor: false, on: true, serverOn: true }, "applied"],
    [{ minor: false, on: true, serverOn: null }, "applied"],
    [{ minor: false, on: true, serverOn: false }, "paused"],
  ] as const)("%j -> %s", (input, expected) => {
    expect(analyticsToggleValue(input)).toBe(expected);
  });
});

describe("settings screen wiring", () => {
  const screen = readFileSync(resolve(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"), "utf8");

  test("the usage statistics line takes its value from analyticsToggleValue and the server read", () => {
    expect(screen).toMatch(/readAnalyticsServerSwitch\(\)/);
    expect(screen).toMatch(/analyticsToggleValue\(\{\s*minor,\s*on: analyticsOn === true,\s*serverOn: analyticsServerOn\s*\}\)/);
    expect(screen).toContain('t("privacy.analytics.paused")');
  });

  test("every locale names the paused value", () => {
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const json = JSON.parse(readFileSync(resolve(ROOT, `locales/${locale}/deepspace.json`), "utf8"));
      expect(typeof json.privacy.analytics.paused).toBe("string");
      expect(json.privacy.analytics.paused.length).toBeGreaterThan(0);
    }
  });
});
