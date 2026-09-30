// Photos attached to a 글 record (Simon 2026-09-30: "글 - 메모 / 4W1H 화면에서
// 사진을 추가할 수 있게 해").
//
// There was no photo storage before this. The old 사진 tab never kept the
// image: it ran OCR (a paid AI call) and saved only the transcribed text. So
// this module is the whole client data model:
//
//   bytes  -> Storage bucket `record-photos`, object `<userId>/photo-<uuid>.jpg`
//   link   -> records.structured.photos = [{ path, mime, width, height }]
//             A few short strings per row, so the list queries that select
//             `structured` (listRecentRecords pulls up to 500 rows) stay small.
//             A photo-only payload has no `form`, so parseStructured() keeps
//             returning null for it and nothing here reaches an AI prompt.
//
// ⚠ THE BUCKET DOES NOT EXIST YET, so RECORD_PHOTOS_ENABLED is false.
// Measured 2026-09-30 on production: the only bucket is `raw-clippings`, and it
// is hardened to markdown on purpose (0186/0192: allowed_mime_types
// ['text/markdown'], 1 MiB, insert policy `<uid>/%.md` only, tied to the
// account-deletion fence). A JPEG upload there is refused with 415, and
// loosening that bucket would weaken the deletion hardening, so photos get a
// bucket of their own. Before the flag can flip, the server side must hold and
// erase them (record-photos-server-gate.test.ts checks this from the repo):
//   1. a migration creating the private `record-photos` bucket (image/jpeg,
//      1 MiB) with owner-only select/insert/delete on `<uid>/photo-%.jpg`;
//   2. account deletion sweeping that bucket too (delete-account + its fence);
//   3. export-account including the photos (it only reads raw-clippings today).
//
// Nothing in this module calls an AI service. The photo is only stored and shown.

import { randomUUID } from "expo-crypto";

import { getSupabaseClient } from "../supabase/client";

export const RECORD_PHOTO_BUCKET = "record-photos";
/**
 * The 글 photo button is shown only when this is true. It stays false until the
 * server can store AND erase the photos (see the header, and
 * record-photos-server-gate.test.ts, which fails if the two disagree).
 */
export const RECORD_PHOTOS_ENABLED: boolean = false;
/** Photos one record may carry. Small on purpose: every photo is a separate upload on save. */
export const MAX_RECORD_PHOTOS = 4;
/** Attached photos are always re-encoded to JPEG before upload (drops EXIF, incl. GPS). */
export const RECORD_PHOTO_MIME = "image/jpeg";
export const RECORD_PHOTO_SIGNED_URL_TTL_S = 60 * 60;

const PHOTO_PREFIX = "photo-";
const PHOTO_ID = /^[A-Za-z0-9-]{8,64}$/;
const PHOTO_NAME = /^photo-[A-Za-z0-9-]{8,64}\.jpg$/;
const REMOVE_BATCH = 100;

export interface RecordPhotoRef {
  /** Storage object path inside RECORD_PHOTO_BUCKET: `<userId>/photo-<id>.jpg`. */
  path: string;
  mime: typeof RECORD_PHOTO_MIME;
  width?: number;
  height?: number;
}

/** The records.structured shape for a note that carries photos and no form. */
export interface RecordPhotosPayload {
  photos: RecordPhotoRef[];
}

/** A picked image ready to upload (base64 JPEG bytes, as capture-image returns it). */
export interface RecordPhotoUpload {
  base64: string;
  width?: number;
  height?: number;
}

export function recordPhotoPath(userId: string, photoId: string): string {
  if (!userId || userId.includes("/")) throw new Error("record_photo_invalid_owner");
  if (!PHOTO_ID.test(photoId)) throw new Error("record_photo_invalid_id");
  return `${userId}/${PHOTO_PREFIX}${photoId}.jpg`;
}

/** True for a path this module could have written, optionally for one owner only. */
export function isRecordPhotoPath(path: unknown, userId?: string): path is string {
  if (typeof path !== "string") return false;
  const slash = path.indexOf("/");
  if (slash <= 0 || slash !== path.lastIndexOf("/")) return false;
  const owner = path.slice(0, slash);
  if (userId !== undefined && owner !== userId) return false;
  return PHOTO_NAME.test(path.slice(slash + 1));
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20_000
    ? value
    : undefined;
}

/**
 * Read the photo list back out of an unknown records.structured value.
 * Anything malformed is dropped rather than trusted: a path that is not ours
 * (or not the viewer's, when userId is given) is never signed or deleted.
 */
export function parseRecordPhotos(raw: unknown, userId?: string): RecordPhotoRef[] {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const list = (raw as { photos?: unknown }).photos;
  if (!Array.isArray(list)) return [];
  const out: RecordPhotoRef[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (out.length >= MAX_RECORD_PHOTOS) break;
    if (item == null || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (!isRecordPhotoPath(entry.path, userId) || seen.has(entry.path)) continue;
    if (entry.mime !== RECORD_PHOTO_MIME) continue;
    seen.add(entry.path);
    const width = positiveInt(entry.width);
    const height = positiveInt(entry.height);
    out.push({
      path: entry.path,
      mime: RECORD_PHOTO_MIME,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    });
  }
  return out;
}

/** Every photo path referenced by these rows (deduplicated, in row order). */
export function recordPhotoPathsOf(
  rows: readonly { structured?: unknown }[] | null | undefined,
  userId?: string,
): string[] {
  const out = new Set<string>();
  for (const row of rows ?? []) {
    for (const photo of parseRecordPhotos(row?.structured, userId)) out.add(photo.path);
  }
  return [...out];
}

/** The structured payload a photo note is saved with, or undefined for none. */
export function recordPhotosPayload(photos: readonly RecordPhotoRef[]): RecordPhotosPayload | undefined {
  return photos.length > 0 ? { photos: photos.slice(0, MAX_RECORD_PHOTOS) } : undefined;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUE = new Map(Array.from(BASE64_ALPHABET, (char, value) => [char, value]));

/** Standard base64 (padding optional, whitespace ignored) to bytes. Throws on other characters. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, "").replace(/=+$/, "");
  if (clean.length % 4 === 1) throw new Error("record_photo_invalid_base64");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    const value = BASE64_VALUE.get(char);
    if (value === undefined) throw new Error("record_photo_invalid_base64");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, index);
}

/** Best effort: removing a photo must never turn a finished delete into a failure. */
export async function removeRecordPhotoObjects(paths: readonly string[]): Promise<number> {
  const safe = [...new Set(paths.filter((path) => isRecordPhotoPath(path)))];
  let removed = 0;
  for (let i = 0; i < safe.length; i += REMOVE_BATCH) {
    const batch = safe.slice(i, i + REMOVE_BATCH);
    try {
      const { data, error } = await getSupabaseClient().storage.from(RECORD_PHOTO_BUCKET).remove(batch);
      if (error) throw error;
      removed += Array.isArray(data) ? data.length : 0;
    } catch {
      // No path or native error in the log: object names carry the owner id.
      if (typeof console !== "undefined") console.warn("[record-photos] photo cleanup failed");
    }
  }
  return removed;
}

/**
 * Upload picked photos under the owner's folder. All or nothing: if one upload
 * fails, the ones already stored are removed before the error is rethrown, so
 * a failed save leaves no file behind.
 */
export async function uploadRecordPhotos(
  userId: string,
  photos: readonly RecordPhotoUpload[],
  newId: () => string = randomUUID,
): Promise<RecordPhotoRef[]> {
  const bucket = getSupabaseClient().storage.from(RECORD_PHOTO_BUCKET);
  const uploaded: RecordPhotoRef[] = [];
  try {
    for (const photo of photos.slice(0, MAX_RECORD_PHOTOS)) {
      const path = recordPhotoPath(userId, newId().toLowerCase());
      const bytes = base64ToBytes(photo.base64);
      // A plain ArrayBuffer, not a view: the form Supabase documents for React
      // Native uploads, and what every fetch implementation here accepts.
      const body: ArrayBuffer = new Uint8Array(bytes).buffer;
      const { error } = await bucket.upload(path, body, {
        contentType: RECORD_PHOTO_MIME,
        upsert: false,
      });
      if (error) throw error;
      const width = positiveInt(photo.width);
      const height = positiveInt(photo.height);
      uploaded.push({
        path,
        mime: RECORD_PHOTO_MIME,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      });
    }
  } catch (error) {
    await removeRecordPhotoObjects(uploaded.map((photo) => photo.path));
    throw error;
  }
  return uploaded;
}

/** Short-lived URLs for showing the owner's photos. Paths that fail to sign are left out. */
export async function signRecordPhotoUrls(paths: readonly string[]): Promise<Record<string, string>> {
  const safe = paths.filter((path) => isRecordPhotoPath(path));
  if (safe.length === 0) return {};
  const { data, error } = await getSupabaseClient()
    .storage.from(RECORD_PHOTO_BUCKET)
    .createSignedUrls(safe, RECORD_PHOTO_SIGNED_URL_TTL_S);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row?.path && typeof row.signedUrl === "string" && row.signedUrl && !row.error) {
      out[row.path] = row.signedUrl;
    }
  }
  return out;
}
