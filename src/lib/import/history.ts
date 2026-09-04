// Import history (import-hub 이력/철회). Device-local AsyncStorage — a log of
// what derived signals were imported, so the user can see and fully delete them.
// Best-effort; failures degrade to "no history".
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

const LEGACY_KEY = "import.history";
const CAP = 50;

/** Per-user storage key. Reading/writing always goes through here. */
function keyFor(userId: string): string {
  return `import.history:${userId}`;
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

// Best-effort removal of the pre-F-08 unscoped blob. Idempotent: removing a key
// that is already gone is a no-op, so calling this on every read is cheap and
// guarantees the cross-user blob disappears after the first read post-upgrade.
async function purgeLegacyUnscoped(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    /* best-effort */
  }
}

export async function getImportHistory(userId: string | null | undefined): Promise<ImportHistoryEntry[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    void purgeLegacyUnscoped();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImportHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function addImportHistory(userId: string | null | undefined, entry: ImportHistoryEntry): Promise<void> {
  if (!userId) return;
  try {
    const cur = await getImportHistory(userId);
    const next = [entry, ...cur].slice(0, CAP);
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    /* best-effort */
  }
}

/** Remove one entry (철회 — also the caller deletes the derived rows it created). */
export async function removeImportHistory(userId: string | null | undefined, id: string): Promise<void> {
  if (!userId) return;
  try {
    const cur = await getImportHistory(userId);
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(cur.filter((e) => e.id !== id)));
  } catch {
    /* best-effort */
  }
}
