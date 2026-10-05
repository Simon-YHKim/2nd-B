// Sound effects switch (Simon Q-261005-02 = A, 2026-10-05): one setting on the
// theme screen, on by default. Off silences every effect player (telescope,
// star photo, dialogue blip, the opening) and stops a running loop or opening.
// The ratchet haptic is separate and keeps following the motion.
//
// The players read one in-memory switch in src/lib/audio/ui-sound-player.ts.
// This module owns the stored value and keeps that switch in sync: at module
// load (web reads localStorage synchronously), when the native value hydrates,
// and on every change. Persisted like lite-mode (web localStorage / native
// AsyncStorage / memory fallback).

import { useCallback, useEffect, useState } from "react";
import { setSoundEffectsOn } from "../audio/ui-sound-player";

export const DEFAULT_SOUND_EFFECTS = true;
export const SOUND_EFFECTS_KEY = "audio.soundEffects.v1";

// ─── Persistence (mirrors src/lib/settings/lite-mode.ts) ────────────────────
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memorySoundEffects: boolean | null = null;
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

export function parseSoundEffects(v: string | null | undefined): boolean | null {
  if (v === "on") return true;
  if (v === "off") return false;
  return null;
}

/** Sync read for pure call sites. No side effects. */
export function isSoundEffectsEnabled(): boolean {
  const local = ls();
  if (local) return parseSoundEffects(local.getItem(SOUND_EFFECTS_KEY)) ?? DEFAULT_SOUND_EFFECTS;
  if (memorySoundEffects !== null) return memorySoundEffects;
  return DEFAULT_SOUND_EFFECTS;
}

// Native cold start: pull the stored value into memory and the player switch
// once, so an "off" set last session holds before the opening's first cue
// without waiting for the settings screen. A toggle made while the read is in
// flight wins over the stale stored value. Idempotent, best-effort.
export function ensureSoundEffectsHydration(): void {
  if (nativeHydrationStarted || memorySoundEffects !== null || ls()) return;
  const storage = nativeStorage();
  if (!storage) return;
  nativeHydrationStarted = true;
  storage
    .getItem(SOUND_EFFECTS_KEY)
    .then((v) => {
      const parsed = parseSoundEffects(v);
      if (parsed === null || memorySoundEffects !== null) return;
      memorySoundEffects = parsed;
      setSoundEffectsOn(parsed);
      for (const listener of listeners) listener(parsed);
    })
    .catch(() => undefined);
}

export function setSoundEffects(enabled: boolean): void {
  memorySoundEffects = enabled;
  ls()?.setItem(SOUND_EFFECTS_KEY, enabled ? "on" : "off");
  const storage = nativeStorage();
  if (storage) void storage.setItem(SOUND_EFFECTS_KEY, enabled ? "on" : "off").catch(() => undefined);
  setSoundEffectsOn(enabled);
  for (const listener of listeners) listener(enabled);
}

// Module load: the web value is readable now; native starts its hydration.
setSoundEffectsOn(isSoundEffectsEnabled());
ensureSoundEffectsHydration();

/** Persisted sound effects preference + setter for the settings row. */
export function useSoundEffects(): { soundEffects: boolean; setSoundEffects: (enabled: boolean) => void } {
  const [soundEffects, setSoundEffectsState] = useState<boolean>(isSoundEffectsEnabled);

  useEffect(() => {
    const listener = (enabled: boolean) => setSoundEffectsState(enabled);
    listeners.add(listener);
    ensureSoundEffectsHydration();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const set = useCallback((enabled: boolean) => {
    setSoundEffectsState(enabled);
    setSoundEffects(enabled);
  }, []);

  return { soundEffects, setSoundEffects: set };
}

export function __resetSoundEffectsForTests(): void {
  memorySoundEffects = null;
  nativeHydrationStarted = false;
  listeners.clear();
  setSoundEffectsOn(DEFAULT_SOUND_EFFECTS);
}
