// Local routine reminders (O-R3 P2). Schedules ON-DEVICE notifications via
// expo-notifications - no push tokens, no server, $0. A reminder never leaves
// the device and fires from OUR app, so it does NOT sit behind the ops_push
// standing consent (that gate covers hand-offs to OTHER apps); the explicit
// button tap plus the OS notification permission prompt are the consent here.
//
// Native-only (G4: needs a dev/EAS build). Web keeps calendar-based paths.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications") as typeof import("expo-notifications");
} catch {
  // Expo Go (SDK 53+) throws when requiring expo-notifications.
  Notifications = null;
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
  if (!isReactNativeRuntime() || !Notifications) return false;
  try {
    return typeof Notifications.scheduleNotificationAsync === "function";
  } catch {
    return false;
  }
}

/**
 * Foreground presentation policy for OUR local notifications. expo-notifications
 * suppresses banners while the app is in the foreground UNLESS a handler is
 * registered, so the focus-timer "phase done" notifyNow (fired while the user is
 * on-screen) would otherwise never appear. Exported so the config shape is
 * unit-testable; the registration below is native-guarded (a no-op under jest/web
 * and Expo Go, where the runtime or the module member is absent).
 */
export async function foregroundNotificationBehavior() {
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  };
}

// Register once at module load, before any notifyNow / scheduled reminder can be
// delivered. Guarded like remindersSupported (native runtime + module present) and
// tolerant of a partial module (Expo Go / a test mock without setNotificationHandler).
if (Notifications && isReactNativeRuntime() && typeof Notifications.setNotificationHandler === "function") {
  try {
    Notifications.setNotificationHandler({ handleNotification: foregroundNotificationBehavior });
  } catch {
    // best-effort: scheduling still works, foreground banners just won't show
  }
}

// Android 8+ requires a channel; the call resolves to null elsewhere. Failure
// must not block scheduling (the OS falls back to the default channel).
async function ensureChannel(): Promise<void> {
  if (!Notifications) return;
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
 * Wave 1 (daily_focus): fire a one-shot local notification RIGHT NOW. Used by
 * the focus timer when a phase ends while running (focus done / break over).
 * Same native guard as scheduleRoutineReminder — it no-ops on web and Expo Go
 * (where the module is absent) and never adds a dependency. A null trigger means
 * "deliver immediately". Returns the same ReminderResult vocabulary.
 */
export async function notifyNow(title: string, body?: string): Promise<ReminderResult> {
  if (!remindersSupported() || !Notifications) return "unavailable";
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title, body: body ?? null },
      // null trigger = deliver immediately (the phase already ended).
      trigger: null,
    });
    return "scheduled";
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ops] notifyNow failed", (e as Error).message);
    }
    return "error";
  }
}

/**
 * Deterministic per-routine notification identifier, so enable/disable can
 * schedule AND cancel the same notification. Before this existed, every
 * schedule ran under a random OS id — nothing could ever cancel one, which is
 * how the /reminders toggles ended up flipping a flag for notifications that
 * either kept firing (off) or never existed (on).
 */
export function routineReminderId(routineId: string): string {
  return `ops-routine-${routineId}`;
}

/** Cancel the OS notification scheduled under this routine's identifier. */
export async function cancelRoutineReminder(routineId: string): Promise<void> {
  if (!remindersSupported() || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(routineReminderId(routineId));
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ops] reminder cancel failed", (e as Error).message);
    }
  }
}

/** Routine ids that have a LIVE scheduled OS notification (by identifier). */
export async function getScheduledRoutineIds(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!remindersSupported() || !Notifications) return out;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      const id = n.identifier ?? "";
      if (id.startsWith("ops-routine-")) out.add(id.slice("ops-routine-".length));
    }
  } catch {
    // best-effort: an unreadable schedule list reads as "nothing scheduled"
  }
  return out;
}

/**
 * Schedules a local reminder for the recommendation: repeating at the item's
 * local wall-clock time for daily/weekly routines, one-shot otherwise.
 * `opts.identifier` pins the OS notification id (routineReminderId) so a
 * re-schedule replaces the prior one and disable can cancel it.
 */
export async function scheduleRoutineReminder(
  input: OpsEventInput,
  opts?: { identifier?: string },
): Promise<ReminderResult> {
  if (!remindersSupported() || !Notifications) return "unavailable";
  const start = new Date(input.startsAtIso);
  if (Number.isNaN(start.getTime())) return "error";
  const withId = opts?.identifier ? { identifier: opts.identifier } : {};
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    await ensureChannel();
    const content = { title: input.title, body: input.description ?? null };
    if (input.recurrence === "daily") {
      await Notifications.scheduleNotificationAsync({
        ...withId,
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
        ...withId,
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
      ...withId,
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

/**
 * Request (or confirm) the OS notification permission WITHOUT scheduling a
 * notification — the [권한 켜기] button on the reminders screen calls this so the
 * user can grant the permission up front, separate from any actual reminder.
 *
 * Reads the current grant first (getPermissionsAsync); only fires the OS prompt
 * when the status is still 'undetermined', so a user who already decided isn't
 * re-prompted on every visit. Returns true only when granted.
 *
 * Web-guarded the same way device-calendar.ts guards (Platform.OS !== "web" plus
 * the native-module presence check): on web there is no OS notification
 * permission to request, so we skip and report false ("이 기기 불가").
 *
 * NOTE: a real OS grant can only be verified on a device/EAS build — Expo Go and
 * web both report unavailable. Device verification of the granted path is pending.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!remindersSupported() || !Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    // Only prompt when the user hasn't decided yet; a prior explicit deny is
    // respected (re-requesting a denied permission is a no-op on most OSes and
    // just nags the user — the row's "권한 필요" state covers that case).
    if (current.status === "undetermined" || current.canAskAgain) {
      const next = await Notifications.requestPermissionsAsync();
      return next.granted;
    }
    return false;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ops] notification permission request failed", (e as Error).message);
    }
    return false;
  }
}

// --- per-routine reminder on/off persistence ---------------------------
//
// A reminder is device-local (the notification never leaves this device — see
// the module header), so its on/off state belongs in device-local storage, not
// the owner-scoped ops_routines table. We persist the DISABLED set keyed by
// routine id in AsyncStorage (the same store github-link.ts uses for device-local
// state — no schema, no migration). Default = ON: a routine with a reminder_time
// is reminding unless the user explicitly turned it off here.

const DISABLED_KEY = "ops.reminders.disabled";

async function readDisabledSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISABLED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

async function writeDisabledSet(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(DISABLED_KEY, JSON.stringify([...ids]));
  } catch {
    /* best-effort — a failed write just means the toggle doesn't persist */
  }
}

/** True when this routine's reminder is ON (i.e. NOT in the disabled set). */
export async function isReminderEnabled(routineId: string): Promise<boolean> {
  const disabled = await readDisabledSet();
  return !disabled.has(routineId);
}

/** Map of routineId → enabled for the given ids (default ON), read in one pass. */
export async function getReminderStates(
  routineIds: readonly string[],
): Promise<Record<string, boolean>> {
  const disabled = await readDisabledSet();
  const out: Record<string, boolean> = {};
  for (const id of routineIds) out[id] = !disabled.has(id);
  return out;
}

/**
 * Turn this routine's reminder ON and persist it. Requests the OS permission
 * first (propose->ratify: the tap is the user action); when permission is
 * denied the state is NOT flipped on, so the caller can show "권한 필요" and the
 * row stays off. Returns true only when the reminder is now enabled.
 *
 * When `event` is given, enabling ALSO schedules the OS notification under the
 * routine's deterministic identifier. The flag alone used to be the whole
 * implementation — the row said ON while no OS notification existed (audit:
 * /reminders mismatch).
 */
export async function enableReminder(routineId: string, event?: OpsEventInput): Promise<boolean> {
  const granted = await ensureNotificationPermission();
  if (!granted) return false;
  const disabled = await readDisabledSet();
  if (disabled.delete(routineId)) await writeDisabledSet(disabled);
  if (event) {
    await scheduleRoutineReminder(event, { identifier: routineReminderId(routineId) });
  }
  return true;
}

/**
 * Turn this routine's reminder OFF and persist it. Always succeeds. Also
 * cancels the scheduled OS notification — before, an already-scheduled
 * reminder kept firing after the row was switched off.
 */
export async function disableReminder(routineId: string): Promise<void> {
  const disabled = await readDisabledSet();
  if (!disabled.has(routineId)) {
    disabled.add(routineId);
    await writeDisabledSet(disabled);
  }
  await cancelRoutineReminder(routineId);
}
