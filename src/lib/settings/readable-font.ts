// Readable-font preference (P2-10, Simon-approved as an opt-in option).
//
// The app-wide pixel face (NeoDunggeunmo / Galmuri11) is part of the Cosmic
// Pixel Graph Village identity, but low-vision personas (sim register P2-10)
// struggle with bitmap faces — especially headings/captions at large font
// scale. This preference swaps the shared <Text/> pixel variants to the
// readable sans (Pretendard, fontFamilies.readable). Pixel chrome (buttons,
// tabs, premium card titles) keeps the pixel identity — body legibility is
// the target, not a re-theme.
//
// Persisted like crew-density (web localStorage / native AsyncStorage /
// memory fallback). On web it also flips `data-font` on <html> so the base
// CSS rule in +html.tsx follows the preference for raw DOM text.

import { useCallback, useEffect, useState } from "react";

export type FontStyle = "pixel" | "readable";
export const FONT_STYLE_ORDER: readonly FontStyle[] = ["pixel", "readable"];
export const DEFAULT_FONT_STYLE: FontStyle = "pixel";
export const FONT_STYLE_KEY = "appearance.fontStyle.v1";

// ─── Persistence (mirrors src/lib/settings/crew-density.ts) ─────────────────
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryFontStyle: FontStyle | null = null;
const listeners = new Set<(style: FontStyle) => void>();

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

export function parseFontStyle(v: string | null | undefined): FontStyle | null {
  return v && (FONT_STYLE_ORDER as readonly string[]).includes(v) ? (v as FontStyle) : null;
}

// Web only: the +html.tsx base CSS keys off this attribute so raw DOM text
// and form controls follow the preference (inline RN-web styles already do).
function syncHtmlFontAttribute(style: FontStyle): void {
  const doc = (globalThis as { document?: { documentElement?: { setAttribute(n: string, v: string): void } } }).document;
  doc?.documentElement?.setAttribute("data-font", style);
}

export function setFontStyle(style: FontStyle): void {
  memoryFontStyle = style;
  ls()?.setItem(FONT_STYLE_KEY, style);
  const storage = nativeStorage();
  if (storage) void storage.setItem(FONT_STYLE_KEY, style).catch(() => undefined);
  syncHtmlFontAttribute(style);
  for (const listener of listeners) listener(style);
}

function readInitialFontStyle(): FontStyle {
  const local = ls();
  if (local) return parseFontStyle(local.getItem(FONT_STYLE_KEY)) ?? DEFAULT_FONT_STYLE;
  if (memoryFontStyle) return memoryFontStyle;
  return DEFAULT_FONT_STYLE;
}

/** Persisted font-style preference + setter. Every subscriber re-renders on
 *  change so the whole app swaps faces without a reload. */
export function useFontStyle(): { fontStyle: FontStyle; setFontStyle: (s: FontStyle) => void } {
  const [fontStyle, setFontStyleState] = useState<FontStyle>(readInitialFontStyle);

  useEffect(() => {
    const listener = (style: FontStyle) => setFontStyleState(style);
    listeners.add(listener);
    // Web boot with a stored "readable": the state initializer read the value
    // but nothing flipped the <html> attribute yet — sync it once on mount.
    syncHtmlFontAttribute(readInitialFontStyle());
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    // Web read happens synchronously above; only native needs async hydration.
    if (ls() || memoryFontStyle) return;
    const storage = nativeStorage();
    if (!storage) return;
    let cancelled = false;
    storage
      .getItem(FONT_STYLE_KEY)
      .then((v) => {
        if (cancelled) return;
        const style = parseFontStyle(v);
        if (style) {
          memoryFontStyle = style;
          setFontStyleState(style);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback((style: FontStyle) => {
    setFontStyleState(style);
    setFontStyle(style);
  }, []);

  return { fontStyle, setFontStyle: set };
}

export function __resetFontStyleForTests(): void {
  memoryFontStyle = null;
  listeners.clear();
}
