// Light / dark theme toggle.
//
// 2026-05-27 — every screen now uses `semantic.*` which defaults to the
// dark-sky palette. When the user flips to "light" we want to swap that
// SAME shape for the lightSky palette without forcing every screen to
// be rewritten. useThemePalette() returns a same-shape object the
// caller can spread over their styles.
//
// Persistence: localStorage on Web (synchronous, no first-paint flash; matches
// our i18n detector pattern) + AsyncStorage on native (hydrated once on mount,
// since native has no synchronous storage). setMode writes both.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { semantic, semanticLight, darkSky, lightSky } from "./tokens";

// Same-shape, looser-value mirror of `semantic` so the runtime palette
// can swap between the two `as const` objects without TS clashing on
// their literal types.
export type Palette = { [K in keyof typeof semantic]: string };
export type SkyPalette = { [K in keyof typeof darkSky]: string };

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  setMode: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "2nd-brain:theme-mode";

function readStored(): ThemeMode | null {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined") {
      const v = (globalThis as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    }
  } catch {
    // localStorage unavailable (private mode, native build) — fall through
  }
  return null;
}

function writeStored(m: ThemeMode): void {
  try {
    if (typeof globalThis !== "undefined" && typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined") {
      (globalThis as { localStorage: Storage }).localStorage.setItem(STORAGE_KEY, m);
    }
  } catch {
    // silently skip — next session will fall back to default dark
  }
  // Native persistence (and a web backstop): AsyncStorage. Fire-and-forget; a
  // write failure just means the next session falls back to the default.
  void AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial mode: stored preference if available, else default to dark
  // (the loader + main navigator are dark, so first-visit users land on
  // an already-coherent dark experience).
  const [mode, setModeState] = useState<ThemeMode>(() => readStored() ?? "dark");

  // Hydrate once on mount. On web, readStored() (localStorage) is synchronous
  // and authoritative. On native there is no synchronous storage, so fall back
  // to the async AsyncStorage read to recover the user's persisted choice
  // (a brief default first paint before hydration is acceptable). We read fresh
  // here rather than comparing the initial `mode` so user toggles aren't undone.
  useEffect(() => {
    const sync = readStored();
    if (sync) {
      setModeState((current) => (sync !== current ? sync : current));
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (cancelled) return;
        if (v === "light" || v === "dark") {
          setModeState((current) => (v !== current ? v : current));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function setMode(m: ThemeMode): void {
    setModeState(m);
    writeStored(m);
  }

  function toggle(): void {
    setMode(mode === "dark" ? "light" : "dark");
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ── Force-dark subtree (graph-ux-overhaul #4) ───────────────────────────
// The cosmic PremiumAppShell background is ALWAYS dark (constraint #4: the
// village stays dark even in light mode). So any text/surfaces rendered on
// it must use the dark palette regardless of the user's theme toggle —
// otherwise light mode paints dark navy text on the dark cosmic bg and it's
// invisible. PremiumAppShell wraps its children in <ForceDark> and
// useThemePalette() honours it. The real `mode` (via useTheme) is untouched,
// so the Theme screen's selection UI still reflects the user's choice.
const ForceDarkContext = createContext(false);

export function ForceDark({ children }: { children: ReactNode }) {
  return <ForceDarkContext.Provider value={true}>{children}</ForceDarkContext.Provider>;
}

export function useForceDark(): boolean {
  return useContext(ForceDarkContext);
}

/**
 * Returns the active semantic palette as the same shape as `semantic`.
 * Spread or destructure into inline styles — same keys as the static
 * `semantic` import so call sites can swap one for the other.
 */
export function useThemePalette(): Palette {
  const { mode } = useTheme();
  const forceDark = useForceDark();
  return mode === "dark" || forceDark ? semantic : semanticLight;
}

/**
 * Returns the active sky-palette (loader / navigator raw colors). Used
 * by screens that import `darkSky` directly (LoadingScreen, sign-in,
 * NavGraph) so they too track the toggle.
 */
export function useSkyPalette(): SkyPalette {
  const { mode } = useTheme();
  return mode === "dark" ? darkSky : lightSky;
}
