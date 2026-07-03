// App feature preferences for the 설정 (settings) root tab — the reference
// SettingsScreen `env` surface (sb-app.jsx): feature on/off flags, data-source
// connections, and the accent palette. Persisted like crew-density (web
// localStorage / native AsyncStorage / memory fallback) so a toggle survives a
// restart. These are user PREFERENCES; the deep feature wiring (real app-lock,
// call transcription, live OAuth) lands per workstream — the persistence,
// defaults, and reactive state are real now so the runtime hook-up is a swap.

import { useCallback, useEffect, useState } from "react";

// ─── Shapes ─────────────────────────────────────────────────────────────────
export type FeatureKey = "autotag" | "notify" | "applock" | "ondevice" | "callrec";
export type ConnectionKey = "cal" | "health" | "notion";
export type AccentPalette = "cyan" | "violet";

export type FeatureFlags = Record<FeatureKey, boolean>;
export type Connections = Record<ConnectionKey, boolean>;

// Reference defaults (sb-app env): autotag + ondevice default ON, the rest OFF.
export const DEFAULT_FEATURES: FeatureFlags = {
  autotag: true,
  notify: false,
  applock: false,
  ondevice: true,
  callrec: false,
};
export const DEFAULT_CONNECTIONS: Connections = { cal: false, health: false, notion: false };
export const DEFAULT_PALETTE: AccentPalette = "cyan";

interface AppFeaturesState {
  features: FeatureFlags;
  connections: Connections;
  palette: AccentPalette;
}

const DEFAULT_STATE: AppFeaturesState = {
  features: DEFAULT_FEATURES,
  connections: DEFAULT_CONNECTIONS,
  palette: DEFAULT_PALETTE,
};

export const APP_FEATURES_KEY = "settings.appFeatures.v1";

// ─── Persistence (mirrors src/lib/settings/crew-density.ts) ──────────────────
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryState: AppFeaturesState | null = null;

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

function parseState(raw: string | null | undefined): AppFeaturesState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppFeaturesState>;
    return {
      // Merge over defaults so a stored blob from an older key set (missing a
      // newer flag) stays valid rather than dropping the whole preference.
      features: { ...DEFAULT_FEATURES, ...(parsed.features ?? {}) },
      connections: { ...DEFAULT_CONNECTIONS, ...(parsed.connections ?? {}) },
      palette: parsed.palette === "violet" ? "violet" : "cyan",
    };
  } catch {
    return null;
  }
}

function writeState(state: AppFeaturesState): void {
  memoryState = state;
  const raw = JSON.stringify(state);
  ls()?.setItem(APP_FEATURES_KEY, raw);
  const storage = nativeStorage();
  if (storage) void storage.setItem(APP_FEATURES_KEY, raw).catch(() => undefined);
}

export interface UseAppFeatures {
  features: FeatureFlags;
  setFeature: (key: FeatureKey, value: boolean) => void;
  connections: Connections;
  setConnection: (key: ConnectionKey, value: boolean) => void;
  palette: AccentPalette;
  setPalette: (value: AccentPalette) => void;
}

/** Persisted settings preferences (features / connections / accent palette). */
export function useAppFeatures(): UseAppFeatures {
  const [state, setState] = useState<AppFeaturesState>(() => {
    const local = ls();
    if (local) return parseState(local.getItem(APP_FEATURES_KEY)) ?? DEFAULT_STATE;
    if (memoryState) return memoryState;
    return DEFAULT_STATE;
  });

  useEffect(() => {
    // Web read is synchronous above; only native needs async hydration.
    if (ls() || memoryState) return;
    const storage = nativeStorage();
    if (!storage) return;
    let cancelled = false;
    storage
      .getItem(APP_FEATURES_KEY)
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseState(raw);
        if (parsed) {
          memoryState = parsed;
          setState(parsed);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: AppFeaturesState) => {
    setState(next);
    writeState(next);
  }, []);

  const setFeature = useCallback(
    (key: FeatureKey, value: boolean) => {
      persist({ ...(memoryState ?? state), features: { ...(memoryState ?? state).features, [key]: value } });
    },
    [persist, state],
  );
  const setConnection = useCallback(
    (key: ConnectionKey, value: boolean) => {
      persist({ ...(memoryState ?? state), connections: { ...(memoryState ?? state).connections, [key]: value } });
    },
    [persist, state],
  );
  const setPalette = useCallback(
    (value: AccentPalette) => {
      persist({ ...(memoryState ?? state), palette: value });
    },
    [persist, state],
  );

  return {
    features: state.features,
    setFeature,
    connections: state.connections,
    setConnection,
    palette: state.palette,
    setPalette,
  };
}

export function __resetAppFeaturesForTests(): void {
  memoryState = null;
}
