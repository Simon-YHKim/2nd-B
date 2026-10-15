// The app palette. The app is always dark.
//
// 2026-10-05 — Simon 결정 Q-261005-02 (A + 메모 "다크모드 없어도 괜찮아. 그냥 없애버려."):
// 다크/라이트 선택을 숨기지 않고 없앴다. 설정의 '다크 모드' 토글, /theme 의 '미드나잇'(라이트)
// 고르기, 그 값을 기억하던 저장 키 읽기, mode 상태가 전부 빠졌다. 전에는 라이트를 고르면
// 글자만 밝은 팔레트로 바뀌고 딥스페이스 화면 바탕은 정적 어두운 색 그대로라
// /settings 머리 설명이 2.11:1 로 묻혔다(QA R2B-07). 이제 라이트 팔레트를 고르는 길이 코드에
// 없으므로 그 결함은 구조로 닫힌다. 예전에 저장된 값은 읽지 않고, 남은 키는
// retired-theme-mode.ts 가 한 번 지운다. 시스템 prefers-color-scheme 은 전과 같이 따르지 않는다.
// 지운 원본: origin/main 5104a686 의 이 파일(git -C E:/2ndB show 5104a686:src/lib/theme/ThemeContext.tsx).
//
// useThemePalette() is still the one read site for `<Text>` and friends: it returns the
// same-shape `semantic` palette, or a PaletteOverride when a surface draws on its own ground.

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { semantic } from "./tokens";

// The root layout drops the retired dark/light key once at boot; it imports the helper
// from here so the theme module stays the one place the root reads theme things from.
export { clearRetiredThemeMode } from "./retired-theme-mode";

// Same-shape, looser-value mirror of `semantic` so an override palette can stand in for
// the `as const` object without TS clashing on its literal types.
export type Palette = { [K in keyof typeof semantic]: string };

/**
 * @deprecated The app has no light palette to force away from (Q-261005-02), so this
 * renders its children unchanged. It stays exported only because two call sites still
 * wrap with it (PremiumAppShell in premium/background.tsx and AccountDeletionNotice,
 * whose test pins it); remove it with them once the account-deletion lane that owns
 * that screen has merged.
 */
export function ForceDark({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ── Palette override subtree (Polaris card, 2026-09-30) ────────────────
// A surface with its own ground (the Polaris card is deep violet, not the
// sky navy) hands its children a palette tuned for that ground, so every
// <Text color="textMuted"> inside it stays readable without each call site
// knowing where it is drawn.
const PaletteOverrideContext = createContext<Palette | null>(null);

export function PaletteOverride({ palette, children }: { palette: Palette; children: ReactNode }) {
  return <PaletteOverrideContext.Provider value={palette}>{children}</PaletteOverrideContext.Provider>;
}

/**
 * The palette a subtree draws with: its PaletteOverride if one is set, otherwise the
 * app's one (dark) `semantic` palette. There is no other input, which is the guarantee:
 * nothing the user stored and nothing the OS reports can hand a screen a light palette.
 */
export function resolvePalette(override: Palette | null): Palette {
  return override ?? semantic;
}

/**
 * Returns the active semantic palette as the same shape as `semantic`.
 * Spread or destructure into inline styles — same keys as the static
 * `semantic` import so call sites can swap one for the other.
 */
export function useThemePalette(): Palette {
  return resolvePalette(useContext(PaletteOverrideContext));
}
