/**
 * Wiki auto-promotion preference — should a newly captured source become a wiki
 * page by itself, or only when the user asks for it?
 *
 * DEFAULT IS OFF (manual). That is a cost decision, not a taste one. The file
 * header on phase2.ts still calls promotion a "no-LLM stub", but phase2.ts:19
 * imports embedAndStorePage and calls it whenever EXPO_PUBLIC_LLM_MODE is not
 * "mock" — and eas.json plus android-release.yml pin `live` in every shipped
 * build, so that guard protects nothing in production. Auto-promotion therefore
 * buys one gemini-embedding-2 call per capture, and it is the one step in the
 * promotion that is NOT idempotent on cost: embeddings.ts has no "already
 * embedded" skip, so a re-promotion re-bills for an identical vector. Cheap per
 * call, spend-capped at the proxy, but never free. Off by default is the honest
 * default.
 *
 * SERVER-persisted in users.reasoning_prefs (0093), same shape and same reasons
 * as reasoning/auto-pref.ts: a device-local promotion policy would silently
 * diverge across devices and reset on reinstall, which is the exact failure 0093
 * was written to fix. Stored under its own `wikiAuto` key; the write is a
 * read-merge-write so the neighbouring `auto` key (automatic reasoning) survives.
 *
 * Fail-soft everywhere: read is cache -> server -> local mirror -> false, write
 * lands locally first and only warns if the server rejects. A toggle must never
 * be lost to a network blip, and promotion must never block a capture.
 */

import { getSupabaseClient } from "../supabase/client";

const LOCAL_KEY_PREFIX = "wiki.autoPromote.v1";
// The capture path checks this on every save; one server read per ~30s is
// plenty fresh for a toggle (same reasoning as auto-pref.ts).
const READ_CACHE_MS = 30_000;

/** Manual promotion is the default. Simon, 2026-08-03. */
export const DEFAULT_WIKI_AUTO_PROMOTE = false;

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

function resolveWikiAuto(stored: unknown): boolean | null {
  if (!stored || typeof stored !== "object") return null;
  const value = (stored as Record<string, unknown>).wikiAuto;
  return typeof value === "boolean" ? value : null;
}

/**
 * Read the auto-promotion preference. Fail-soft chain: cache -> server -> local
 * mirror -> false.
 */
export async function getWikiAutoPromote(userId: string): Promise<boolean> {
  const cached = readCache.get(userId);
  if (cached && Date.now() - cached.at < READ_CACHE_MS) return cached.value;
  try {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("reasoning_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    const server = resolveWikiAuto(data?.reasoning_prefs);
    if (server !== null) {
      readCache.set(userId, { value: server, at: Date.now() });
      void writeLocalMirror(userId, server).catch(() => undefined);
      return server;
    }
    // Row readable but the key was never set — fall through to the mirror, then
    // to the manual default.
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[wiki] auto-promote server read failed; using local mirror", (e as Error).message);
    }
  }
  const mirrored = await readLocalMirror(userId).catch(() => null);
  const value = mirrored ?? DEFAULT_WIKI_AUTO_PROMOTE;
  readCache.set(userId, { value, at: Date.now() });
  return value;
}

/**
 * Persist the auto-promotion preference. Local mirror + cache first, then the
 * server merge-write. Warn-only on server failure — never throws.
 */
export async function setWikiAutoPromote(userId: string, enabled: boolean): Promise<void> {
  readCache.set(userId, { value: enabled, at: Date.now() });
  await writeLocalMirror(userId, enabled).catch(() => undefined);
  try {
    const client = getSupabaseClient();
    // Read-merge-write: `auto` (automatic reasoning) lives in the same jsonb and
    // must survive a wikiAuto write. Clobbering it would silently switch off a
    // feature the user turned on from a different screen.
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
      .update({ reasoning_prefs: { ...stored, wikiAuto: enabled } })
      .eq("id", userId);
    if (error) throw error;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[wiki] auto-promote server write failed; local mirror kept", (e as Error).message);
    }
  }
}

/**
 * Promote a freshly captured source to a wiki page, but only when the user asked
 * for that to happen automatically.
 *
 * Fire-and-forget by contract: the caller must not await the outcome and must
 * not surface a failure. A capture is saved the moment its row lands; whether it
 * also became a wiki page is a background nicety, and a promotion that throws
 * (a pending Storage upload, an offline device) must never cost the user their
 * capture or block the success panel.
 */
export async function maybeAutoPromoteSource(userId: string, sourceId: string): Promise<void> {
  try {
    if (!(await getWikiAutoPromote(userId))) return;
    const { generateSourcePage } = await import("./phase2");
    await generateSourcePage(userId, sourceId);
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[wiki] auto-promote skipped", (e as Error).message);
    }
  }
}

/** Test seam: drop the in-memory read cache (and optionally the memory mirror). */
export function __resetWikiAutoPromoteForTests(clearMirror = false): void {
  readCache.clear();
  if (clearMirror) memoryMirror.clear();
}
