import AsyncStorage from "@react-native-async-storage/async-storage";

// This controls foreground reads of data already saved to the account. It does
// not authorize a new provider import or schedule background collection.
export const REFRESH_MINUTE_OPTIONS = [30, 60, 180, 360, 720, 1440] as const;
export type RefreshMinutes = (typeof REFRESH_MINUTE_OPTIONS)[number];
export interface RefreshSettings {
  enabled: boolean;
  intervalMinutes: RefreshMinutes;
  anchorTime: string;
}
export const DEFAULT_REFRESH_SETTINGS: RefreshSettings = { enabled: true, intervalMinutes: 60, anchorTime: "00:00" };

function legacyStorageKey(ownerId: string): string {
  return `dashboard.refresh.v1:${ownerId}`;
}

function storageKey(ownerId: string): string {
  return `dashboard.refresh.v2:${ownerId}`;
}

export function validRefreshTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeRefreshTime(value: string): string | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match || Number(match[1]) > 23) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function parseRefreshSettings(value: string | null, legacyValue: string | null): RefreshSettings {
  if (value !== null) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" &&
        "enabled" in parsed && typeof parsed.enabled === "boolean" &&
        "intervalMinutes" in parsed && REFRESH_MINUTE_OPTIONS.some((minutes) => minutes === parsed.intervalMinutes) &&
        "anchorTime" in parsed && typeof parsed.anchorTime === "string" && validRefreshTime(parsed.anchorTime)) {
        return parsed as RefreshSettings;
      }
    } catch { /* Corrupt local settings must not crash the dashboard. */ }
    return { ...DEFAULT_REFRESH_SETTINGS };
  }
  if (legacyValue !== null) {
    const oldMinutes = Number(legacyValue);
    if (oldMinutes === 0) return { ...DEFAULT_REFRESH_SETTINGS, enabled: false };
    const intervalMinutes = REFRESH_MINUTE_OPTIONS.find((minutes) => minutes === oldMinutes);
    if (intervalMinutes) return { ...DEFAULT_REFRESH_SETTINGS, intervalMinutes };
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
  if (!REFRESH_MINUTE_OPTIONS.some((minutes) => minutes === settings.intervalMinutes) || !validRefreshTime(settings.anchorTime)) {
    throw new Error("invalid refresh settings");
  }
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(settings));
}

/** Next local wall-clock slot after `now`; every supported interval divides one day. */
export function nextRefreshAt(now: Date, settings: RefreshSettings): Date | null {
  if (!settings.enabled || !Number.isFinite(now.getTime()) || !validRefreshTime(settings.anchorTime)) return null;
  const [hour, minute] = settings.anchorTime.split(":").map(Number);
  const phase = (hour * 60 + minute) % settings.intervalMinutes;
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + dayOffset);
    for (let slot = phase; slot < 1440; slot += settings.intervalMinutes) {
      const candidate = new Date(day);
      candidate.setHours(Math.floor(slot / 60), slot % 60, 0, 0);
      // A spring-forward hour does not exist in local time; skip that slot.
      if (candidate.getHours() !== Math.floor(slot / 60) || candidate.getMinutes() !== slot % 60) continue;
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return null;
}

export function shouldRefreshAfterResume(lastRead: Date, now: Date, settings: RefreshSettings): boolean {
  if (!Number.isFinite(lastRead.getTime()) || !Number.isFinite(now.getTime())) return false;
  const next = nextRefreshAt(lastRead, settings);
  return next !== null && next.getTime() <= now.getTime();
}
