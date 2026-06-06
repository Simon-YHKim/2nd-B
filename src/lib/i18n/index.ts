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
import enJarvis from "../../../locales/en/jarvis.json";
import enMascot from "../../../locales/en/mascot.json";
import enNotFound from "../../../locales/en/notFound.json";
import enPermissions from "../../../locales/en/permissions.json";
import enProfile from "../../../locales/en/profile.json";
import enRecordDetail from "../../../locales/en/recordDetail.json";
import enResearch from "../../../locales/en/research.json";
import enSafety from "../../../locales/en/safety.json";
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
import koJarvis from "../../../locales/ko/jarvis.json";
import koMascot from "../../../locales/ko/mascot.json";
import koNotFound from "../../../locales/ko/notFound.json";
import koPermissions from "../../../locales/ko/permissions.json";
import koProfile from "../../../locales/ko/profile.json";
import koRecordDetail from "../../../locales/ko/recordDetail.json";
import koResearch from "../../../locales/ko/research.json";
import koSafety from "../../../locales/ko/safety.json";
import koSupport from "../../../locales/ko/support.json";
import koTheme from "../../../locales/ko/theme.json";
import koWiki from "../../../locales/ko/wiki.json";
import { detectLanguage, saveLanguagePreference } from "./languageDetector";

export const NAMESPACES = ["common", "auth", "safety", "consent", "capture", "inbox", "jarvis", "wiki", "mascot", "support", "data", "esm", "formats", "insights", "research", "recordDetail", "theme", "import", "notFound", "profile", "permissions"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: { common: enCommon, auth: enAuth, safety: enSafety, consent: enConsent, capture: enCapture, inbox: enInbox, jarvis: enJarvis, wiki: enWiki, mascot: enMascot, support: enSupport, data: enData, esm: enEsm, formats: enFormats, insights: enInsights, research: enResearch, recordDetail: enRecordDetail, theme: enTheme, import: enImport, notFound: enNotFound, profile: enProfile, permissions: enPermissions },
  ko: { common: koCommon, auth: koAuth, safety: koSafety, consent: koConsent, capture: koCapture, inbox: koInbox, jarvis: koJarvis, wiki: koWiki, mascot: koMascot, support: koSupport, data: koData, esm: koEsm, formats: koFormats, insights: koInsights, research: koResearch, recordDetail: koRecordDetail, theme: koTheme, import: koImport, notFound: koNotFound, profile: koProfile, permissions: koPermissions },
} as const;

let initialized = false;
export function initI18n(): typeof i18next {
  if (initialized) return i18next;
  initialized = true;
  void i18next.use(initReactI18next).init({
    resources,
    lng: detectLanguage(),
    fallbackLng: "en",
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v3",
  });
  // Persist whenever the user (or any code path) flips the active language.
  i18next.on("languageChanged", (lng) => {
    if (lng === "en" || lng === "ko") saveLanguagePreference(lng);
  });
  return i18next;
}
