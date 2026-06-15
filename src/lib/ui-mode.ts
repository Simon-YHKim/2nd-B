/**
 * O-23 (D-23): app UI track flag — the rollback mechanism for promoting the new
 * deep-space character UI to the app body while preserving the existing gameboy
 * track. Read once from the environment at module load.
 *
 *   EXPO_PUBLIC_UI=legacy     → existing gameboy track (DEFAULT — instant rollback)
 *   EXPO_PUBLIC_UI=deep-space → new deep-space character shell (D-23 architecture C)
 *
 * Legacy is the default so an unset/garbled flag never strands users on an
 * unfinished shell; flipping the flag back is the whole-app rollback path.
 *
 * Character render strategy (D-23 hybrid, mitigates the native-3D resource risk):
 *   EXPO_PUBLIC_CHARACTER=3d        → interactive r3f/expo-gl (DEFAULT, home shell)
 *   EXPO_PUBLIC_CHARACTER=fallback  → static sprite / Lottie (low-end Android, sub-screens)
 */
export type UiMode = "legacy" | "deep-space";
export type CharacterMode = "3d" | "fallback";

const uiRaw = (process.env.EXPO_PUBLIC_UI ?? "").trim().toLowerCase();
export const UI_MODE: UiMode = uiRaw === "deep-space" ? "deep-space" : "legacy";

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
