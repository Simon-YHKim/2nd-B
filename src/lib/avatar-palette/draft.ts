/** One private, device-local drawing per owner and slot. No server API is used here. */
import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";
import {
  getEncryptedNativeStorage,
} from "../storage/encrypted-native-storage";
import {
  AVATAR_PALETTE_SLOTS,
  isAvatarPalettePixels,
  isAvatarPaletteSlot,
  type AvatarPaletteSlot,
} from "./pixels";

export interface AvatarPaletteDraft {
  slot: AvatarPaletteSlot;
  title: string;
  pixels: string;
  updatedAt: string;
}

export type AvatarPaletteDraftInput = Pick<AvatarPaletteDraft, "slot" | "title" | "pixels">;

const KEY_PREFIX = "avatar.palette.drafts.v1.";
const SCHEMA_VERSION = 1;
// Three 4096-cell layers plus metadata fit well below this ceiling. An edited
// or corrupt localStorage entry must never become an unbounded JSON parse.
const MAX_RAW_LENGTH = 16_384;
const OWNER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const operationTails = new Map<string, Promise<void>>();

type DraftMap = Partial<Record<AvatarPaletteSlot, AvatarPaletteDraft>>;
interface DraftStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

function assertOwner(userId: string): string {
  if (typeof userId !== "string" || !OWNER_PATTERN.test(userId)) {
    throw new TypeError("Invalid avatar palette owner");
  }
  return userId;
}

export function avatarPaletteDraftKey(userId: string): string {
  return `${KEY_PREFIX}${assertOwner(userId)}`;
}

function isNativeRuntime(): boolean {
  return (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative";
}

function storage(): DraftStorage {
  if (isNativeRuntime()) return getEncryptedNativeStorage();
  // Never let React Native select a plaintext localStorage polyfill. Web is
  // deliberately device-local, like the existing capture draft store.
  if (typeof localStorage === "undefined") throw new Error("avatar_palette_local_storage_unavailable");
  return localStorage;
}

function validTitle(title: unknown): title is string {
  return typeof title === "string" && title.length <= 32 &&
    !CONTROL_CHARACTER.test(title) && new TextEncoder().encode(title).length <= 128;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function parseDraft(slot: AvatarPaletteSlot, value: unknown): AvatarPaletteDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<AvatarPaletteDraft>;
  if (item.slot !== slot || !validTitle(item.title) ||
      !isAvatarPalettePixels(item.pixels) || !validDate(item.updatedAt)) return null;
  return { slot, title: item.title, pixels: item.pixels, updatedAt: item.updatedAt };
}

function parseDrafts(raw: string | null): DraftMap {
  if (!raw || raw.length > MAX_RAW_LENGTH) return {};
  try {
    const value = JSON.parse(raw) as { v?: unknown; drafts?: unknown };
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        value.v !== SCHEMA_VERSION || !value.drafts ||
        typeof value.drafts !== "object" || Array.isArray(value.drafts)) return {};
    const source = value.drafts as Record<string, unknown>;
    const drafts: DraftMap = {};
    for (const slot of AVATAR_PALETTE_SLOTS) {
      const parsed = parseDraft(slot, source[slot]);
      if (parsed) drafts[slot] = parsed;
    }
    return drafts;
  } catch {
    return {};
  }
}

function serializeDrafts(drafts: DraftMap): string {
  return JSON.stringify({ v: SCHEMA_VERSION, drafts });
}

function runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = operationTails.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(() => undefined, () => undefined);
  operationTails.set(key, tail);
  void tail.finally(() => {
    if (operationTails.get(key) === tail) operationTails.delete(key);
  });
  return result;
}

/** A storage read failure propagates, so the editor cannot overwrite a real
 * draft with its initially blank canvas during a transient native failure. */
export async function loadAvatarPaletteDraft(
  userId: string,
  slot: AvatarPaletteSlot,
): Promise<AvatarPaletteDraft | null> {
  const owner = assertOwner(userId);
  if (!isAvatarPaletteSlot(slot)) throw new TypeError("Invalid avatar palette slot");
  if (isAccountLocalDeletionFencedInMemory(owner)) return null;
  const key = avatarPaletteDraftKey(owner);
  return runExclusive(key, async () => {
    const drafts = parseDrafts(await storage().getItem(key));
    return drafts[slot] ?? null;
  });
}

/** Accepts an empty title and transparent canvas: unfinished art is a draft. */
export async function saveAvatarPaletteDraft(
  userId: string,
  input: AvatarPaletteDraftInput,
): Promise<void> {
  const owner = assertOwner(userId);
  if (!input || !isAvatarPaletteSlot(input.slot) ||
      !validTitle(input.title) || !isAvatarPalettePixels(input.pixels)) {
    throw new TypeError("Invalid avatar palette draft");
  }
  const title = input.title.trim();
  const key = avatarPaletteDraftKey(owner);
  const result = await runAccountLocalMutation(owner, () => runExclusive(key, async () => {
    const store = storage();
    const drafts = parseDrafts(await store.getItem(key));
    drafts[input.slot] = {
      slot: input.slot,
      title,
      pixels: input.pixels,
      updatedAt: new Date().toISOString(),
    };
    await store.setItem(key, serializeDrafts(drafts));
  }));
  if (!result.executed) throw new Error("avatar_palette_local_write_blocked");
}

export async function deleteAvatarPaletteDraft(userId: string, slot: AvatarPaletteSlot): Promise<void> {
  const owner = assertOwner(userId);
  if (!isAvatarPaletteSlot(slot)) throw new TypeError("Invalid avatar palette slot");
  const key = avatarPaletteDraftKey(owner);
  const result = await runAccountLocalMutation(owner, () => runExclusive(key, async () => {
    const store = storage();
    const drafts = parseDrafts(await store.getItem(key));
    if (!drafts[slot]) return;
    delete drafts[slot];
    if (Object.keys(drafts).length === 0) await store.removeItem(key);
    else await store.setItem(key, serializeDrafts(drafts));
  }));
  if (!result.executed) throw new Error("avatar_palette_local_write_blocked");
}

/** Terminal account deletion bypasses the write fence and removes this owner
 * only. Failure is observable to the existing deletion completion flow. */
export async function purgeAvatarPaletteDraftsForDeletedAccount(userId: string): Promise<boolean> {
  if (typeof userId !== "string" || !OWNER_PATTERN.test(userId)) return false;
  const key = avatarPaletteDraftKey(userId);
  try {
    return await runExclusive(key, async () => {
      await storage().removeItem(key);
      return true;
    });
  } catch {
    return false;
  }
}
