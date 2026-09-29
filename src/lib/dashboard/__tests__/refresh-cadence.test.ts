import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_REFRESH_SETTINGS, getRefreshSettings, nextRefreshAt, normalizeRefreshTime, parseRefreshSettings,
  REFRESH_MINUTE_OPTIONS, setRefreshSettings, shouldRefreshAfterResume,
} from "../refresh-cadence";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

beforeEach(() => jest.clearAllMocks());

test("automatic refresh defaults to one hour on the hour", () => {
  expect(DEFAULT_REFRESH_SETTINGS).toEqual({ enabled: true, intervalMinutes: 60, anchorTime: "00:00" });
  expect(REFRESH_MINUTE_OPTIONS).toEqual([30, 60, 180, 360, 720, 1440]);
  expect(parseRefreshSettings(null, null)).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("legacy manual and interval choices migrate without silently enabling manual-only users", () => {
  expect(parseRefreshSettings(null, "0")).toEqual({ enabled: false, intervalMinutes: 60, anchorTime: "00:00" });
  expect(parseRefreshSettings(null, "180")).toEqual({ enabled: true, intervalMinutes: 180, anchorTime: "00:00" });
  expect(parseRefreshSettings(null, "45")).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("invalid persisted schedules fall back to the safe default", () => {
  expect(parseRefreshSettings('{"enabled":true,"intervalMinutes":45,"anchorTime":"12:00"}', null)).toEqual(DEFAULT_REFRESH_SETTINGS);
  expect(parseRefreshSettings('{"enabled":true,"intervalMinutes":60,"anchorTime":"25:00"}', null)).toEqual(DEFAULT_REFRESH_SETTINGS);
  expect(parseRefreshSettings("not json", null)).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("clock input accepts a one-digit hour but rejects impossible times", () => {
  expect(normalizeRefreshTime("7:30")).toBe("07:30");
  expect(normalizeRefreshTime("07:30")).toBe("07:30");
  expect(normalizeRefreshTime("24:00")).toBeNull();
  expect(normalizeRefreshTime("7:3")).toBeNull();
});

test("the whole schedule is stored per account, including off without losing its interval", async () => {
  const settings = { enabled: false, intervalMinutes: 180 as const, anchorTime: "07:30" };
  storage.getItem.mockResolvedValueOnce(JSON.stringify(settings));
  expect(await getRefreshSettings("owner-a")).toEqual(settings);
  expect(storage.getItem).toHaveBeenCalledWith("dashboard.refresh.v2:owner-a");
  await setRefreshSettings("owner-b", settings);
  expect(storage.setItem).toHaveBeenCalledWith("dashboard.refresh.v2:owner-b", JSON.stringify(settings));
  storage.getItem.mockResolvedValueOnce(null).mockResolvedValueOnce("0");
  expect(await getRefreshSettings("owner-c")).toMatchObject({ enabled: false });
  expect(storage.getItem).toHaveBeenLastCalledWith("dashboard.refresh.v1:owner-c");
});

test("an unavailable device store falls back to the default", async () => {
  storage.getItem.mockRejectedValueOnce(new Error("unavailable"));
  expect(await getRefreshSettings("owner-a")).toEqual(DEFAULT_REFRESH_SETTINGS);
});

test("next refresh aligns to the chosen local clock time, not the screen open time", () => {
  const settings = { enabled: true, intervalMinutes: 180 as const, anchorTime: "07:30" };
  expect(nextRefreshAt(new Date(2026, 8, 26, 8, 10), settings)).toEqual(new Date(2026, 8, 26, 10, 30));
  expect(nextRefreshAt(new Date(2026, 8, 26, 10, 30), settings)).toEqual(new Date(2026, 8, 26, 13, 30));
  expect(nextRefreshAt(new Date(2026, 8, 26, 23, 0), settings)).toEqual(new Date(2026, 8, 27, 1, 30));
  expect(nextRefreshAt(new Date(2026, 8, 26, 8, 10), { ...settings, enabled: false })).toBeNull();
});

test("resume only rereads if a scheduled boundary passed since the last read", () => {
  const settings = { enabled: true, intervalMinutes: 60 as const, anchorTime: "00:30" };
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 10, 15), new Date(2026, 8, 26, 10, 20), settings)).toBe(false);
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 10, 15), new Date(2026, 8, 26, 10, 31), settings)).toBe(true);
  expect(shouldRefreshAfterResume(new Date(2026, 8, 26, 10, 15), new Date(2026, 8, 26, 10, 31), { ...settings, enabled: false })).toBe(false);
});
