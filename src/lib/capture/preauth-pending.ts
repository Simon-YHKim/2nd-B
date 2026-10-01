// Pre-account pending capture (D-17 / D-25 Phase 2): a device-local, encrypted
// holding queue so a first-time visitor can brain-dump a line BEFORE creating an
// account, then import it after sign-up. This is the storage layer ONLY.
//
// Hard invariants (D-17 minimal-safe design, Simon legal GO 2026-06-21):
//   - Pre-account = device-local only. NO LLM, NO Supabase/server, NO
//     clipper/OCR, NO source/record claims. This file imports none of those by
//     construction (storage primitives only), keeping the C1/C5 boundary intact.
//   - Honest capacity: the queue is HARD-CAPPED and reports near-full / full so
//     the UI can say "saved on this device, almost full" instead of silently
//     dropping a clip (silent loss is the real trust break, per persona-sim).
//   - On account creation each item is imported via the normal post-account path.
//     Only confirmed imports leave the queue; "ratify" stays reserved for the
//     edge/self-model contract, so the import verb here is confirm/import.
//
// Storage plumbing mirrors capture/draft.ts (web localStorage, native encrypted
// storage). Unlike drafts there is no userId scope: pre-account has no user.

import {
  getEncryptedNativeStorage,
  type StringStorage,
} from "../storage/encrypted-native-storage";

export interface PendingCapture {
  /**
   * Stable local id (dedup + delete). The id itself never leaves the device: it
   * embeds the capture time. After sign-up the import sends only
   * "preauth:" + SHA-256(localId) as the 0178 retry key (import-pending.ts), a
   * digest that repeats for the same capture and carries no readable timestamp.
   */
  localId: string;
  /** Plaintext only. No structure, no inference. */
  text: string;
  /** ISO timestamp of capture. */
  capturedAt: string;
}

/** Hard ceiling. 50 short items sit far under the encrypted value ceiling. */
export const PREAUTH_PENDING_CAP = 50;
/** At/above this count the UI should nudge toward account creation (honest, not punitive). */
export const PREAUTH_PENDING_NEAR = 45;
/** Per-item character cap so the queue cannot bloat past the storage ceiling. */
export const PREAUTH_PENDING_MAX_CHARS = 4000;

const STATE_KEY = "capture.preauthPending.v1";

// Serialize writes in this runtime. An async native read/write otherwise lets two
// additions read the same old value and acknowledge one that the other overwrote.
let mutationTail: Promise<void> = Promise.resolve();

function mutateQueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = mutationTail.then(operation);
  mutationTail = task.then(() => undefined, () => undefined);
  return task;
}

export interface PendingStatus {
  count: number;
  cap: number;
  remaining: number;
  /** true once the queue is near the cap (drive the "almost full" copy). */
  nearFull: boolean;
  /** true when the queue is full and new captures are refused. */
  full: boolean;
}

export function pendingStatus(count: number): PendingStatus {
  const c = Math.max(0, Math.floor(count));
  return {
    count: c,
    cap: PREAUTH_PENDING_CAP,
    remaining: Math.max(0, PREAUTH_PENDING_CAP - c),
    nearFull: c >= PREAUTH_PENDING_NEAR,
    full: c >= PREAUTH_PENDING_CAP,
  };
}

export type AddPendingResult =
  | { ok: true; item: PendingCapture; status: PendingStatus; list: PendingCapture[] }
  | { ok: false; reason: "empty" | "too_long" | "full"; status: PendingStatus; list: PendingCapture[] };

// Pure core: append `text` to `list` honoring the empty / length / cap rules.
// Caller supplies `now` + `localId` so the function stays deterministic (and the
// storage wrapper, not this, owns clock/randomness).
export function addToPendingList(
  list: PendingCapture[],
  text: string,
  now: string,
  localId: string,
): AddPendingResult {
  const safeList = normalizePendingList(list);
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty", status: pendingStatus(safeList.length), list: safeList };
  }
  if (trimmed.length > PREAUTH_PENDING_MAX_CHARS) {
    return { ok: false, reason: "too_long", status: pendingStatus(safeList.length), list: safeList };
  }
  if (safeList.length >= PREAUTH_PENDING_CAP) {
    return { ok: false, reason: "full", status: pendingStatus(safeList.length), list: safeList };
  }
  const item: PendingCapture = { localId, text: trimmed, capturedAt: now };
  const next = [...safeList, item];
  return { ok: true, item, status: pendingStatus(next.length), list: next };
}

function isPendingCapture(value: unknown): value is PendingCapture {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.localId === "string" &&
    typeof v.text === "string" &&
    v.text.trim().length > 0 &&
    typeof v.capturedAt === "string"
  );
}

export function normalizePendingList(value: unknown): PendingCapture[] {
  if (!Array.isArray(value)) return [];
  const out: PendingCapture[] = [];
  for (const entry of value) {
    if (isPendingCapture(entry) && entry.text.length <= PREAUTH_PENDING_MAX_CHARS) {
      out.push({ localId: entry.localId, text: entry.text, capturedAt: entry.capturedAt });
    }
    if (out.length >= PREAUTH_PENDING_CAP) break;
  }
  return out;
}

function parseList(raw: string | null): PendingCapture[] {
  if (!raw) return [];
  try {
    return normalizePendingList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function ls(): Storage | null {
  // React Native must never select a plaintext localStorage polyfill.
  if (isReactNativeRuntime()) return null;
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode: fall through
  }
  return null;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeStorage(): StringStorage | null {
  if (!isReactNativeRuntime()) return null;
  // A missing/unavailable device key is a security signal. Never substitute
  // plaintext or ephemeral storage in a genuine native runtime.
  return getEncryptedNativeStorage();
}

function newLocalId(now: string): string {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `p_${Date.parse(now) || 0}_${rand}`;
}

export async function loadPendingCaptures(): Promise<PendingCapture[]> {
  const local = ls();
  if (local) {
    return parseList(local.getItem(STATE_KEY));
  }
  const native = nativeStorage();
  if (!native) return [];
  return parseList(await native.getItem(STATE_KEY));
}

async function writeList(list: PendingCapture[]): Promise<void> {
  const raw = JSON.stringify(normalizePendingList(list));
  const local = ls();
  if (local) {
    local.setItem(STATE_KEY, raw);
    return;
  }
  const native = nativeStorage();
  if (!native) throw new Error("pending_storage_unavailable");
  await native.setItem(STATE_KEY, raw);
}

/** Append a plaintext capture to the device-local pending queue (no account needed). */
export async function addPendingCapture(text: string, now?: string): Promise<AddPendingResult> {
  const stamp = now ?? new Date().toISOString();
  return mutateQueue(async () => {
    const current = await loadPendingCaptures();
    const result = addToPendingList(current, text, stamp, newLocalId(stamp));
    if (result.ok) await writeList(result.list);
    return result;
  });
}

export async function countPendingCaptures(): Promise<number> {
  return (await loadPendingCaptures()).length;
}

export async function getPendingStatus(): Promise<PendingStatus> {
  return pendingStatus(await countPendingCaptures());
}

export async function clearPendingCaptures(): Promise<void> {
  await mutateQueue(async () => {
    const local = ls();
    if (local) {
      local.removeItem(STATE_KEY);
      return;
    }
    const native = nativeStorage();
    if (native) await native.removeItem(STATE_KEY);
  });
}

/**
 * Remove only captures confirmed on the server. Read the latest queue inside the
 * mutation lock so a capture appended while an import was in flight stays queued.
 * Match complete entries and count duplicates independently: a repeated localId
 * does not authorize dropping a distinct capture.
 */
export async function removeImportedPendingCaptures(imported: PendingCapture[]): Promise<void> {
  if (imported.length === 0) return;
  await mutateQueue(async () => {
    const counts = new Map<string, number>();
    for (const item of imported) {
      const key = JSON.stringify([item.localId, item.text, item.capturedAt]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const current = await loadPendingCaptures();
    const remaining = current.filter((item) => {
      const key = JSON.stringify([item.localId, item.text, item.capturedAt]);
      const count = counts.get(key) ?? 0;
      if (count === 0) return true;
      counts.set(key, count - 1);
      return false;
    });
    if (remaining.length !== current.length) await writeList(remaining);
  });
}

/**
 * Replace the full queue for explicit local maintenance and test setup. Imports
 * must use removeImportedPendingCaptures so a concurrent addition survives.
 */
export async function replacePendingCaptures(list: PendingCapture[]): Promise<void> {
  await mutateQueue(() => writeList(list));
}
