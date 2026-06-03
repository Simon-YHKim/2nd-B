// Compute the current daily-capture streak from a list of records.
//
// "Streak" = the count of consecutive days (KST-anchored, same as
// chat_usage) ending today (or yesterday if no entry today yet) on which
// at least one record was created. Breaks on the first missing day.
//
// Pure function — caller passes the ISO timestamps of created records.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDayKey(iso: string): string {
  // new Date(iso).getTime() is absolute epoch ms (timezone-independent), so to
  // read the KST wall-clock day we add +9h and take the UTC parts. The previous
  // version also added the *device* timezone offset, which made the day boundary
  // wrong on any non-UTC device (it silently used UTC days for Korean users). CI
  // runs in UTC, so the bug was invisible there.
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayKst(now: Date = new Date()): string {
  return kstDayKey(now.toISOString());
}

function dayBefore(key: string): string {
  // Treat key as a UTC date — subtracting 24h gives the previous day.
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export interface StreakResult {
  /** Number of consecutive days with at least one record, ending at the
   *  most recent capture day (today or yesterday). 0 when nothing recent. */
  current: number;
  /** Day key (YYYY-MM-DD KST) of the most recent capture, null when empty. */
  lastCaptureDay: string | null;
  /** True when today has at least one capture (streak is "live"). */
  capturedToday: boolean;
}

export function computeStreak(timestamps: string[], now: Date = new Date()): StreakResult {
  if (timestamps.length === 0) {
    return { current: 0, lastCaptureDay: null, capturedToday: false };
  }

  const days = new Set<string>();
  for (const ts of timestamps) days.add(kstDayKey(ts));

  const today = todayKst(now);
  const capturedToday = days.has(today);

  // Start counting from today (if captured) or yesterday (if not).
  let cursor = capturedToday ? today : dayBefore(today);
  let lastCaptureDay: string | null = null;
  let streak = 0;

  while (days.has(cursor)) {
    if (lastCaptureDay === null) lastCaptureDay = cursor;
    streak += 1;
    cursor = dayBefore(cursor);
  }

  return { current: streak, lastCaptureDay, capturedToday };
}
