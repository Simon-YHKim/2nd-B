import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import enAuth from "../../../locales/en/auth.json";
import enCapture from "../../../locales/en/capture.json";
import enCommon from "../../../locales/en/common.json";
import enConsent from "../../../locales/en/consent.json";
import enData from "../../../locales/en/data.json";
import enEsm from "../../../locales/en/esm.json";
import enFormats from "../../../locales/en/formats.json";
import enImport from "../../../locales/en/import.json";
import enInsights from "../../../locales/en/insights.json";
import enInbox from "../../../locales/en/inbox.json";
import enSecondb from "../../../locales/en/secondb.json";
import enPlans from "../../../locales/en/plans.json";
import enNotFound from "../../../locales/en/notFound.json";
import enPermissions from "../../../locales/en/permissions.json";
import enProfile from "../../../locales/en/profile.json";
import enRecordDetail from "../../../locales/en/recordDetail.json";
import enResearch from "../../../locales/en/research.json";
import enSafety from "../../../locales/en/safety.json";
import enSettings from "../../../locales/en/settings.json";
import enSupport from "../../../locales/en/support.json";
import enTheme from "../../../locales/en/theme.json";
import enWiki from "../../../locales/en/wiki.json";
import koAuth from "../../../locales/ko/auth.json";
import koCapture from "../../../locales/ko/capture.json";
import koCommon from "../../../locales/ko/common.json";
import koConsent from "../../../locales/ko/consent.json";
import koData from "../../../locales/ko/data.json";
import koEsm from "../../../locales/ko/esm.json";
import koFormats from "../../../locales/ko/formats.json";
import koImport from "../../../locales/ko/import.json";
import koInsights from "../../../locales/ko/insights.json";
import koInbox from "../../../locales/ko/inbox.json";
import koSecondb from "../../../locales/ko/secondb.json";
import koPlans from "../../../locales/ko/plans.json";
import koNotFound from "../../../locales/ko/notFound.json";
import koPermissions from "../../../locales/ko/permissions.json";
import koProfile from "../../../locales/ko/profile.json";
import koRecordDetail from "../../../locales/ko/recordDetail.json";
import koResearch from "../../../locales/ko/research.json";
import koSafety from "../../../locales/ko/safety.json";
import koSettings from "../../../locales/ko/settings.json";
import koSupport from "../../../locales/ko/support.json";
import koTheme from "../../../locales/ko/theme.json";
import koWiki from "../../../locales/ko/wiki.json";
import { detectLanguage, loadNativeLanguagePreference, saveLanguagePreference } from "./languageDetector";
import { isAvailableUiLocale, type AvailableUiLocale } from "./locales";

export const NAMESPACES = ["common", "auth", "safety", "consent", "capture", "inbox", "secondb", "plans", "wiki", "support", "data", "esm", "formats", "insights", "research", "recordDetail", "theme", "import", "notFound", "profile", "permissions", "settings"] as const;
export type Namespace = (typeof NAMESPACES)[number];

// Keyed by AVAILABLE_UI_LOCALES (locales.ts is the single source of truth):
// shipping a new pack = add its bundle imports here + the code to that list,
// and the `satisfies` below fails the build if either side is missed.
export const resources = {
  en: { common: enCommon, auth: enAuth, safety: enSafety, consent: enConsent, capture: enCapture, inbox: enInbox, secondb: enSecondb, plans: enPlans, wiki: enWiki, support: enSupport, data: enData, esm: enEsm, formats: enFormats, insights: enInsights, research: enResearch, recordDetail: enRecordDetail, theme: enTheme, import: enImport, notFound: enNotFound, profile: enProfile, permissions: enPermissions, settings: enSettings },
  ko: { common: koCommon, auth: koAuth, safety: koSafety, consent: koConsent, capture: koCapture, inbox: koInbox, secondb: koSecondb, plans: koPlans, wiki: koWiki, support: koSupport, data: koData, esm: koEsm, formats: koFormats, insights: koInsights, research: koResearch, recordDetail: koRecordDetail, theme: koTheme, import: koImport, notFound: koNotFound, profile: koProfile, permissions: koPermissions, settings: koSettings },
} as const satisfies Record<AvailableUiLocale, Record<Namespace, unknown>>;

let initialized = false;
export function initI18n(): typeof i18next {
  if (initialized) return i18next;
  initialized = true;
  void i18next.use(initReactI18next).init({
    resources,
    lng: detectLanguage(),
    // EN is canonical (C7) and the universal fallback: a beta pack with a
    // missing key renders the EN string, never a raw key name.
    fallbackLng: "en",
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v3",
  });
  // Persist whenever the user (or any code path) flips the active language,
  // and keep the web document language in sync (screen readers pick their
  // voice from <html lang>; the static export defaults to "ko"). Both stay
  // inside the available-guard: stamping lang for a locale whose content
  // falls back to EN would point screen readers at the wrong voice.
  i18next.on("languageChanged", (lng) => {
    if (!isAvailableUiLocale(lng)) return;
    saveLanguagePreference(lng);
    try {
      if (typeof document !== "undefined") document.documentElement.lang = lng;
    } catch {
      // native: no document
    }
  });
  // Native: the persisted manual choice lives in AsyncStorage (async), so it
  // can't make the synchronous first paint - apply it once it resolves.
  // No-op on web and when it matches what detection already picked.
  void loadNativeLanguagePreference()
    .then((saved) => {
      if (saved && saved !== i18next.language) void i18next.changeLanguage(saved);
    })
    .catch(() => {});
  return i18next;
}
