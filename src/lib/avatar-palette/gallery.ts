/** Private, device-local pixel art gallery. No server API is used here. */
import * as Crypto from "expo-crypto";

import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";
import { getEncryptedNativeStorage } from "../storage/encrypted-native-storage";
import {
  AVATAR_PALETTE_SLOTS,
  isAvatarPalettePixels,
  isAvatarPaletteSlot,
  type AvatarPaletteSlot,
} from "./pixels";

export interface AvatarPaletteItem {
  id: string;
  slot: AvatarPaletteSlot;
  title: string;
  pixels: string;
  createdAt: string;
  updatedAt: string;
}

export type AvatarPaletteItemInput = Pick<AvatarPaletteItem, "slot" | "title" | "pixels"> & {
  id?: string;
};

export const AVATAR_PALETTE_GALLERY_LIMIT = 30;

// Retain the v1 logical key so existing encrypted native drafts remain readable.
const KEY_PREFIX = "avatar.palette.drafts.v1.";
const SCHEMA_VERSION = 2;
const LEGACY_MAX_RAW_LENGTH = 16_384;
// 30 × (4096 cells + bounded metadata) is below this fixed parse ceiling.
const MAX_RAW_LENGTH = 160_000;
const OWNER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const operationTails = new Map<string, Promise<void>>();

interface GalleryStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

interface ParsedGallery {
  items: AvatarPaletteItem[];
  writable: boolean;
}

function assertOwner(userId: string): string {
  if (typeof userId !== "string" || !OWNER_PATTERN.test(userId)) {
    throw new TypeError("Invalid avatar palette owner");
  }
  return userId;
}

export function avatarPaletteGalleryKey(userId: string): string {
  return `${KEY_PREFIX}${assertOwner(userId)}`;
}

function legacyId(owner: string, slot: AvatarPaletteSlot): string {
  return `legacy:${owner}:${slot}`;
}

function validItemId(owner: string, id: unknown): id is string {
  return typeof id === "string" && (
    UUID_PATTERN.test(id) || AVATAR_PALETTE_SLOTS.some((slot) => id === legacyId(owner, slot))
  );
}

function isNativeRuntime(): boolean {
  return (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative";
}

function storage(): GalleryStorage {
  if (isNativeRuntime()) return getEncryptedNativeStorage();
  // React Native must never select a plaintext localStorage polyfill.
  if (typeof localStorage === "undefined") throw new Error("avatar_palette_local_storage_unavailable");
  return localStorage;
}

function validUtf16(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.length <= 32 && validUtf16(value) &&
    !CONTROL_CHARACTER.test(value) && new TextEncoder().encode(value).length <= 128;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function parseItem(owner: string, value: unknown): AvatarPaletteItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<AvatarPaletteItem>;
  if (!validItemId(owner, item.id) || !isAvatarPaletteSlot(item.slot) ||
      !validTitle(item.title) || !isAvatarPalettePixels(item.pixels) ||
      !validDate(item.createdAt) || !validDate(item.updatedAt)) return null;
  return {
    id: item.id, slot: item.slot, title: item.title, pixels: item.pixels,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
  };
}

function parseLegacy(owner: string, source: unknown): ParsedGallery {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { items: [], writable: false };
  }
  const drafts = source as Record<string, unknown>;
  const items: AvatarPaletteItem[] = [];
  for (const slot of AVATAR_PALETTE_SLOTS) {
    if (!Object.prototype.hasOwnProperty.call(drafts, slot)) continue;
    const value = drafts[slot];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { items: [], writable: false };
    }
    const draft = value as Record<string, unknown>;
    if (draft.slot !== slot || !validTitle(draft.title) ||
        !isAvatarPalettePixels(draft.pixels) || !validDate(draft.updatedAt)) {
      return { items: [], writable: false };
    }
    items.push({
      id: legacyId(owner, slot), slot, title: draft.title,
      pixels: draft.pixels, createdAt: draft.updatedAt, updatedAt: draft.updatedAt,
    });
  }
  return { items, writable: true };
}

function parseGallery(owner: string, raw: string | null): ParsedGallery {
  if (raw === null) return { items: [], writable: true };
  if (raw.length > MAX_RAW_LENGTH) return { items: [], writable: false };
  try {
    const value = JSON.parse(raw) as { v?: unknown; drafts?: unknown; items?: unknown };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { items: [], writable: false };
    }
    if (value.v === 1) {
      return raw.length > LEGACY_MAX_RAW_LENGTH
        ? { items: [], writable: false }
        : parseLegacy(owner, value.drafts);
    }
    if (value.v !== SCHEMA_VERSION || !Array.isArray(value.items) ||
        value.items.length > AVATAR_PALETTE_GALLERY_LIMIT) {
      return { items: [], writable: false };
    }
    const items: AvatarPaletteItem[] = [];
    const ids = new Set<string>();
    for (const valueItem of value.items) {
      const item = parseItem(owner, valueItem);
      if (!item || ids.has(item.id)) return { items: [], writable: false };
      ids.add(item.id);
      items.push(item);
    }
    return { items, writable: true };
  } catch {
    return { items: [], writable: false };
  }
}

function serializeGallery(items: AvatarPaletteItem[]): string {
  const raw = JSON.stringify({ v: SCHEMA_VERSION, items });
  if (raw.length > MAX_RAW_LENGTH) throw new Error("avatar_palette_gallery_too_large");
  return raw;
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

function assertWritable(gallery: ParsedGallery): AvatarPaletteItem[] {
  if (!gallery.writable) throw new Error("avatar_palette_local_data_invalid");
  return gallery.items;
}

/** Storage read errors propagate so the editor cannot mistake an unavailable
 * encrypted gallery for an empty one and overwrite it. */
export async function listAvatarPaletteItems(userId: string): Promise<AvatarPaletteItem[]> {
  const owner = assertOwner(userId);
  if (isAccountLocalDeletionFencedInMemory(owner)) return [];
  const key = avatarPaletteGalleryKey(owner);
  return runExclusive(key, async () => {
    const items = assertWritable(parseGallery(owner, await storage().getItem(key)));
    return [...items].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  });
}

/** Empty title and transparent pixels remain valid as unfinished local art. */
export async function saveAvatarPaletteItem(
  userId: string,
  input: AvatarPaletteItemInput,
): Promise<AvatarPaletteItem> {
  const owner = assertOwner(userId);
  if (!input || !isAvatarPaletteSlot(input.slot) || !validTitle(input.title) ||
      !isAvatarPalettePixels(input.pixels) ||
      (input.id !== undefined && !validItemId(owner, input.id))) {
    throw new TypeError("Invalid avatar palette item");
  }
  const key = avatarPaletteGalleryKey(owner);
  const result = await runAccountLocalMutation(owner, () => runExclusive(key, async () => {
    const store = storage();
    const items = assertWritable(parseGallery(owner, await store.getItem(key)));
    const index = input.id === undefined ? -1 : items.findIndex((item) => item.id === input.id);
    if (input.id !== undefined && index < 0) throw new Error("avatar_palette_item_not_found");
    if (input.id === undefined && items.length >= AVATAR_PALETTE_GALLERY_LIMIT) {
      throw new Error("avatar_palette_gallery_full");
    }
    const now = new Date().toISOString();
    const id = input.id ?? Crypto.randomUUID();
    if (!validItemId(owner, id) || (index < 0 && items.some((item) => item.id === id))) {
      throw new Error("avatar_palette_item_id_invalid");
    }
    const item: AvatarPaletteItem = {
      id, slot: input.slot, title: input.title.trim(), pixels: input.pixels,
      createdAt: index < 0 ? now : items[index].createdAt, updatedAt: now,
    };
    const next = [...items];
    if (index < 0) next.push(item);
    else next[index] = item;
    await store.setItem(key, serializeGallery(next));
    return item;
  }));
  if (!result.executed) throw new Error("avatar_palette_local_write_blocked");
  return result.value;
}

export async function deleteAvatarPaletteItem(userId: string, id: string): Promise<void> {
  const owner = assertOwner(userId);
  if (!validItemId(owner, id)) throw new TypeError("Invalid avatar palette item ID");
  const key = avatarPaletteGalleryKey(owner);
  const result = await runAccountLocalMutation(owner, () => runExclusive(key, async () => {
    const store = storage();
    const items = assertWritable(parseGallery(owner, await store.getItem(key)));
    const next = items.filter((item) => item.id !== id);
    if (next.length < items.length) await store.setItem(key, serializeGallery(next));
  }));
  if (!result.executed) throw new Error("avatar_palette_local_write_blocked");
}

/** Called after terminal account deletion; only this owner's key is removed. */
export async function purgeAvatarPaletteItemsForDeletedAccount(userId: string): Promise<boolean> {
  if (typeof userId !== "string" || !OWNER_PATTERN.test(userId)) return false;
  const key = avatarPaletteGalleryKey(userId);
  try {
    return await runExclusive(key, async () => {
      await storage().removeItem(key);
      return true;
    });
  } catch {
    return false;
  }
}
