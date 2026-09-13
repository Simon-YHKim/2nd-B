// Opt-in daily-review reminder ("오늘의 정리"). D-25 Phase 3, the morning-brief
// "scheduler" in its anti-companion-safe form: a USER-INITIATED, on-device local
// notification (expo-notifications). The user turns it on themselves and the OS
// permission prompt is the consent — the same model as ops/reminders.ts. It is
// NOT an app-initiated re-engagement push: there is no server, no push token, no
// remote trigger, and it is OFF by default. (The app-initiated / server-push form
// is intentionally NOT built — a daily re-engagement push that the app sends on
// its own is the companion pattern D-19 fights. A reminder the user sets for
// themselves, like an alarm, is a tool, not a hook.)
//
// Native-only (needs a dev/EAS build); web and Expo Go no-op cleanly. The SDK
// is reached ONLY through ./notifications-sdk (its .web.ts variant answers
// null), so the web bundle never carries expo-notifications (audit D5-11).

import { loadNotifications } from "./notifications-sdk";
import {
  captureAccountOwnerLease,
  type AccountOwnerLease,
} from "../auth/account-epoch";
import { runLocalNotificationMutation } from "./notification-mutation";
import {
  accountNotificationStorageKey,
  dailyReviewNotificationId,
  notificationPrivacyData,
} from "./notification-identity";

// null on web / Expo Go (SDK 53+ throws on require) -- every entry point below
// reports "unavailable" in that case.
const Notifications = loadNotifications();

export type DailyReviewResult = "scheduled" | "cancelled" | "denied" | "unavailable" | "error";

const CHANNEL_ID = "daily-review";
const NOTIFICATION_MUTATION_TIMEOUT_MS = 5_000;
class DailyReviewMutationTimeoutError extends Error {}
function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

/** True when the native module is present AND we're on a native runtime. */
export function dailyReviewSupported(): boolean {
  if (!isReactNativeRuntime() || !Notifications) return false;
  try {
    return typeof Notifications.scheduleNotificationAsync === "function";
  } catch {
    return false;
  }
}

// Android 8+ requires a channel; failure must not block scheduling (the OS falls
// back to the default channel).
async function ensureChannel(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Daily review",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // best-effort
  }
}

async function withinMutationTimeout<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DailyReviewMutationTimeoutError("Daily-review notification mutation timed out.")),
          NOTIFICATION_MUTATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

type DailyCancelResult = "cancelled" | "failed" | "timed-out";

async function cancelDailyIdentifier(identifier: string): Promise<DailyCancelResult> {
  if (!Notifications) return "failed";
  try {
    await withinMutationTimeout(
      () => Notifications.cancelScheduledNotificationAsync(identifier),
    );
    return "cancelled";
  } catch (error) {
    return error instanceof DailyReviewMutationTimeoutError ? "timed-out" : "failed";
  }
}

function queueLateDailyScheduleCancellation(
  scheduled: Promise<unknown>,
  identifier: string,
): void {
  void scheduled.then(
    () => runLocalNotificationMutation(async () => {
      await cancelDailyIdentifier(identifier);
    }),
    () => undefined,
  );
}

async function scheduleDailyWithLease(
  lease: AccountOwnerLease,
  identifier: string,
  request: Parameters<NonNullable<typeof Notifications>["scheduleNotificationAsync"]>[0],
): Promise<DailyReviewResult> {
  if (!Notifications) return "unavailable";
  return runLocalNotificationMutation(async () => {
    if (!lease.isCurrent()) return "error";
    // Clear any prior instance so a re-enable never schedules a second copy.
    // Unknown/missing prior ids are harmless; scheduling the same stable id is
    // still the authoritative replacement. Ownership, not cancel success, is
    // the security gate here.
    const priorCancellation = await cancelDailyIdentifier(identifier);
    if (priorCancellation === "timed-out") return "error";
    if (!lease.isCurrent()) return "error";

    let scheduled: Promise<unknown>;
    try {
      scheduled = Notifications.scheduleNotificationAsync(request);
    } catch {
      return "error";
    }
    try {
      await withinMutationTimeout(() => scheduled);
    } catch {
      queueLateDailyScheduleCancellation(scheduled, identifier);
      return "error";
    }
    if (!lease.isCurrent()) {
      await cancelDailyIdentifier(identifier);
      return "error";
    }
    return "scheduled";
  });
}

/**
 * Schedule (or re-schedule) the opt-in daily review reminder at a local
 * wall-clock time. Cancels any prior instance first so re-enabling never stacks
 * duplicates. Returns the same vocabulary as ops/reminders.
 */
export async function scheduleDailyReview(
  ownerId: string,
  hour: number,
  minute: number,
  title: string,
  body?: string,
): Promise<DailyReviewResult> {
  if (!dailyReviewSupported() || !Notifications) return "unavailable";
  if (!ownerId) return "error";
  const lease = captureAccountOwnerLease(ownerId);
  if (!lease) return "error";
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return "error";
  }
  try {
    const identifier = dailyReviewNotificationId(ownerId);
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    if (!lease.isCurrent()) return "error";
    await ensureChannel();
    if (!lease.isCurrent()) return "error";
    return await scheduleDailyWithLease(lease, identifier, {
      identifier,
      content: {
        title,
        body: body ?? null,
        data: notificationPrivacyData(ownerId),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    if (typeof console !== "undefined") {
      console.warn("[daily-review] schedule failed");
    }
    return "error";
  }
}

/** Turn the daily review reminder off (cancel exactly our scheduled instance). */
export async function cancelDailyReview(ownerId: string): Promise<DailyReviewResult> {
  if (!dailyReviewSupported() || !Notifications) return "unavailable";
  if (!ownerId) return "error";
  const lease = captureAccountOwnerLease(ownerId);
  if (!lease) return "error";
  try {
    const identifier = dailyReviewNotificationId(ownerId);
    return await runLocalNotificationMutation(async () => {
      if (!lease.isCurrent()) return "error";
      const cancelled = await cancelDailyIdentifier(identifier);
      if (cancelled !== "cancelled" || !lease.isCurrent()) return "error";
      return "cancelled";
    });
  } catch {
    if (typeof console !== "undefined") {
      console.warn("[daily-review] cancel failed");
    }
    return "error";
  }
}

// ─── Opt-in flag persistence (mirrors src/lib/settings/readable-font.ts) ──────
// The toggle's on/off state is a local preference; the actual schedule lives in
// the OS. OFF by default for everyone.
function enabledKey(ownerId: string): string {
  return accountNotificationStorageKey(ownerId, "daily-review-enabled");
}

// 알림 시각 (Simon 결정 B3, 2026-08-20).
//
// 지금까지 `digest.tsx` 가 `scheduleDailyReview(9, 0, ...)` 로 **09:00 을 하드코딩**
// 했다. 이 함수는 처음부터 임의 시각을 받고 0-23 / 0-59 검증도 했는데, 화면이 9시만
// 넘겼다. 9시가 안 맞는 사람에게 알림은 도움이 아니라 방해다.
//
// 시각만 저장한다(분은 정시 고정). 분 단위까지 고르게 하면 고르는 비용이 얻는 것보다
// 크고, 이 알림은 "오늘 한 번 들여다보라" 는 신호지 일정이 아니다.
function hourKey(ownerId: string): string {
  return accountNotificationStorageKey(ownerId, "daily-review-hour");
}

/** 화면이 보여줄 선택지. 아침·점심·저녁 리듬에 맞춰 고른 7개. */
export const DAILY_REVIEW_HOURS: readonly number[] = [7, 8, 9, 12, 18, 21, 22];

export const DEFAULT_DAILY_REVIEW_HOUR = 9;

/** 저장된 값이 깨졌거나 없으면 기본값. 알림 시각 때문에 화면이 막히면 안 된다. */
function normalizeHour(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return DAILY_REVIEW_HOURS.includes(n) ? n : DEFAULT_DAILY_REVIEW_HOUR;
}

export async function loadDailyReviewHour(ownerId: string): Promise<number> {
  const key = hourKey(ownerId);
  const local = ls();
  if (local) return normalizeHour(local.getItem(key));
  const storage = nativeStorage();
  if (!storage) return DEFAULT_DAILY_REVIEW_HOUR;
  try {
    return normalizeHour(await storage.getItem(key));
  } catch {
    return DEFAULT_DAILY_REVIEW_HOUR;
  }
}

export function setDailyReviewHourPref(ownerId: string, hour: number): Promise<boolean> {
  const value = String(DAILY_REVIEW_HOURS.includes(hour) ? hour : DEFAULT_DAILY_REVIEW_HOUR);
  return persistDailyReviewPref(ownerId, hourKey(ownerId), value);
}

/** "09:00" - 로케일 분기가 필요 없는 표기. 오전/오후 표현은 언어마다 갈린다. */
export function formatDailyReviewHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native: fall through
  }
  return null;
}

function nativeStorage(): AsyncStorageLike | null {
  if (!isReactNativeRuntime()) return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

async function persistDailyReviewPref(
  ownerId: string,
  key: string,
  value: string,
): Promise<boolean> {
  const lease = captureAccountOwnerLease(ownerId);
  if (!lease) return false;
  return runLocalNotificationMutation(async () => {
    if (!lease.isCurrent()) return false;
    try {
      ls()?.setItem(key, value);
    } catch {
      // Best-effort storage remains the existing UX contract.
    }
    const storage = nativeStorage();
    if (storage) {
      try {
        await storage.setItem(key, value);
      } catch {
        // Best-effort storage remains the existing UX contract.
      }
    }
    // If ownership changed during the native write, account cleanup is queued
    // behind this mutation and removes the just-written A key before B publishes.
    return lease.isCurrent();
  });
}

/** Read the persisted opt-in flag. Web reads synchronously; native resolves via
 *  AsyncStorage. Defaults to false (OFF) everywhere. */
export async function loadDailyReviewEnabled(ownerId: string): Promise<boolean> {
  const key = enabledKey(ownerId);
  const local = ls();
  if (local) return local.getItem(key) === "true";
  const storage = nativeStorage();
  if (!storage) return false;
  try {
    return (await storage.getItem(key)) === "true";
  } catch {
    return false;
  }
}

/** Persist the opt-in flag (best-effort on every backend present). */
export function setDailyReviewEnabledPref(ownerId: string, on: boolean): Promise<boolean> {
  const value = on ? "true" : "false";
  return persistDailyReviewPref(ownerId, enabledKey(ownerId), value);
}
