// Lite mode (O-R2 ③ low-spec support): ONE switch that routes the existing
// performance levers to their lightest settings - no new render paths.
//
//   1) Motion: prefersReducedMotion() (src/lib/motion/signature.ts) ORs this
//      flag in, so every animation consumer (graph spawn/zoom, save pop,
//      companion sprites, celebrations) collapses to its no-motion branch.
//   2) Decorative crew: useCrewCount() returns 0 sprites. The stored density
//      preference is untouched - switching lite off restores it.
//   3) Graph glow LOD: NodeGlow draws 2 of the 4 pixel-halo rings. Per-tier
//      alpha scaling is unchanged, so the visual tier hierarchy holds.
//
// Persisted like readable-font (web localStorage / native AsyncStorage /
// memory fallback), with a SYNC getter for pure call sites. On native the
// stored value hydrates async into the memory cache, so the first frames of
// a cold start may run full-fat once - same class as draft hydration.

import { useCallback, useEffect, useState } from "react";

export const DEFAULT_LITE_MODE = false;
export const LITE_MODE_KEY = "appearance.liteMode.v1";

// ─── Persistence (mirrors src/lib/settings/readable-font.ts) ────────────────
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryLiteMode: boolean | null = null;
let nativeHydrationStarted = false;
const listeners = new Set<(enabled: boolean) => void>();

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

export function parseLiteMode(v: string | null | undefined): boolean | null {
  if (v === "on") return true;
  if (v === "off") return false;
  return null;
}

// Native cold start: pull the stored value into the memory cache once so the
// sync getter (and with it the motion chokepoint) converges without waiting
// for a settings screen to mount. Idempotent, best-effort.
function ensureNativeHydration(): void {
  if (nativeHydrationStarted || memoryLiteMode !== null || ls()) return;
  const storage = nativeStorage();
  if (!storage) return;
  nativeHydrationStarted = true;
  storage
    .getItem(LITE_MODE_KEY)
    .then((v) => {
      const parsed = parseLiteMode(v);
      if (parsed === null || memoryLiteMode !== null) return;
      memoryLiteMode = parsed;
      for (const listener of listeners) listener(parsed);
    })
    .catch(() => undefined);
}

/** Sync read for pure call sites (motion chokepoint). */
export function isLiteModeEnabled(): boolean {
  const local = ls();
  if (local) return parseLiteMode(local.getItem(LITE_MODE_KEY)) ?? DEFAULT_LITE_MODE;
  if (memoryLiteMode !== null) return memoryLiteMode;
  ensureNativeHydration();
  return DEFAULT_LITE_MODE;
}

export function setLiteMode(enabled: boolean): void {
  memoryLiteMode = enabled;
  ls()?.setItem(LITE_MODE_KEY, enabled ? "on" : "off");
  const storage = nativeStorage();
  if (storage) void storage.setItem(LITE_MODE_KEY, enabled ? "on" : "off").catch(() => undefined);
  for (const listener of listeners) listener(enabled);
}

/** Persisted lite-mode preference + setter. Every subscriber re-renders on
 *  change so the graph/crew/motion consumers follow without a reload. */
export function useLiteMode(): { liteMode: boolean; setLiteMode: (enabled: boolean) => void } {
  const [liteMode, setLiteModeState] = useState<boolean>(isLiteModeEnabled);

  useEffect(() => {
    const listener = (enabled: boolean) => setLiteModeState(enabled);
    listeners.add(listener);
    ensureNativeHydration();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const set = useCallback((enabled: boolean) => {
    setLiteModeState(enabled);
    setLiteMode(enabled);
  }, []);

  return { liteMode, setLiteMode: set };
}

export function __resetLiteModeForTests(): void {
  memoryLiteMode = null;
  nativeHydrationStarted = false;
  listeners.clear();
}
