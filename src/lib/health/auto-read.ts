// Automatic health read (Simon 2026-09-30, /data-connections: "핸드폰 권한을 얻어야 하는것은
// 권한을 부여해서 작업할수 있게 한다 … 자동으로 읽어낼수 있게 셋팅하자").
//
// Once a day, after the chosen automatic-refresh time, while the installed app is in the
// foreground: read the phone's health records into the signed-in adult's account through the
// single choke point (ingestHealthSamples). Every other case is a quiet skip, and no path
// ever asks for anything:
//
//   - a minor or an unconfirmed age          never reads (the gate does not wait for a read)
//   - automatic refresh switched off          never reads (the user's own "off")
//   - not armed on this phone                 never reads. The OS grant belongs to the app on
//                                             the phone, not to an account, so another adult
//                                             who signs in here must not inherit it. An
//                                             account arms itself by tapping '오늘 반영' and
//                                             allowing access on this phone (armHealthAutoRead).
//   - not due since the last attempt          waits for the next daily slot
//   - no source that reads without asking     skips (web; iOS until its adapter is fixed)
//   - no consent on the server                skips
//   - nothing granted in the OS any more      skips. It NEVER asks: opening the app must not
//                                             raise a permission prompt.
//
// Steps, workouts and sleep only (AUTO_READ_METRICS). Heart rate is one row per reading,
// thousands a day; nothing uses the raw readings, and they would push sleep out of the
// recent-samples views every morning. The '오늘 반영' tap still reads it.
//
// Two dates per account and phone. `attempted` is the daily gate and moves on every outcome,
// skips included. `readThrough` is where the next window starts and moves only after a read
// that got every granted metric in full: a failed page, or a read cut off because the app
// left the foreground (Health Connect refuses background reads), leaves it where it was, so
// the next read covers the gap again. The window starts at the beginning of that day
// (yesterday at the latest, AUTO_READ_CATCH_UP_DAYS back at the earliest) and ends now. The
// overlap is deliberate: watches sync late, and records reach Health Connect hours after
// the time they describe. The upsert is idempotent, so the overlap adds nothing twice.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { runAccountLocalMutation } from "../account/local-deletion-fence";
import { nextRefreshAt, shouldRefreshAfterResume, type RefreshSettings } from "../dashboard/refresh-schedule";
import type { HealthMetricType, HealthReadRange, HealthSample, HealthSource } from "./HealthSource";
import type { IngestOptions, IngestResult } from "./ingest";

export type AutoReadResult =
  | "skipped:minor"
  | "skipped:off"
  | "skipped:not-armed"
  | "skipped:not-due"
  | "skipped:unavailable"
  | "skipped:no-consent"
  | "skipped:no-permission"
  | "empty"
  | "partial"
  | "ingested";

/** Per account and phone (AsyncStorage). */
export interface AutoReadMarks {
  /** When this account connected health on this phone ('오늘 반영' with the OS grant). */
  armed: Date | null;
  /** The last run that reached an outcome, skips included: the daily gate. */
  attempted: Date | null;
  /** The end of the last read that got every granted metric in full: the next window's anchor. */
  readThrough: Date | null;
}

export interface AutoReadDeps {
  now(): Date;
  loadSettings(ownerId: string): Promise<RefreshSettings>;
  loadMarks(ownerId: string): Promise<AutoReadMarks>;
  /** Records a finished run: always the attempt, and the read's end only when it was complete. */
  markRun(ownerId: string, attempted: Date, readThrough: Date | null): Promise<void>;
  consented(ownerId: string): Promise<boolean>;
  sources(): HealthSource[];
  ingest(ownerId: string, samples: HealthSample[], opts: IngestOptions): Promise<IngestResult>;
  /** Throws when the run must stop (another account, app left the foreground, deadline). */
  assertCurrent(): void;
}

export const AUTO_READ_METRICS: readonly HealthMetricType[] = ["steps", "workout", "sleep"];
/** How far back a read reaches after the app was not opened for a few days. */
export const AUTO_READ_CATCH_UP_DAYS = 3;
/** Samples per ingest call: bounds each upsert request and the rows it sends back. */
export const AUTO_READ_CHUNK = 1000;

function startOfLocalDay(at: Date): Date {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  return start;
}

function localDaysBefore(day: Date, days: number): Date {
  const earlier = new Date(day);
  earlier.setDate(earlier.getDate() - days);
  return startOfLocalDay(earlier);
}

/** A stored date later than now means the clock was moved back: it is not trusted. */
function notAfter(at: Date | null, now: Date): Date | null {
  return at && at.getTime() <= now.getTime() ? at : null;
}

/** From the start of readThrough's day, clamped to [catch-up floor, yesterday], until now. */
export function autoReadWindow(now: Date, readThrough: Date | null): HealthReadRange {
  const today = startOfLocalDay(now);
  const yesterday = localDaysBefore(today, 1);
  const floor = localDaysBefore(today, AUTO_READ_CATCH_UP_DAYS);
  let start = yesterday;
  if (readThrough && readThrough.getTime() < yesterday.getTime()) {
    const day = startOfLocalDay(readThrough);
    start = day.getTime() < floor.getTime() ? floor : day;
  }
  return { startIso: start.toISOString(), endIso: now.toISOString() };
}

export async function autoReadHealth(
  ownerId: string,
  isMinor: boolean | null,
  deps: AutoReadDeps,
): Promise<AutoReadResult> {
  if (isMinor !== false) return "skipped:minor";
  const settings = await deps.loadSettings(ownerId);
  deps.assertCurrent();
  if (!settings.enabled) return "skipped:off";
  const marks = await deps.loadMarks(ownerId);
  deps.assertCurrent();
  if (!marks.armed) return "skipped:not-armed";
  const now = deps.now();
  // Trusting a date from the future would stop every read until the clock caught up with it.
  const attempted = notAfter(marks.attempted, now);
  if (attempted && !shouldRefreshAfterResume(attempted, now, settings)) return "skipped:not-due";

  const native = deps.sources().find((source) => typeof source.readGranted === "function");
  if (!native?.readGranted) {
    await deps.markRun(ownerId, now, null);
    return "skipped:unavailable";
  }
  const consented = await deps.consented(ownerId);
  deps.assertCurrent();
  if (!consented) {
    await deps.markRun(ownerId, now, null);
    return "skipped:no-consent";
  }
  const read = await native.readGranted(autoReadWindow(now, notAfter(marks.readThrough, now)), AUTO_READ_METRICS);
  deps.assertCurrent();
  if (read === null) {
    await deps.markRun(ownerId, now, null);
    return "skipped:no-permission";
  }
  for (let from = 0; from < read.samples.length; from += AUTO_READ_CHUNK) {
    await deps.ingest(ownerId, read.samples.slice(from, from + AUTO_READ_CHUNK), { isMinor, pref: true });
    deps.assertCurrent();
  }
  await deps.markRun(ownerId, now, read.complete ? now : null);
  if (!read.complete) return "partial";
  return read.samples.length === 0 ? "empty" : "ingested";
}

/**
 * When the runner should look again while the app stays open: the next daily slot, or never
 * when automatic refresh is off or this phone is not armed for the account.
 */
export async function nextAutoReadCheck(
  ownerId: string,
  deps: Pick<AutoReadDeps, "now" | "loadSettings" | "loadMarks">,
): Promise<Date | null> {
  const settings = await deps.loadSettings(ownerId);
  if (!settings.enabled) return null;
  const marks = await deps.loadMarks(ownerId);
  return marks.armed ? nextRefreshAt(deps.now(), settings) : null;
}

// ── Per-account marks on this phone ──

const ARMED = "health.autoread.armed.v1:";
const ATTEMPTED = "health.autoread.attempted.v1:";
const READ_THROUGH = "health.autoread.through.v1:";

async function readDate(key: string): Promise<Date | null> {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value === null) return null;
    const at = new Date(value);
    return Number.isFinite(at.getTime()) ? at : null;
  } catch {
    return null;
  }
}

export async function loadAutoReadMarks(ownerId: string): Promise<AutoReadMarks> {
  const [armed, attempted, readThrough] = await Promise.all([
    readDate(ARMED + ownerId),
    readDate(ATTEMPTED + ownerId),
    readDate(READ_THROUGH + ownerId),
  ]);
  return { armed, attempted, readThrough };
}

export async function markAutoReadRun(ownerId: string, attempted: Date, readThrough: Date | null): Promise<void> {
  // A deletion in progress fences this owner's local writes; the marks must not outlive it.
  await runAccountLocalMutation(ownerId, async () => {
    await AsyncStorage.setItem(ATTEMPTED + ownerId, attempted.toISOString());
    if (readThrough) await AsyncStorage.setItem(READ_THROUGH + ownerId, readThrough.toISOString());
  });
}

/**
 * Called by the '오늘 반영' tap once the OS grant is given: from then on the automatic read
 * may read health on this phone for this account. True when the mark was written.
 */
export async function armHealthAutoRead(ownerId: string, at: Date = new Date()): Promise<boolean> {
  try {
    const result = await runAccountLocalMutation(ownerId, () => AsyncStorage.setItem(ARMED + ownerId, at.toISOString()));
    return result.executed;
  } catch {
    return false;
  }
}

/**
 * Forgets that this account connected health on this phone, when the consent is turned off.
 * Turning it on again then needs the explicit '오늘 반영' tap before the automatic read
 * resumes, instead of picking up silently from the old mark. True when all marks are gone.
 */
export async function forgetHealthAutoReadMarks(ownerId: string): Promise<boolean> {
  return clearAutoReadMarks(ownerId);
}

/** Local purge after terminal account deletion (lib/account/local-purge.ts). */
export async function purgeHealthAutoReadForDeletedAccount(ownerId: string): Promise<boolean> {
  return clearAutoReadMarks(ownerId);
}

async function clearAutoReadMarks(ownerId: string): Promise<boolean> {
  const owner = ownerId.trim();
  if (!owner) return false;
  const keys = [ARMED + owner, ATTEMPTED + owner, READ_THROUGH + owner];
  try {
    for (const key of keys) await AsyncStorage.removeItem(key);
    const left = await Promise.all(keys.map((key) => AsyncStorage.getItem(key)));
    return left.every((value) => value === null);
  } catch {
    return false;
  }
}
