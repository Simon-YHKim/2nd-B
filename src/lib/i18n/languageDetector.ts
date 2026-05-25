import * as Localization from "expo-localization";

// Returns "ko" when the device prefers Korean, otherwise "en".
export function detectLanguage(): "en" | "ko" {
  try {
    const locales = Localization.getLocales();
    const first = locales[0]?.languageCode;
    if (first === "ko") return "ko";
    return "en";
  } catch {
    return "en";
  }
}
