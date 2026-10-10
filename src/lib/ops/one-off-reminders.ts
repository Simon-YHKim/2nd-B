/** Private, device-local reminder details; OS notifications carry no task text. */
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";
import { captureAccountOwnerLease } from "../auth/account-epoch";
import { getEncryptedNativeStorage } from "../storage/encrypted-native-storage";
import type { OpsEventInput } from "./push";
import { cancelRoutineReminder } from "./reminders";

export interface OneOffReminder {
  id: string;
  title: string;
  startsAtIso: string;
}

export const ONE_OFF_REMINDER_LIMIT = 200;
const KEY_PREFIX = "ops.one-off-reminders.v1.";
const OWNER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ID_PATTERN = /^chat-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RAW_LENGTH = 64_000;
const tails = new Map<string, Promise<void>>();

function validOwner(ownerId: string): boolean {
  return typeof ownerId === "string" && OWNER_PATTERN.test(ownerId);
}

export function oneOffRemindersKey(ownerId: string): string {
  if (!validOwner(ownerId)) throw new TypeError("Invalid one-off reminder owner");
  return `${KEY_PREFIX}${ownerId}`;
}

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 80
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function parse(raw: string | null): OneOffReminder[] {
  if (raw === null) return [];
  if (raw.length > MAX_RAW_LENGTH) throw new Error("one_off_reminders_invalid");
  const parsed = JSON.parse(raw) as { v?: unknown; items?: unknown } | null;
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items) || parsed.items.length > ONE_OFF_REMINDER_LIMIT) {
    throw new Error("one_off_reminders_invalid");
  }
  const ids = new Set<string>();
  return parsed.items.map((value: unknown) => {
    const item = value as Partial<OneOffReminder> | null;
    if (!item || typeof item.id !== "string" || !ID_PATTERN.test(item.id) || ids.has(item.id)
      || !validTitle(item.title) || !validDate(item.startsAtIso)) throw new Error("one_off_reminders_invalid");
    ids.add(item.id);
    return { id: item.id, title: item.title, startsAtIso: item.startsAtIso };
  });
}

function serialize(items: OneOffReminder[]): string {
  const raw = JSON.stringify({ v: 1, items });
  if (raw.length > MAX_RAW_LENGTH) throw new Error("one_off_reminders_full");
  return raw;
}

// The same queue joins terminal purge to all in-flight encrypted store writes.
function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const run = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  const tail = run.then(() => undefined, () => undefined);
  tails.set(key, tail);
  void tail.finally(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}

/** Storage failures propagate, so the list can show an error instead of false emptiness. */
export async function listOneOffReminders(ownerId: string): Promise<OneOffReminder[]> {
  if (Platform.OS === "web" || !validOwner(ownerId)) return [];
  const lease = captureAccountOwnerLease(ownerId);
  if (!lease?.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return [];
  const key = oneOffRemindersKey(ownerId);
  const result = await runAccountLocalMutation(ownerId, () => exclusive(key, async () => {
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return [];
    const items = parse(await getEncryptedNativeStorage().getItem(key));
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return [];
    // Past tasks remain recoverable; reading never silently removes or reschedules them.
    return items.sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso) || a.id.localeCompare(b.id));
  }));
  return result.executed && lease.isCurrent() ? result.value : [];
}

/** Confirmation creates only reviewed title/date fields. No chat or OS payload is persisted. */
export async function createOneOffReminder(ownerId: string, event: OpsEventInput): Promise<OneOffReminder | null> {
  if (Platform.OS === "web" || !validOwner(ownerId) || !event || event.recurrence
    || !validTitle(event.title) || !validDate(event.startsAtIso) || Date.parse(event.startsAtIso) <= Date.now()) return null;
  const lease = captureAccountOwnerLease(ownerId);
  if (!lease?.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return null;
  const key = oneOffRemindersKey(ownerId);
  const result = await runAccountLocalMutation(ownerId, () => exclusive(key, async () => {
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return null;
    const store = getEncryptedNativeStorage();
    const items = parse(await store.getItem(key));
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return null;
    if (items.length >= ONE_OFF_REMINDER_LIMIT) throw new Error("one_off_reminders_full");
    const item = { id: `chat-${Crypto.randomUUID()}`, title: event.title.trim(), startsAtIso: event.startsAtIso };
    if (!ID_PATTERN.test(item.id) || items.some(row => row.id === item.id)) throw new Error("one_off_reminder_id_invalid");
    await store.setItem(key, serialize([...items, item]));
    return lease.isCurrent() && !isAccountLocalDeletionFencedInMemory(ownerId) ? item : null;
  }));
  return result.executed && lease.isCurrent() ? result.value : null;
}

/** Try the stable OS identifier first, but always allow an owned record deletion.
 * A partial success must not claim the OS alarm was cancelled. */
export async function removeOneOffReminder(ownerId: string, id: string): Promise<boolean | "alarm-uncertain"> {
  if (Platform.OS === "web" || !validOwner(ownerId) || !ID_PATTERN.test(id)) return false;
  const lease = captureAccountOwnerLease(ownerId);
  if (!lease?.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return false;
  const key = oneOffRemindersKey(ownerId);
  const result = await runAccountLocalMutation(ownerId, () => exclusive(key, async () => {
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return false;
    const store = getEncryptedNativeStorage();
    const items = parse(await store.getItem(key));
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return false;
    if (!items.some(item => item.id === id)) return true;
    let alarmUncertain = false;
    try { await cancelRoutineReminder(ownerId, id, { strict: true }); }
    catch { alarmUncertain = true; }
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return false;
    await store.setItem(key, serialize(items.filter(item => item.id !== id)));
    if (!lease.isCurrent() || isAccountLocalDeletionFencedInMemory(ownerId)) return false;
    return alarmUncertain ? "alarm-uncertain" as const : true;
  }));
  return result.executed && result.value;
}

/** Called after the terminal fence; bypass the owner lease, never widen the purge. */
export async function purgeOneOffRemindersForDeletedAccount(ownerId: string): Promise<boolean> {
  if (!validOwner(ownerId)) return false;
  if (Platform.OS === "web") return true;
  const key = oneOffRemindersKey(ownerId);
  try {
    await exclusive(key, () => getEncryptedNativeStorage().removeItem(key));
    return true;
  } catch { return false; }
}
