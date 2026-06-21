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
// Native-only (needs a dev/EAS build); web and Expo Go no-op cleanly.

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications") as typeof import("expo-notifications");
} catch {
  // Expo Go (SDK 53+) throws when requiring expo-notifications.
  Notifications = null;
}

export type DailyReviewResult = "scheduled" | "cancelled" | "denied" | "unavailable" | "error";

const CHANNEL_ID = "daily-review";
// A stable identifier so we cancel EXACTLY this reminder when the user turns it
// off (or re-schedule without stacking duplicates), never touching the user's
// /ops routine reminders, which schedule under their own ids.
const DAILY_REVIEW_ID = "daily-review-reminder";

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

/**
 * Schedule (or re-schedule) the opt-in daily review reminder at a local
 * wall-clock time. Cancels any prior instance first so re-enabling never stacks
 * duplicates. Returns the same vocabulary as ops/reminders.
 */
export async function scheduleDailyReview(
  hour: number,
  minute: number,
  title: string,
  body?: string,
): Promise<DailyReviewResult> {
  if (!dailyReviewSupported() || !Notifications) return "unavailable";
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return "error";
  }
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    await ensureChannel();
    // Clear any prior instance so a re-enable never schedules a second copy.
    try {
      await Notifications.cancelScheduledNotificationAsync(DAILY_REVIEW_ID);
    } catch {
      // none scheduled yet — fine
    }
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REVIEW_ID,
      content: { title, body: body ?? null },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
    return "scheduled";
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[daily-review] schedule failed", (e as Error).message);
    }
    return "error";
  }
}

/** Turn the daily review reminder off (cancel exactly our scheduled instance). */
export async function cancelDailyReview(): Promise<DailyReviewResult> {
  if (!dailyReviewSupported() || !Notifications) return "unavailable";
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REVIEW_ID);
    return "cancelled";
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[daily-review] cancel failed", (e as Error).message);
    }
    return "error";
  }
}

// ─── Opt-in flag persistence (mirrors src/lib/settings/readable-font.ts) ──────
// The toggle's on/off state is a local preference; the actual schedule lives in
// the OS. OFF by default for everyone.
const ENABLED_KEY = "ops.dailyReview.enabled.v1";

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

/** Read the persisted opt-in flag. Web reads synchronously; native resolves via
 *  AsyncStorage. Defaults to false (OFF) everywhere. */
export async function loadDailyReviewEnabled(): Promise<boolean> {
  const local = ls();
  if (local) return local.getItem(ENABLED_KEY) === "true";
  const storage = nativeStorage();
  if (!storage) return false;
  try {
    return (await storage.getItem(ENABLED_KEY)) === "true";
  } catch {
    return false;
  }
}

/** Persist the opt-in flag (best-effort on every backend present). */
export function setDailyReviewEnabledPref(on: boolean): void {
  const value = on ? "true" : "false";
  ls()?.setItem(ENABLED_KEY, value);
  const storage = nativeStorage();
  if (storage) void storage.setItem(ENABLED_KEY, value).catch(() => undefined);
}
