// Pure schedule math for the dashboard's daily refresh (Simon 2026-09-30: once a day).
//
// Kept apart from refresh-cadence.ts, which owns storage, so it imports nothing native:
// a test can run it in a child process under another time zone. Jest cannot switch the
// time zone inside its sandbox, and daylight-saving gaps only exist in zones Korea lacks.

export const DAILY_REFRESH_MINUTES = 1440;
export interface RefreshSettings {
  enabled: boolean;
  intervalMinutes: typeof DAILY_REFRESH_MINUTES;
  anchorTime: string;
}

export function validRefreshTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Next local wall-clock slot after `now`: today's anchor if still ahead, otherwise tomorrow's.
 * A day whose anchor falls in a spring-forward gap has no slot, so the search runs one day
 * further; with a single daily slot, stopping at tomorrow would stall every scheduled read.
 */
export function nextRefreshAt(now: Date, settings: RefreshSettings): Date | null {
  if (!settings.enabled || !Number.isFinite(now.getTime()) || !validRefreshTime(settings.anchorTime)) return null;
  const [hour, minute] = settings.anchorTime.split(":").map(Number);
  const phase = (hour * 60 + minute) % settings.intervalMinutes;
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
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
