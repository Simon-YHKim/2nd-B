// Light / dark theme toggle.
//
// 2026-05-27 — every screen now uses `semantic.*` which defaults to the
// dark-sky palette. When the user flips to "light" we want to swap that
// SAME shape for the lightSky palette without forcing every screen to
// be rewritten. useThemePalette() returns a same-shape object the
// caller can spread over their styles.
//
// Persistence: localStorage on Web (matches our i18n detector pattern).
// Native builds will layer AsyncStorage in a later refactor.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

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
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial mode: stored preference if available, else default to dark
  // (the loader + main navigator are dark, so first-visit users land on
  // an already-coherent dark experience).
  const [mode, setModeState] = useState<ThemeMode>(() => readStored() ?? "dark");

  // Hydrate once on mount in case readStored() was unavailable during
  // initial render (e.g. SSR snapshot). The mount-only intent is the
  // whole point — comparing against the initial `mode` value would
  // miss user toggles, so we read fresh on every effect call and just
  // bail when storage matches state.
  useEffect(() => {
    const s = readStored();
    setModeState((current) => (s && s !== current ? s : current));
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

/**
 * Returns the active semantic palette as the same shape as `semantic`.
 * Spread or destructure into inline styles — same keys as the static
 * `semantic` import so call sites can swap one for the other.
 */
export function useThemePalette(): Palette {
  const { mode } = useTheme();
  return mode === "dark" ? semantic : semanticLight;
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
