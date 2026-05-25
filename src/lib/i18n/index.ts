import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import enAuth from "../../../locales/en/auth.json";
import enCapture from "../../../locales/en/capture.json";
import enCommon from "../../../locales/en/common.json";
import enConsent from "../../../locales/en/consent.json";
import enSafety from "../../../locales/en/safety.json";
import koAuth from "../../../locales/ko/auth.json";
import koCapture from "../../../locales/ko/capture.json";
import koCommon from "../../../locales/ko/common.json";
import koConsent from "../../../locales/ko/consent.json";
import koSafety from "../../../locales/ko/safety.json";
import { detectLanguage } from "./languageDetector";

export const NAMESPACES = ["common", "auth", "safety", "consent", "capture"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: { common: enCommon, auth: enAuth, safety: enSafety, consent: enConsent, capture: enCapture },
  ko: { common: koCommon, auth: koAuth, safety: koSafety, consent: koConsent, capture: koCapture },
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
  return i18next;
}
