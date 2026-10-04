import { execFileSync } from "node:child_process";
import path from "node:path";

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DAILY_REFRESH_MINUTES, DEFAULT_REFRESH_SETTINGS, DEFAULT_REFRESH_TIME, getRefreshSettings, nextRefreshAt,
  normalizeRefreshTime, parseRefreshSettings, REFRESH_MINUTE_OPTIONS, setRefreshSettings, shouldRefreshAfterResume,
} from "../refresh-cadence";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const saved = (enabled: boolean, intervalMinutes: number, anchorTime: string) =>
  JSON.stringify({ enabled, intervalMinutes, anchorTime });

beforeEach(() => jest.clearAllMocks());

// Simon 2026-09-30: "내 의도는 하루 한번이야." One time a day, no interval picker.
test("automatic refresh defaults to once a day in the morning", () => {
  expect(DAILY_REFRESH_MINUTES).toBe(1440);
  expect(DEFAULT_REFRESH_TIME).toBe("07:00");
  expect(DEFAULT_REFRESH_SETTINGS).toEqual({ enabled: true, intervalMinutes: 1440, anchorTime: "07:00" });
  expect(parseRefreshSettings(null, null)).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("a daily save keeps its clock time and on/off choice", () => {
  expect(parseRefreshSettings(saved(true, 1440, "21:15"), null)).toEqual({ enabled: true, intervalMinutes: 1440, anchorTime: "21:15" });
  expect(parseRefreshSettings(saved(false, 1440, "06:30"), null)).toEqual({ enabled: false, intervalMinutes: 1440, anchorTime: "06:30" });
});

test("an interval saved by an earlier build is read back as daily, never as a hidden cadence", () => {
  expect(REFRESH_MINUTE_OPTIONS).toEqual([30, 60, 180, 360, 720, 1440]);
  // 3, 6 and 12 hours fired at the anchor itself, so a chosen anchor is kept as the daily time.
  for (const minutes of [180, 360, 720]) {
    expect(parseRefreshSettings(saved(true, minutes, "07:30"), null)).toEqual({ enabled: true, intervalMinutes: 1440, anchorTime: "07:30" });
    expect(parseRefreshSettings(saved(false, minutes, "21:00"), null)).toEqual({ enabled: false, intervalMinutes: 1440, anchorTime: "21:00" });
    // 00:00 was the old default nobody chose; a daily midnight would only fire for the sleepless.
    expect(parseRefreshSettings(saved(true, minutes, "00:00"), null)).toEqual({ enabled: true, intervalMinutes: 1440, anchorTime: "07:00" });
  }
  // 30 and 60 minutes only used the anchor's minutes; the hour was never a choice.
  for (const minutes of [30, 60]) {
    expect(parseRefreshSettings(saved(true, minutes, "07:30"), null)).toEqual({ enabled: true, intervalMinutes: 1440, anchorTime: "07:00" });
    expect(parseRefreshSettings(saved(false, minutes, "00:00"), null)).toEqual({ enabled: false, intervalMinutes: 1440, anchorTime: "07:00" });
  }
});

test("legacy v1 minutes become daily without switching manual-only users back on", () => {
  expect(parseRefreshSettings(null, "0")).toEqual({ enabled: false, intervalMinutes: 1440, anchorTime: "07:00" });
  expect(parseRefreshSettings(null, "180")).toEqual(DEFAULT_REFRESH_SETTINGS);
  expect(parseRefreshSettings(null, "45")).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("invalid persisted schedules fall back to the safe default", () => {
  expect(parseRefreshSettings(saved(true, 45, "12:00"), null)).toEqual(DEFAULT_REFRESH_SETTINGS);
  expect(parseRefreshSettings(saved(true, 60, "25:00"), null)).toEqual(DEFAULT_REFRESH_SETTINGS);
  expect(parseRefreshSettings('{"enabled":"yes","intervalMinutes":1440,"anchorTime":"07:00"}', null)).toEqual(DEFAULT_REFRESH_SETTINGS);
  expect(parseRefreshSettings("not json", null)).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("clock input accepts a one-digit hour but rejects impossible times", () => {
  expect(normalizeRefreshTime("7:30")).toBe("07:30");
  expect(normalizeRefreshTime("07:30")).toBe("07:30");
  expect(normalizeRefreshTime("24:00")).toBeNull();
  expect(normalizeRefreshTime("7:3")).toBeNull();
});

test("the schedule is stored per account and always as daily", async () => {
  const settings = { enabled: false, intervalMinutes: 1440 as const, anchorTime: "07:30" };
  storage.getItem.mockResolvedValueOnce(JSON.stringify(settings));
  expect(await getRefreshSettings("owner-a")).toEqual(settings);
  expect(storage.getItem).toHaveBeenCalledWith("dashboard.refresh.v2:owner-a");
  await setRefreshSettings("owner-b", settings);
  expect(storage.setItem).toHaveBeenCalledWith("dashboard.refresh.v2:owner-b", JSON.stringify(settings));
  storage.getItem.mockResolvedValueOnce(null).mockResolvedValueOnce("0");
  expect(await getRefreshSettings("owner-c")).toMatchObject({ enabled: false });
  expect(storage.getItem).toHaveBeenLastCalledWith("dashboard.refresh.v1:owner-c");
});

test("saving refuses a malformed time or a non-daily interval", async () => {
  await expect(setRefreshSettings("owner", { enabled: true, intervalMinutes: 1440, anchorTime: "7:30" })).rejects.toThrow();
  await expect(setRefreshSettings("owner", { enabled: true, intervalMinutes: 60 as unknown as 1440, anchorTime: "07:30" })).rejects.toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
});

test("an unavailable device store falls back to the default", async () => {
  storage.getItem.mockRejectedValueOnce(new Error("unavailable"));
  expect(await getRefreshSettings("owner-a")).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("the next refresh is today's chosen time if still ahead, otherwise tomorrow's", () => {
  const settings = { enabled: true, intervalMinutes: 1440 as const, anchorTime: "07:30" };
  expect(nextRefreshAt(new Date(2026, 8, 26, 6, 0), settings)).toEqual(new Date(2026, 8, 26, 7, 30));
  expect(nextRefreshAt(new Date(2026, 8, 26, 7, 30), settings)).toEqual(new Date(2026, 8, 27, 7, 30));
  expect(nextRefreshAt(new Date(2026, 8, 26, 23, 0), settings)).toEqual(new Date(2026, 8, 27, 7, 30));
  expect(nextRefreshAt(new Date(2026, 8, 26, 8, 10), { ...settings, enabled: false })).toBeNull();
});

test("resume rereads once the chosen time has passed since the last read, not before", () => {
  const settings = { enabled: true, intervalMinutes: 1440 as const, anchorTime: "07:30" };
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 8, 0), new Date(2026, 8, 26, 22, 0), settings)).toBe(false);
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 8, 0), new Date(2026, 8, 27, 7, 29), settings)).toBe(false);
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 8, 0), new Date(2026, 8, 27, 7, 31), settings)).toBe(true);
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 6, 0), new Date(2026, 8, 26, 7, 31), settings)).toBe(true);
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 8, 0), new Date(2026, 8, 27, 7, 31), { ...settings, enabled: false })).toBe(false);
});

test("a daily time inside a spring-forward gap does not stall the schedule", () => {
  // Jest cannot switch the time zone in-process, so the probe runs in a child under New York time.
  const root = path.resolve(__dirname, "../../../..");
  const output = execFileSync(
    process.execPath,
    [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(__dirname, "fixtures", "dst-probe.ts")],
    { cwd: root, encoding: "utf8", env: { ...process.env, TZ: "America/New_York" } },
  );
  const probe = JSON.parse(output) as { gapHour: number; nextDate: number | null; nextHour: number | null; resumes: boolean };
  // The control: 02:30 on 8 March really is inside the gap in the child's zone.
  expect(probe.gapHour).toBe(3);
  // From the 7th, the 8th has no 02:30, so the next slot is the 9th, not "never".
  expect(probe).toMatchObject({ nextDate: 9, nextHour: 2, resumes: true });
});
