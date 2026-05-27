import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import enAuth from "../../../locales/en/auth.json";
import enCapture from "../../../locales/en/capture.json";
import enCommon from "../../../locales/en/common.json";
import enConsent from "../../../locales/en/consent.json";
import enInbox from "../../../locales/en/inbox.json";
import enJarvis from "../../../locales/en/jarvis.json";
import enMascot from "../../../locales/en/mascot.json";
import enSafety from "../../../locales/en/safety.json";
import enWiki from "../../../locales/en/wiki.json";
import koAuth from "../../../locales/ko/auth.json";
import koCapture from "../../../locales/ko/capture.json";
import koCommon from "../../../locales/ko/common.json";
import koConsent from "../../../locales/ko/consent.json";
import koInbox from "../../../locales/ko/inbox.json";
import koJarvis from "../../../locales/ko/jarvis.json";
import koMascot from "../../../locales/ko/mascot.json";
import koSafety from "../../../locales/ko/safety.json";
import koWiki from "../../../locales/ko/wiki.json";
import { detectLanguage, saveLanguagePreference } from "./languageDetector";

export const NAMESPACES = ["common", "auth", "safety", "consent", "capture", "inbox", "jarvis", "wiki", "mascot"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: { common: enCommon, auth: enAuth, safety: enSafety, consent: enConsent, capture: enCapture, inbox: enInbox, jarvis: enJarvis, wiki: enWiki, mascot: enMascot },
  ko: { common: koCommon, auth: koAuth, safety: koSafety, consent: koConsent, capture: koCapture, inbox: koInbox, jarvis: koJarvis, wiki: koWiki, mascot: koMascot },
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
    compatibilityJSON: "v4",
  });
  // Persist whenever the user (or any code path) flips the active language.
  i18next.on("languageChanged", (lng) => {
    if (lng === "en" || lng === "ko") saveLanguagePreference(lng);
  });
  return i18next;
}
