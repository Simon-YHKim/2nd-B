/**
 * Automatic-reasoning preference — SERVER-persisted (0093 users.reasoning_prefs,
 * privacy_prefs pattern), with the old client mirror kept as the offline /
 * pre-migration fallback (스펙 docs/reasoning-ux-spec_260718.html 화면 A, PR-B).
 *
 * Before this module the toggle lived only in localStorage / AsyncStorage
 * (reasoning.auto.v1.<uid>), so devices diverged and a reinstall reset it.
 * Resolution order now:
 *   read  — fresh in-memory cache → users.reasoning_prefs.auto → local mirror
 *           (server unreachable / column not yet migrated) → default OFF.
 *   write — local mirror + cache immediately (the UI must never lose a toggle
 *           to a network blip), then the server upsert; a failed server write
 *           warns instead of throwing — the local value keeps working exactly
 *           like the pre-0093 behavior and heals on the next successful save.
 *
 * Default is OFF for everyone (spec A 기본·OFF). Minors default OFF too and may
 * explicitly enable — age enforcement for the actual LLM run stays fail-closed
 * in the run path, never here.
 *
 * The short read cache exists because the auto-run enqueue checks this pref on
 * EVERY capture save; one server read per ~30s is plenty fresh for a toggle.
 */

import { getSupabaseClient } from "../supabase/client";

const LOCAL_KEY_PREFIX = "reasoning.auto.v1";
const READ_CACHE_MS = 30_000;

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const memoryMirror = new Map<string, boolean>();
const readCache = new Map<string, { value: boolean; at: number }>();

function localKey(userId: string): string {
  return `${LOCAL_KEY_PREFIX}.${userId}`;
}

function webStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function nativeStorage(): AsyncStorageLike | null {
  const nav = globalThis.navigator as { product?: string } | undefined;
  if (nav?.product !== "ReactNative") return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

async function readLocalMirror(userId: string): Promise<boolean | null> {
  const key = localKey(userId);
  const web = webStorage();
  if (web) {
    const raw = web.getItem(key);
    return raw === null ? null : raw === "1";
  }
  const native = nativeStorage();
  if (native) {
    const raw = await native.getItem(key);
    return raw === null ? null : raw === "1";
  }
  return memoryMirror.has(key) ? (memoryMirror.get(key) ?? false) : null;
}

async function writeLocalMirror(userId: string, enabled: boolean): Promise<void> {
  const key = localKey(userId);
  memoryMirror.set(key, enabled);
  const raw = enabled ? "1" : "0";
  const web = webStorage();
  if (web) {
    web.setItem(key, raw);
    return;
  }
  await nativeStorage()?.setItem(key, raw);
}

function resolveAuto(stored: unknown): boolean | null {
  if (!stored || typeof stored !== "object") return null;
  const auto = (stored as Record<string, unknown>).auto;
  return typeof auto === "boolean" ? auto : null;
}

/**
 * Read the automatic-reasoning preference. Fail-soft chain: cache → server →
 * local mirror → false. A successful server read refreshes the local mirror so
 * the offline fallback tracks the last-known server truth.
 */
export async function getAutoReasoningEnabled(userId: string): Promise<boolean> {
  const cached = readCache.get(userId);
  if (cached && Date.now() - cached.at < READ_CACHE_MS) return cached.value;
  try {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("reasoning_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    const server = resolveAuto(data?.reasoning_prefs);
    if (server !== null) {
      readCache.set(userId, { value: server, at: Date.now() });
      void writeLocalMirror(userId, server).catch(() => undefined);
      return server;
    }
    // Row readable but the key was never set — an old local-only toggle is the
    // closest truth we have (it predates 0093); fall through to the mirror.
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[reasoning] auto-pref server read failed; using local mirror", (e as Error).message);
    }
  }
  const mirrored = await readLocalMirror(userId).catch(() => null);
  const value = mirrored ?? false;
  readCache.set(userId, { value, at: Date.now() });
  return value;
}

/**
 * Persist the automatic-reasoning preference. Local mirror + cache first (the
 * toggle must survive a network blip exactly like the pre-0093 behavior), then
 * the server merge-write. Warn-only on server failure — never throws.
 */
export async function setAutoReasoningEnabled(userId: string, enabled: boolean): Promise<void> {
  readCache.set(userId, { value: enabled, at: Date.now() });
  await writeLocalMirror(userId, enabled).catch(() => undefined);
  try {
    const client = getSupabaseClient();
    // Merge over the stored object so future reasoning_prefs keys survive this
    // write (read-merge-write, same shape as savePrivacyPrefs).
    const { data, error: readError } = await client
      .from("users")
      .select("reasoning_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (readError) throw readError;
    const stored =
      data?.reasoning_prefs && typeof data.reasoning_prefs === "object"
        ? (data.reasoning_prefs as Record<string, unknown>)
        : {};
    const { error } = await client
      .from("users")
      .update({ reasoning_prefs: { ...stored, auto: enabled } })
      .eq("id", userId);
    if (error) throw error;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[reasoning] auto-pref server write failed; local mirror kept", (e as Error).message);
    }
  }
}

// ── First-ON intro (spec A 인터랙션: "처음 ON: 소비 규칙을 설명하는 bottom
// sheet 확인 후 활성화") ─────────────────────────────────────────────────
// Device-local by design: the intro is a one-time UI explainer, not a synced
// preference — a fresh device showing it once more is correct behavior.

const INTRO_KEY_PREFIX = "reasoning.auto.intro.v1";

function introKey(userId: string): string {
  return `${INTRO_KEY_PREFIX}.${userId}`;
}

/** Has this device already confirmed the auto-reasoning consumption rules? */
export async function getAutoIntroSeen(userId: string): Promise<boolean> {
  const key = introKey(userId);
  const web = webStorage();
  if (web) return web.getItem(key) === "1";
  const native = nativeStorage();
  if (native) return (await native.getItem(key)) === "1";
  return memoryMirror.get(key) === true;
}

/** Mark the first-ON intro as confirmed on this device. */
export async function setAutoIntroSeen(userId: string): Promise<void> {
  const key = introKey(userId);
  memoryMirror.set(key, true);
  const web = webStorage();
  if (web) {
    web.setItem(key, "1");
    return;
  }
  await nativeStorage()?.setItem(key, "1");
}

/** Test seam: drop the in-memory read cache (and optionally the memory mirror). */
export function __resetAutoPrefCacheForTests(clearMirror = false): void {
  readCache.clear();
  if (clearMirror) memoryMirror.clear();
}
