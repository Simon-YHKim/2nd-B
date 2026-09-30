import AsyncStorage from "@react-native-async-storage/async-storage";

import { DAILY_REFRESH_MINUTES, validRefreshTime, type RefreshSettings } from "./refresh-schedule";

export { DAILY_REFRESH_MINUTES, nextRefreshAt, shouldRefreshAfterResume, validRefreshTime, type RefreshSettings } from "./refresh-schedule";

// This controls foreground reads of data already saved to the account: once a day
// at the chosen local time, while the dashboard is open and the app is active.
// It does not authorize a new provider import or schedule background collection.
//
// Once a day is Simon's decision (2026-09-30, "내 의도는 하루 한번이야"). The
// 30 minute to 12 hour interval picker is gone, so an interval saved by an
// earlier build is read back as daily too: a cadence nobody can see or change
// must not keep running (DECISIONS.md 26.09.30 23:35).
//
// Which time a migrated save keeps: the old schedule fired at the anchor's phase
// within the interval. For 3, 6 and 12 hours the anchor itself was one of the
// slots that fired, so it is kept, unless it is 00:00, the old default nobody
// chose. For 30 and 60 minutes the hour never mattered, and a daily 00:00 would
// only fire for someone awake at midnight, so both start from 07:00.

/** Intervals earlier builds could save. Only read, so their saves still parse. */
export const REFRESH_MINUTE_OPTIONS = [30, 60, 180, 360, 720, 1440] as const;
export type RefreshMinutes = (typeof REFRESH_MINUTE_OPTIONS)[number];
/**
 * 07:00 is the morning refresh of Simon's own dashboard draft (NEXT_REFRESH
 * 07:00 in the original HTML), and a first read of the day is what a daily
 * schedule is for. Midnight would only ever fire for someone awake at 00:00.
 */
export const DEFAULT_REFRESH_TIME = "07:00";
export const DEFAULT_REFRESH_SETTINGS: RefreshSettings = {
  enabled: true, intervalMinutes: DAILY_REFRESH_MINUTES, anchorTime: DEFAULT_REFRESH_TIME,
};

function legacyStorageKey(ownerId: string): string {
  return `dashboard.refresh.v1:${ownerId}`;
}

function storageKey(ownerId: string): string {
  return `dashboard.refresh.v2:${ownerId}`;
}

export function normalizeRefreshTime(value: string): string | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match || Number(match[1]) > 23) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function daily(enabled: boolean, anchorTime: string): RefreshSettings {
  return { enabled, intervalMinutes: DAILY_REFRESH_MINUTES, anchorTime };
}

function migratedAnchor(intervalMinutes: RefreshMinutes, anchorTime: string): string {
  if (intervalMinutes === DAILY_REFRESH_MINUTES) return anchorTime;
  if (intervalMinutes >= 180 && anchorTime !== "00:00") return anchorTime;
  return DEFAULT_REFRESH_TIME;
}

export function parseRefreshSettings(value: string | null, legacyValue: string | null): RefreshSettings {
  if (value !== null) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" &&
        "enabled" in parsed && typeof parsed.enabled === "boolean" &&
        "intervalMinutes" in parsed && REFRESH_MINUTE_OPTIONS.some((minutes) => minutes === parsed.intervalMinutes) &&
        "anchorTime" in parsed && typeof parsed.anchorTime === "string" && validRefreshTime(parsed.anchorTime)) {
        return daily(parsed.enabled, migratedAnchor(parsed.intervalMinutes as RefreshMinutes, parsed.anchorTime));
      }
    } catch { /* Corrupt local settings must not crash the dashboard. */ }
    return { ...DEFAULT_REFRESH_SETTINGS };
  }
  if (legacyValue !== null) {
    // v1 stored only minutes; "0" was the manual-only choice and stays off.
    if (Number(legacyValue) === 0) return { ...DEFAULT_REFRESH_SETTINGS, enabled: false };
  }
  return { ...DEFAULT_REFRESH_SETTINGS };
}

export async function getRefreshSettings(ownerId: string): Promise<RefreshSettings> {
  try {
    const saved = await AsyncStorage.getItem(storageKey(ownerId));
    return parseRefreshSettings(saved, saved === null ? await AsyncStorage.getItem(legacyStorageKey(ownerId)) : null);
  } catch { return { ...DEFAULT_REFRESH_SETTINGS }; }
}

export async function setRefreshSettings(ownerId: string, settings: RefreshSettings): Promise<void> {
  if (settings.intervalMinutes !== DAILY_REFRESH_MINUTES || !validRefreshTime(settings.anchorTime)) {
    throw new Error("invalid refresh settings");
  }
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(daily(settings.enabled, settings.anchorTime)));
}
