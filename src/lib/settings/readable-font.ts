// Readable-font preference (P2-10, Simon-approved as an opt-in option).
//
// The app-wide pixel face (Galmuri, PIXEL-CLAY) is the visual identity, but
// low-vision personas (sim register P2-10) struggle with bitmap faces in long
// reading text. This preference swaps the shared <Text/> READING variants
// (body, subtle) and m3TextStyle's body roles to the readable sans (Pretendard,
// fontFamilies.readable). Chrome (display, heading, caption, pixelEn labels,
// buttons, tabs, card titles) keeps the pixel face: Simon 2026-08-21 Q2 = "본문만".
// Body legibility is the target, not a re-theme.
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

/**
 * 현재 값을 **훅 없이** 읽는다. `m3TextStyle()` 이 이걸 쓴다 -- 그 함수는 훅이
 * 아니고, 호출부 186곳 중 165곳이 렌더 중에 평가되므로 값을 읽기만 하면 된다.
 *
 * 웹은 localStorage 를 동기로 읽고, 네이티브는 `useFontStyle()` 이 부팅 때
 * 채워두는 메모리 값을 읽는다. 네이티브에서 그 하이드레이션 전이면 기본값
 * (pixel)이라 **픽셀로 시작했다가 읽는 글로 바뀌는** 것이지, 반대가 아니다.
 */
export function getFontStyle(): FontStyle {
  return readInitialFontStyle();
}

/**
 * 값이 바뀔 때 부르는 콜백. 훅이 아니라 **모듈 수준**에서 쓰라고 있는 것이다.
 *
 * 왜 필요하냐면 `StyleSheet.create({...})` 는 모듈이 로드될 때 **한 번만**
 * 평가되기 때문이다. 본문 스타일을 거기 얼려두면 설정을 바꿔도 그 화면만
 * 예전 얼굴로 남는다 -- 웹은 부팅 때 localStorage 를 동기로 읽으니 우연히
 * 맞지만, 네이티브는 하이드레이션이 비동기라 **영영 안 바뀐다.**
 *
 * 반환값은 해지 함수다. 모듈 수준 구독은 보통 해지하지 않는다(싱글턴).
 */
export function subscribeFontStyle(fn: (style: FontStyle) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
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
