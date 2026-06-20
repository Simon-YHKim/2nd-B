// Import history (import-hub 이력/철회). Device-local AsyncStorage — a log of
// what derived signals were imported, so the user can see and fully delete them.
// Best-effort; failures degrade to "no history".

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "import.history";
const CAP = 50;

export interface ImportHistoryEntry {
  /** unique id (timestamp-based). */
  id: string;
  sourceKey: string;
  name: string;
  atIso: string;
  /** short derived summary, e.g. "약속 12 · 장소 5 · 원문 0". */
  summary: string;
}

export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImportHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function addImportHistory(entry: ImportHistoryEntry): Promise<void> {
  try {
    const cur = await getImportHistory();
    const next = [entry, ...cur].slice(0, CAP);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
}

/** Remove one entry (철회 — also the caller deletes the derived rows it created). */
export async function removeImportHistory(id: string): Promise<void> {
  try {
    const cur = await getImportHistory();
    await AsyncStorage.setItem(KEY, JSON.stringify(cur.filter((e) => e.id !== id)));
  } catch {
    /* best-effort */
  }
}
