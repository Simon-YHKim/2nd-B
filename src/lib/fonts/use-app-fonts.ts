// App fonts, native. Same as before: useFonts() and the root layout waits for
// them under the splash screen (they load from the app bundle, so it is short).
// The web variant (use-app-fonts.web.ts) loads them after the page starts so
// they do not compete with the app code before the opening.
import { useFonts } from "expo-font";

import { fontAssets } from "@/theme/typography";

/** [loaded, error], like useFonts(). */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts(fontAssets);
}
