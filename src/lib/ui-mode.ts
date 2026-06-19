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
 * CUTOVER (2026-06-19): the deep-space shell is now live on both tracks. Web
 * (web-deploy.yml) and native (eas production env) both pin EXPO_PUBLIC_UI=
 * deep-space after the real-data wiring landed. The code default already resolved
 * to deep-space; the deploy pins now match it. EXPO_PUBLIC_UI=legacy remains the
 * whole-app rollback path on either track.
 *
 * Character render strategy (D-23 hybrid, mitigates the native-3D resource risk):
 *   EXPO_PUBLIC_CHARACTER=3d        → interactive r3f/expo-gl (DEFAULT, web home shell)
 *   EXPO_PUBLIC_CHARACTER=fallback  → static sprite / Lottie (low-end Android, sub-screens)
 * The native production build PINS EXPO_PUBLIC_CHARACTER=fallback: the r3f/expo-gl
 * 3D path (SVG-bridge / OOM risk per ANDROID_QA_GUIDELINES §3) needs on-device QA
 * before native ships 3d, so the conservative sprite path is the initial cutover.
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
