// Local routine reminders (O-R3 P2). Schedules ON-DEVICE notifications via
// expo-notifications - no push tokens, no server, $0. A reminder never leaves
// the device and fires from OUR app, so it does NOT sit behind the ops_push
// standing consent (that gate covers hand-offs to OTHER apps); the explicit
// button tap plus the OS notification permission prompt are the consent here.
//
// Native-only (G4: needs a dev/EAS build). Web keeps calendar-based paths.

let Notifications: typeof import("expo-notifications") = null as any;
try {
  Notifications = require("expo-notifications");
} catch {
  // Expo Go (SDK 53+) throws when requiring expo-notifications.
}

import type { OpsEventInput } from "./push";

export type ReminderResult = "scheduled" | "denied" | "unavailable" | "error";

const CHANNEL_ID = "ops-routines";

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

/** True when the native module is present AND we're on a native runtime. */
export function remindersSupported(): boolean {
  if (!isReactNativeRuntime()) return false;
  try {
    return typeof Notifications.scheduleNotificationAsync === "function";
  } catch {
    return false;
  }
}

// Android 8+ requires a channel; the call resolves to null elsewhere. Failure
// must not block scheduling (the OS falls back to the default channel).
async function ensureChannel(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Routines",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // best-effort
  }
}

/**
 * Schedules a local reminder for the recommendation: repeating at the item's
 * local wall-clock time for daily/weekly routines, one-shot otherwise.
 */
export async function scheduleRoutineReminder(input: OpsEventInput): Promise<ReminderResult> {
  if (!remindersSupported()) return "unavailable";
  const start = new Date(input.startsAtIso);
  if (Number.isNaN(start.getTime())) return "error";
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    await ensureChannel();
    const content = { title: input.title, body: input.description ?? null };
    if (input.recurrence === "daily") {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: start.getHours(),
          minute: start.getMinutes(),
          channelId: CHANNEL_ID,
        },
      });
      return "scheduled";
    }
    if (input.recurrence === "weekly") {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          // JS getDay() is 0=Sunday; the trigger wants 1=Sunday..7.
          weekday: start.getDay() + 1,
          hour: start.getHours(),
          minute: start.getMinutes(),
          channelId: CHANNEL_ID,
        },
      });
      return "scheduled";
    }
    // One-shot reminders in the past can never fire - surface it instead of
    // scheduling a notification that silently never arrives.
    if (start.getTime() <= Date.now()) return "error";
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: start,
        channelId: CHANNEL_ID,
      },
    });
    return "scheduled";
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ops] reminder scheduling failed", (e as Error).message);
    }
    return "error";
  }
}
