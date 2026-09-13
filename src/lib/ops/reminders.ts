// Local routine reminders (O-R3 P2). Schedules ON-DEVICE notifications via
// expo-notifications - no push tokens, no server, $0. A reminder never leaves
// the device and fires from OUR app, so it does NOT sit behind the ops_push
// standing consent (that gate covers hand-offs to OTHER apps); the explicit
// button tap plus the OS notification permission prompt are the consent here.
//
// Native-only (G4: needs a dev/EAS build). Web keeps calendar-based paths.
//
// The SDK itself is reached ONLY through ./notifications-sdk (its .web.ts
// variant answers null), so the web bundle never carries expo-notifications
// while this module's scheduling logic stays single-sourced (audit D5-11).

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { currentResolvedAccountOwner } from "../auth/account-epoch";
import { loadNotifications } from "./notifications-sdk";
import {
  accountNotificationStorageKey,
  isNotificationOwnedBy,
  isPrivacySafeNotificationRequest,
  notificationPrivacyData,
  oneShotNotificationId,
  routineIdFromNotification,
  routineNotificationId,
} from "./notification-identity";
import type { OpsEventInput } from "./push";

// null on web / Expo Go (SDK 53+ throws on require) -- every entry point below
// reports "unavailable" in that case.
const Notifications = loadNotifications();

export type ReminderResult = "scheduled" | "denied" | "unavailable" | "error";

const CHANNEL_ID = "ops-routines";
const ROUTINE_NOTIFICATION_CONTENT = {
  title: "2nd Brain",
  body: "Open the app to view your routine.",
} as const;
const FOCUS_NOTIFICATION_CONTENT = {
  title: "2nd Brain",
  body: "Open the app to view your completed timer.",
} as const;
const NOTIFICATION_PRIVACY_MIGRATION_KEY = "ops.notifications.privacyMigration.v2";
const LEGACY_ACCOUNT_LOCAL_NOTIFICATION_KEYS = [
  "ops.reminders.disabled",
  "ops.dailyReview.enabled.v1",
  "ops.dailyReview.hour.v1",
] as const;
const DEFAULT_CLEANUP_TIMEOUT_MS = 5_000;

export class AccountScopedNotificationCleanupError extends Error {
  readonly failureCount: number;

  constructor(failureCount: number) {
    super("Account-scoped local notification cleanup failed.");
    this.name = "AccountScopedNotificationCleanupError";
    this.failureCount = failureCount;
  }
}

export class NotificationPrivacyMigrationError extends Error {
  readonly failureCount: number;

  constructor(failureCount: number) {
    super("Local notification privacy migration failed.");
    this.name = "NotificationPrivacyMigrationError";
    this.failureCount = failureCount;
  }
}

export interface AccountNotificationCleanupOptions {
  /** Additional synchronous identity fence checked immediately before mutation. */
  isCurrentOwner?: () => boolean;
  /** Test seam; production uses a bounded five-second native call budget. */
  timeoutMs?: number;
}

function operationTimeoutMs(options?: AccountNotificationCleanupOptions): number {
  const configured = options?.timeoutMs;
  return typeof configured === "number" && Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_CLEANUP_TIMEOUT_MS;
}

async function withinOperationTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Local notification operation timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function ownerLeaseIsCurrent(options?: AccountNotificationCleanupOptions): boolean {
  try {
    return options?.isCurrentOwner?.() !== false;
  } catch {
    return false;
  }
}

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
export async function notifyNow(ownerId: string, title: string, body?: string): Promise<ReminderResult>;
export async function notifyNow(title: string, body?: string): Promise<ReminderResult>;
export async function notifyNow(first: string, _second?: string, third?: string): Promise<ReminderResult> {
  if (!remindersSupported() || !Notifications) return "unavailable";
  const publishedOwner = currentResolvedAccountOwner();
  const explicitOwner = third !== undefined || first === publishedOwner;
  const ownerId = explicitOwner ? first : publishedOwner;
  if (!ownerId) return "error";
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: oneShotNotificationId(ownerId),
      content: {
        ...FOCUS_NOTIFICATION_CONTENT,
        data: notificationPrivacyData(ownerId),
      },
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
export function routineReminderId(ownerId: string, routineId: string): string {
  const identifier = routineNotificationId(ownerId, routineId);
  if (!identifier) throw new Error("Invalid routine reminder identifier.");
  return identifier;
}

/** Cancel the OS notification scheduled under this routine's identifier. */
export async function cancelRoutineReminder(ownerId: string, routineId: string): Promise<void> {
  if (!remindersSupported() || !Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(routineReminderId(ownerId, routineId));
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[ops] reminder cancel failed", (e as Error).message);
    }
  }
}

/** Routine ids that have a LIVE scheduled OS notification (by identifier). */
export async function getScheduledRoutineIds(ownerId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!remindersSupported() || !Notifications) return out;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      const routineId = routineIdFromNotification(n.identifier ?? "", ownerId);
      if (routineId) out.add(routineId);
    }
  } catch {
    // best-effort: an unreadable schedule list reads as "nothing scheduled"
  }
  return out;
}

let privacyMigrationInFlight: Promise<void> | null = null;

async function runLegacyRoutineNotificationMigration(
  options?: AccountNotificationCleanupOptions,
): Promise<void> {
  if (!isReactNativeRuntime()) return;
  if (!Notifications) throw new NotificationPrivacyMigrationError(1);
  const timeoutMs = operationTimeoutMs(options);

  try {
    const completed = await withinOperationTimeout(
      () => AsyncStorage.getItem(NOTIFICATION_PRIVACY_MIGRATION_KEY),
      timeoutMs,
    );
    if (completed === "1") return;
  } catch {
    // A marker read must not preserve legacy lock-screen content. Continue and
    // retry the idempotent scan; only a fully successful pass writes the marker.
  }

  const [scheduledResult, presentedResult] = await Promise.allSettled([
    withinOperationTimeout(() => Notifications.getAllScheduledNotificationsAsync(), timeoutMs),
    withinOperationTimeout(() => Notifications.getPresentedNotificationsAsync(), timeoutMs),
  ]);
  if (scheduledResult.status === "rejected" || presentedResult.status === "rejected") {
    throw new NotificationPrivacyMigrationError(
      Number(scheduledResult.status === "rejected") + Number(presentedResult.status === "rejected"),
    );
  }

  // v1 only removed random recurring ids. Base-era one-shots and even the old
  // stable ops-routine-* ids could still contain personal lock-screen copy. v2
  // preserves only identifiers that this generation can issue with generic copy.
  const legacyScheduledIds = [...new Set(scheduledResult.value
    .filter((notification) => !isPrivacySafeNotificationRequest(notification))
    .map((notification) => notification.identifier ?? "")
    .filter(Boolean))];
  const legacyPresentedIds = [...new Set(presentedResult.value
    .filter((notification) => !isPrivacySafeNotificationRequest(notification.request))
    .map((notification) => notification.request.identifier ?? "")
    .filter(Boolean))];
  const operations: Array<Promise<unknown>> = [
    ...legacyScheduledIds.map((identifier) => withinOperationTimeout(
      () => Notifications.cancelScheduledNotificationAsync(identifier),
      timeoutMs,
    )),
    ...legacyPresentedIds.map((identifier) => withinOperationTimeout(
      () => Notifications.dismissNotificationAsync(identifier),
      timeoutMs,
    )),
    ...LEGACY_ACCOUNT_LOCAL_NOTIFICATION_KEYS.map((key) => withinOperationTimeout(
      () => AsyncStorage.removeItem(key),
      timeoutMs,
    )),
  ];

  // These synchronous APIs make the read+conditional-clear one atomic JS turn.
  // The async deprecated pair could clear a newer B response after yielding.
  try {
    const response = Notifications.getLastNotificationResponse();
    if (response && !isPrivacySafeNotificationRequest(response.notification.request)) {
      Notifications.clearLastNotificationResponse();
    }
  } catch {
    operations.push(Promise.reject(new Error("Last notification response cleanup failed.")));
  }

  const cancellationResults = await Promise.allSettled(operations);
  const failureCount = cancellationResults.filter((result) => result.status === "rejected").length;
  if (failureCount > 0) throw new NotificationPrivacyMigrationError(failureCount);

  try {
    await withinOperationTimeout(
      () => AsyncStorage.setItem(NOTIFICATION_PRIVACY_MIGRATION_KEY, "1"),
      timeoutMs,
    );
  } catch {
    throw new NotificationPrivacyMigrationError(1);
  }
}

/**
 * One-time upgrade migration for every pre-v2 notification surface. Old builds
 * put personal content in random one-shots and both random/stable recurring
 * identifiers. Only the explicit privacy-safe v2 generation is preserved.
 */
export function migrateLegacyRoutineNotifications(
  options?: AccountNotificationCleanupOptions,
): Promise<void> {
  if (privacyMigrationInFlight) return privacyMigrationInFlight;
  const run = runLegacyRoutineNotificationMigration(options);
  privacyMigrationInFlight = run;
  void run.then(
    () => { if (privacyMigrationInFlight === run) privacyMigrationInFlight = null; },
    () => { if (privacyMigrationInFlight === run) privacyMigrationInFlight = null; },
  );
  return run;
}

/**
 * Schedules a local reminder for the recommendation: repeating at the item's
 * local wall-clock time for daily/weekly routines, one-shot otherwise.
 * `opts.identifier` pins the OS notification id (routineReminderId) so a
 * re-schedule replaces the prior one and disable can cancel it.
 */
export async function scheduleRoutineReminder(
  input: OpsEventInput,
  opts?: { ownerId?: string; identifier?: string },
): Promise<ReminderResult> {
  if (!remindersSupported() || !Notifications) return "unavailable";
  const ownerId = opts?.ownerId ?? currentResolvedAccountOwner();
  if (!ownerId) return "error";
  const start = new Date(input.startsAtIso);
  if (Number.isNaN(start.getTime())) return "error";
  if (
    (input.recurrence === "daily" || input.recurrence === "weekly")
    && (!opts?.identifier || !isNotificationOwnedBy(opts.identifier, ownerId))
  ) return "error";
  if (opts?.identifier && !isNotificationOwnedBy(opts.identifier, ownerId)) return "error";
  const withId = { identifier: opts?.identifier ?? oneShotNotificationId(ownerId) };
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    await ensureChannel();
    // Lock-screen notifications are an OS-visible boundary. Keep personal
    // routine titles/reasons inside the app even when the device is locked.
    const content = {
      ...ROUTINE_NOTIFICATION_CONTENT,
      data: notificationPrivacyData(ownerId),
    };
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

function disabledKey(ownerId: string): string {
  return accountNotificationStorageKey(ownerId, "reminders-disabled");
}

/**
 * Clear every app-owned notification surface at an account boundary. Each
 * operation is attempted even when another fails; callers receive only a fixed
 * aggregate error, never native error text that could contain notification
 * content or identifiers.
 */
let accountCleanupTail: Promise<void> = Promise.resolve();

async function runAccountScopedLocalNotificationCleanup(
  ownerId: string,
  options?: AccountNotificationCleanupOptions,
): Promise<void> {
  const timeoutMs = operationTimeoutMs(options);
  const nativeRuntime = isReactNativeRuntime();
  let failureCount = nativeRuntime && !Notifications ? 1 : 0;
  type NotificationsModule = NonNullable<typeof Notifications>;
  let scheduledRequests: Awaited<ReturnType<
    NotificationsModule["getAllScheduledNotificationsAsync"]
  >> = [];
  let presentedRequests: Awaited<ReturnType<
    NotificationsModule["getPresentedNotificationsAsync"]
  >> = [];

  if (nativeRuntime && Notifications) {
    const [scheduledResult, presentedResult] = await Promise.allSettled([
      withinOperationTimeout(
        () => Notifications.getAllScheduledNotificationsAsync(),
        timeoutMs,
      ),
      withinOperationTimeout(
        () => Notifications.getPresentedNotificationsAsync(),
        timeoutMs,
      ),
    ]);
    if (scheduledResult.status === "fulfilled") {
      scheduledRequests = scheduledResult.value;
    } else {
      failureCount += 1;
    }
    if (presentedResult.status === "fulfilled") {
      presentedRequests = presentedResult.value;
    } else {
      failureCount += 1;
    }
  }

  const guarded = (operation: () => Promise<unknown>) => withinOperationTimeout(async () => {
    if (!ownerLeaseIsCurrent(options)) throw new Error("Account owner changed.");
    return operation();
  }, timeoutMs);
  const belongsToOwnerOrLegacy = (request: {
    identifier?: string | null;
    content?: { data?: Record<string, unknown> | null } | null;
  }) => {
    const identifier = request.identifier ?? "";
    return isNotificationOwnedBy(identifier, ownerId)
      || !isPrivacySafeNotificationRequest(request);
  };
  const operations: Array<() => Promise<unknown>> = [];
  if (nativeRuntime && Notifications) {
    const scheduledIds = [...new Set(scheduledRequests
      .filter(belongsToOwnerOrLegacy)
      .map((request) => request.identifier)
      .filter(Boolean))];
    const presentedIds = [...new Set(presentedRequests
      .map((notification) => notification.request)
      .filter(belongsToOwnerOrLegacy)
      .map((request) => request.identifier)
      .filter(Boolean))];
    operations.push(
      ...scheduledIds.map((identifier) => () => guarded(
        () => Notifications.cancelScheduledNotificationAsync(identifier),
      )),
      ...presentedIds.map((identifier) => () => guarded(
        () => Notifications.dismissNotificationAsync(identifier),
      )),
    );
    // Read and clear synchronously in one JS turn. A deprecated async clear is a
    // global mutation and could erase B's response after an A cleanup times out.
    operations.push(() => guarded(async () => {
      const response = Notifications.getLastNotificationResponse();
      if (response && belongsToOwnerOrLegacy(response.notification.request)) {
        Notifications.clearLastNotificationResponse();
      }
    }));
  }
  const accountKeys = [
    accountNotificationStorageKey(ownerId, "reminders-disabled"),
    accountNotificationStorageKey(ownerId, "daily-review-enabled"),
    accountNotificationStorageKey(ownerId, "daily-review-hour"),
  ];
  operations.push(...accountKeys.map(
    (key) => () => guarded(() => AsyncStorage.removeItem(key)),
  ));

  const results = await Promise.allSettled(operations.map((operation) => operation()));
  failureCount += results.filter((result) => result.status === "rejected").length;
  if (failureCount > 0) throw new AccountScopedNotificationCleanupError(failureCount);
}

/**
 * Serialize caller-visible cleanup attempts. A timeout releases the queue so a
 * hung native promise cannot deadlock the next account. Native APIs cannot be
 * cancelled after invocation, so late effects may overlap but target immutable,
 * disjoint owner ids/keys (or pre-v2 ids that new code can never issue).
 */
export function clearAccountScopedLocalNotifications(
  ownerId: string,
  options?: AccountNotificationCleanupOptions,
): Promise<void> {
  const run = accountCleanupTail
    .catch(() => undefined)
    .then(() => runAccountScopedLocalNotificationCleanup(ownerId, options));
  accountCleanupTail = run.catch(() => undefined);
  return run;
}

async function readDisabledSet(ownerId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(disabledKey(ownerId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

async function writeDisabledSet(ownerId: string, ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(disabledKey(ownerId), JSON.stringify([...ids]));
  } catch {
    /* best-effort — a failed write just means the toggle doesn't persist */
  }
}

/** True when this routine's reminder is ON (i.e. NOT in the disabled set). */
export async function isReminderEnabled(ownerId: string, routineId: string): Promise<boolean> {
  const disabled = await readDisabledSet(ownerId);
  return !disabled.has(routineId);
}

/** Map of routineId → enabled for the given ids (default ON), read in one pass. */
export async function getReminderStates(
  ownerId: string,
  routineIds: readonly string[],
): Promise<Record<string, boolean>> {
  const disabled = await readDisabledSet(ownerId);
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
export async function enableReminder(
  ownerId: string,
  routineId: string,
  event?: OpsEventInput,
): Promise<boolean> {
  const granted = await ensureNotificationPermission();
  if (!granted) return false;
  const disabled = await readDisabledSet(ownerId);
  if (disabled.delete(routineId)) await writeDisabledSet(ownerId, disabled);
  if (event) {
    await scheduleRoutineReminder(event, {
      ownerId,
      identifier: routineReminderId(ownerId, routineId),
    });
  }
  return true;
}

/**
 * Turn this routine's reminder OFF and persist it. Always succeeds. Also
 * cancels the scheduled OS notification — before, an already-scheduled
 * reminder kept firing after the row was switched off.
 */
export async function disableReminder(ownerId: string, routineId: string): Promise<void> {
  const disabled = await readDisabledSet(ownerId);
  if (!disabled.has(routineId)) {
    disabled.add(routineId);
    await writeDisabledSet(ownerId, disabled);
  }
  await cancelRoutineReminder(ownerId, routineId);
}
