// Pre-account pending capture (D-17 / D-25 Phase 2): a device-local, plaintext
// holding queue so a first-time visitor can brain-dump a line BEFORE creating an
// account, then import it after sign-up. This is the storage layer ONLY.
//
// Hard invariants (D-17 minimal-safe design, Simon legal GO 2026-06-21):
//   - Pre-account = device-local plaintext only. NO LLM, NO Supabase/server, NO
//     clipper/OCR, NO source/record claims. This file imports none of those by
//     construction (storage primitives only), keeping the C1/C5 boundary intact.
//   - Honest capacity: the queue is HARD-CAPPED and reports near-full / full so
//     the UI can say "saved on this device, almost full" instead of silently
//     dropping a clip (silent loss is the real trust break, per persona-sim).
//   - On account creation the queue is DRAINED (load + clear) and each item is
//     imported via the normal post-account path; "ratify" stays reserved for the
//     edge/self-model contract, so the import verb here is confirm/import.
//
// Storage plumbing mirrors capture/draft.ts (web localStorage, native
// AsyncStorage). Unlike drafts there is no userId scope: pre-account has no user.

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface PendingCapture {
  /** Stable local id (dedup + delete); never leaves the device. */
  localId: string;
  /** Plaintext only. No structure, no inference. */
  text: string;
  /** ISO timestamp of capture. */
  capturedAt: string;
}

/** Hard ceiling. 50 short items sit far under the AsyncStorage ~2MB ceiling. */
export const PREAUTH_PENDING_CAP = 50;
/** At/above this count the UI should nudge toward account creation (honest, not punitive). */
export const PREAUTH_PENDING_NEAR = 45;
/** Per-item character cap so the queue cannot bloat past the storage ceiling. */
export const PREAUTH_PENDING_MAX_CHARS = 4000;

const STATE_KEY = "capture.preauthPending.v1";

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
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native: fall through
  }
  return null;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeStorage(): AsyncStorageLike | null {
  if (!isReactNativeRuntime()) return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function newLocalId(now: string): string {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `p_${Date.parse(now) || 0}_${rand}`;
}

export async function loadPendingCaptures(): Promise<PendingCapture[]> {
  const local = ls();
  if (local) {
    try {
      return parseList(local.getItem(STATE_KEY));
    } catch {
      return [];
    }
  }
  const native = nativeStorage();
  if (!native) return [];
  try {
    return parseList(await native.getItem(STATE_KEY));
  } catch {
    return [];
  }
}

async function writeList(list: PendingCapture[]): Promise<void> {
  const raw = JSON.stringify(normalizePendingList(list));
  const local = ls();
  if (local) {
    try {
      local.setItem(STATE_KEY, raw);
    } catch {
      /* quota/private mode: best-effort */
    }
    return;
  }
  const native = nativeStorage();
  if (!native) return;
  try {
    await native.setItem(STATE_KEY, raw);
  } catch {
    /* best-effort */
  }
}

/** Append a plaintext capture to the device-local pending queue (no account needed). */
export async function addPendingCapture(text: string, now?: string): Promise<AddPendingResult> {
  const stamp = now ?? new Date().toISOString();
  const current = await loadPendingCaptures();
  const result = addToPendingList(current, text, stamp, newLocalId(stamp));
  if (result.ok) await writeList(result.list);
  return result;
}

export async function countPendingCaptures(): Promise<number> {
  return (await loadPendingCaptures()).length;
}

export async function getPendingStatus(): Promise<PendingStatus> {
  return pendingStatus(await countPendingCaptures());
}

export async function clearPendingCaptures(): Promise<void> {
  const local = ls();
  if (local) {
    try {
      local.removeItem(STATE_KEY);
    } catch {
      /* best-effort */
    }
    return;
  }
  const native = nativeStorage();
  if (!native) return;
  try {
    await native.removeItem(STATE_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Drain the queue for import after account creation: returns every pending item
 * and clears local storage in one step. The caller imports each item through the
 * normal post-account path (createSource / record). Nothing here touches the
 * server, so draining is safe to call before the import actually runs only if the
 * caller persists the returned list first.
 */
export async function drainPendingCaptures(): Promise<PendingCapture[]> {
  const list = await loadPendingCaptures();
  if (list.length > 0) await clearPendingCaptures();
  return list;
}

/**
 * Overwrite the queue with exactly `list`. Used by the post-account import to
 * retain ONLY the items that failed to import (so a partial failure never loses
 * a capture and never re-imports a succeeded one on retry). Passing [] clears it.
 */
export async function replacePendingCaptures(list: PendingCapture[]): Promise<void> {
  await writeList(list);
}
