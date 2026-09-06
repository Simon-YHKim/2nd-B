// Import history (import-hub 이력/철회). Device-local log of what derived
// signals were imported, so the user can see and fully delete them. Web keeps
// the existing AsyncStorage path; genuine React Native uses encrypted storage.
//
// PER-USER SCOPING (security audit 260904 F-08): the key used to be the single
// global "import.history", so on a SHARED DEVICE account B, after A logged out,
// read A's import log — source kind (health/location/communications/file),
// dates, and the count summary. The raw content was never stored here, but the
// metadata and A's revoke pointers were. The key is now scoped per user; the
// old unscoped blob is purged on the next read by anyone so it can never be
// surfaced again. Migration is a DELETE, not a carry-forward, on purpose: the
// unscoped blob has no owner we can prove, so attributing it to the current
// user would be the same leak in the other direction. The underlying imported
// rows live server-side (sourceIds), so dropping this local convenience log
// loses no data — the module already documents that empty history is tolerated.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getEncryptedNativeStorage,
  type StringStorage,
} from "../storage/encrypted-native-storage";

const LEGACY_KEY = "import.history";
const CAP = 50;
const MAX_OWNER_CHARS = 128;
const MAX_ID_CHARS = 128;
const MAX_SOURCE_KEY_CHARS = 128;
const MAX_NAME_CHARS = 512;
const MAX_AT_ISO_CHARS = 64;
const MAX_SUMMARY_CHARS = 2_048;
const MAX_SOURCE_IDS = 256;
const MAX_SOURCE_ID_CHARS = 128;
// Four UTF-8 bytes per UTF-16 unit still stays below the encrypted adapter's
// 1.4 MB plaintext ceiling, before encryption/base64 expansion.
const MAX_SERIALIZED_CHARS = 300_000;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const operationTails = new Map<string, Promise<void>>();

/** Per-user storage key. Reading/writing always goes through here. */
function keyFor(userId: string): string | null {
  const owner = userId.trim();
  if (!owner || owner.length > MAX_OWNER_CHARS || CONTROL_CHARACTER.test(owner)) return null;
  return `import.history:${owner}`;
}

export interface ImportHistoryEntry {
  /** unique id (timestamp-based). */
  id: string;
  sourceKey: string;
  name: string;
  atIso: string;
  /** short derived summary, e.g. "약속 12 · 장소 5 · 원문 0". */
  summary: string;
  /** source rows this import created — deleted on 철회 (full removal). */
  sourceIds: string[];
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function selectedStorage(): { storage: StringStorage; native: boolean } {
  if (isReactNativeRuntime()) {
    // Initialization/recovery failures are security signals. Do not substitute
    // raw AsyncStorage or a localStorage polyfill in a genuine native runtime.
    return { storage: getEncryptedNativeStorage(), native: true };
  }
  return { storage: AsyncStorage, native: false };
}

function boundedString(value: unknown, maxChars: number): value is string {
  return typeof value === "string" && value.length <= maxChars;
}

function boundedIdentifier(value: unknown, maxChars: number): value is string {
  return boundedString(value, maxChars) && value.length > 0 && !CONTROL_CHARACTER.test(value);
}

function normalizeEntry(value: unknown): ImportHistoryEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !boundedIdentifier(candidate.id, MAX_ID_CHARS)
    || !boundedIdentifier(candidate.sourceKey, MAX_SOURCE_KEY_CHARS)
    || !boundedString(candidate.name, MAX_NAME_CHARS)
    || !boundedString(candidate.atIso, MAX_AT_ISO_CHARS)
    || !boundedString(candidate.summary, MAX_SUMMARY_CHARS)
    || !Array.isArray(candidate.sourceIds)
    || candidate.sourceIds.length > MAX_SOURCE_IDS
    || !candidate.sourceIds.every((item) => boundedIdentifier(item, MAX_SOURCE_ID_CHARS))
  ) return null;
  return {
    id: candidate.id,
    sourceKey: candidate.sourceKey,
    name: candidate.name,
    atIso: candidate.atIso,
    summary: candidate.summary,
    sourceIds: [...candidate.sourceIds],
  };
}

function invalidHistory(strict: boolean): ImportHistoryEntry[] {
  if (strict) throw new Error("import_history_invalid");
  return [];
}

function parseHistory(raw: string | null, strict: boolean): ImportHistoryEntry[] {
  if (raw === null) return [];
  if (raw.length === 0 || raw.length > MAX_SERIALIZED_CHARS) return invalidHistory(strict);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return invalidHistory(strict);
    const normalized: ImportHistoryEntry[] = [];
    for (const value of parsed) {
      const item = normalizeEntry(value);
      if (!item) {
        if (strict) return invalidHistory(true);
        continue;
      }
      if (normalized.length < CAP) normalized.push(item);
    }
    return normalized;
  } catch {
    return invalidHistory(strict);
  }
}

function serializeHistory(entries: ImportHistoryEntry[]): string | null {
  const raw = JSON.stringify(entries.slice(0, CAP));
  return raw.length <= MAX_SERIALIZED_CHARS ? raw : null;
}

function runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = operationTails.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  operationTails.set(key, tail);
  void tail.finally(() => {
    if (operationTails.get(key) === tail) operationTails.delete(key);
  });
  return result;
}

// Delete-only removal of the pre-F-08 unscoped blob. It has no provable owner,
// so it is never read or carried forward. Repeated removal is idempotent.
async function purgeLegacyUnscoped(storage: StringStorage): Promise<void> {
  try {
    await storage.removeItem(LEGACY_KEY);
  } catch {
    /* best-effort */
  }
}

async function readHistory(
  selection: { storage: StringStorage; native: boolean },
  key: string,
): Promise<ImportHistoryEntry[]> {
  try {
    return parseHistory(await selection.storage.getItem(key), selection.native);
  } catch (error) {
    // Web historically treats storage failures as empty history. Native key or
    // recovery failures must stay distinguishable from an empty list so a
    // later mutation cannot overwrite ciphertext it failed to read.
    if (selection.native) throw error;
    return [];
  }
}

export async function getImportHistory(userId: string | null | undefined): Promise<ImportHistoryEntry[]> {
  if (!userId) return [];
  const key = keyFor(userId);
  if (!key) return [];
  return runExclusive(key, async () => {
    const selection = selectedStorage();
    await purgeLegacyUnscoped(selection.storage);
    return readHistory(selection, key);
  });
}

export async function addImportHistory(userId: string | null | undefined, entry: ImportHistoryEntry): Promise<void> {
  if (!userId) return;
  const accepted = normalizeEntry(entry);
  if (!accepted) return;
  const key = keyFor(userId);
  if (!key) return;
  return runExclusive(key, async () => {
    try {
      const selection = selectedStorage();
      await purgeLegacyUnscoped(selection.storage);
      const cur = await readHistory(selection, key);
      const raw = serializeHistory([accepted, ...cur]);
      if (raw !== null) await selection.storage.setItem(key, raw);
    } catch {
      /* best-effort; native read failures must not become writes */
    }
  });
}

/** Remove one entry (철회 — also the caller deletes the derived rows it created). */
export async function removeImportHistory(userId: string | null | undefined, id: string): Promise<void> {
  if (!userId) return;
  const key = keyFor(userId);
  if (!key) return;
  return runExclusive(key, async () => {
    try {
      const selection = selectedStorage();
      await purgeLegacyUnscoped(selection.storage);
      const cur = await readHistory(selection, key);
      const raw = serializeHistory(cur.filter((entry) => entry.id !== id));
      if (raw !== null) await selection.storage.setItem(key, raw);
    } catch {
      /* best-effort; native read failures must not become writes */
    }
  });
}
