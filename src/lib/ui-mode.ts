/**
 * O-23 (D-23): app UI track flag. Selects the canonical deep-space character UI
 * vs the legacy gameboy track. Read once from the environment at module load.
 *
 *   EXPO_PUBLIC_UI=deep-space → deep-space character shell (DEFAULT, canonical)
 *   EXPO_PUBLIC_UI=legacy     → legacy gameboy track (explicit rollback)
 *
 * 2026-06-17 (Simon directive "deep-space 외 디자인은 다 레거시로 분류"): deep-space
 * is now the DEFAULT track. An unset/garbled flag resolves to deep-space, and
 * every other design (gameboy / cosmic / sky palettes) is the explicit `legacy`
 * rollback. Setting EXPO_PUBLIC_UI=legacy is the whole-app rollback path.
 *
 * LIVE GATE (memo D12 "F1-F4 수정 후 default"): the deep-space shell is not yet
 * feature-complete. Sub-screen theming (A3), secondary nav wiring (A1), unified
 * back (A5), and the 3D character (A4, still a static PNG) are in progress on the
 * O-23 track. So production/live builds PIN EXPO_PUBLIC_UI=legacy (web-deploy.yml
 * + eas production env) until that work lands. The code default flips here so
 * deep-space is canonical for development and the eventual cutover; the deploy
 * pin is what holds the live app on legacy in the meantime.
 *
 * Character render strategy (D-23 hybrid, mitigates the native-3D resource risk):
 *   EXPO_PUBLIC_CHARACTER=3d        → interactive r3f/expo-gl (DEFAULT, home shell)
 *   EXPO_PUBLIC_CHARACTER=fallback  → static sprite / Lottie (low-end Android, sub-screens)
 */
export type UiMode = "legacy" | "deep-space";
export type CharacterMode = "3d" | "fallback";

const uiRaw = (process.env.EXPO_PUBLIC_UI ?? "").trim().toLowerCase();
// Default flipped to deep-space (2026-06-17): only an explicit "legacy" opts out.
export const UI_MODE: UiMode = uiRaw === "legacy" ? "legacy" : "deep-space";

const charRaw = (process.env.EXPO_PUBLIC_CHARACTER ?? "").trim().toLowerCase();
export const CHARACTER_MODE: CharacterMode = charRaw === "fallback" ? "fallback" : "3d";

export function isDeepSpaceUI(): boolean {
  return UI_MODE === "deep-space";
}

export function isLegacyUI(): boolean {
  return UI_MODE === "legacy";
}

export function isCharacterFallback(): boolean {
  return CHARACTER_MODE === "fallback";
}
