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
import enOps from "../../../locales/en/ops.json";
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
import koOps from "../../../locales/ko/ops.json";
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
import esAuth from "../../../locales/es/auth.json";
import esCapture from "../../../locales/es/capture.json";
import esCommon from "../../../locales/es/common.json";
import esConsent from "../../../locales/es/consent.json";
import esData from "../../../locales/es/data.json";
import esEsm from "../../../locales/es/esm.json";
import esFormats from "../../../locales/es/formats.json";
import esImport from "../../../locales/es/import.json";
import esInsights from "../../../locales/es/insights.json";
import esInbox from "../../../locales/es/inbox.json";
import esSecondb from "../../../locales/es/secondb.json";
import esPlans from "../../../locales/es/plans.json";
import esOps from "../../../locales/es/ops.json";
import esNotFound from "../../../locales/es/notFound.json";
import esPermissions from "../../../locales/es/permissions.json";
import esProfile from "../../../locales/es/profile.json";
import esRecordDetail from "../../../locales/es/recordDetail.json";
import esResearch from "../../../locales/es/research.json";
import esSafety from "../../../locales/es/safety.json";
import esSettings from "../../../locales/es/settings.json";
import esSupport from "../../../locales/es/support.json";
import esTheme from "../../../locales/es/theme.json";
import esWiki from "../../../locales/es/wiki.json";
import ptAuth from "../../../locales/pt/auth.json";
import ptCapture from "../../../locales/pt/capture.json";
import ptCommon from "../../../locales/pt/common.json";
import ptConsent from "../../../locales/pt/consent.json";
import ptData from "../../../locales/pt/data.json";
import ptEsm from "../../../locales/pt/esm.json";
import ptFormats from "../../../locales/pt/formats.json";
import ptImport from "../../../locales/pt/import.json";
import ptInsights from "../../../locales/pt/insights.json";
import ptInbox from "../../../locales/pt/inbox.json";
import ptSecondb from "../../../locales/pt/secondb.json";
import ptPlans from "../../../locales/pt/plans.json";
import ptOps from "../../../locales/pt/ops.json";
import ptNotFound from "../../../locales/pt/notFound.json";
import ptPermissions from "../../../locales/pt/permissions.json";
import ptProfile from "../../../locales/pt/profile.json";
import ptRecordDetail from "../../../locales/pt/recordDetail.json";
import ptResearch from "../../../locales/pt/research.json";
import ptSafety from "../../../locales/pt/safety.json";
import ptSettings from "../../../locales/pt/settings.json";
import ptSupport from "../../../locales/pt/support.json";
import ptTheme from "../../../locales/pt/theme.json";
import ptWiki from "../../../locales/pt/wiki.json";
import idAuth from "../../../locales/id/auth.json";
import idCapture from "../../../locales/id/capture.json";
import idCommon from "../../../locales/id/common.json";
import idConsent from "../../../locales/id/consent.json";
import idData from "../../../locales/id/data.json";
import idEsm from "../../../locales/id/esm.json";
import idFormats from "../../../locales/id/formats.json";
import idImport from "../../../locales/id/import.json";
import idInsights from "../../../locales/id/insights.json";
import idInbox from "../../../locales/id/inbox.json";
import idSecondb from "../../../locales/id/secondb.json";
import idPlans from "../../../locales/id/plans.json";
import idOps from "../../../locales/id/ops.json";
import idNotFound from "../../../locales/id/notFound.json";
import idPermissions from "../../../locales/id/permissions.json";
import idProfile from "../../../locales/id/profile.json";
import idRecordDetail from "../../../locales/id/recordDetail.json";
import idResearch from "../../../locales/id/research.json";
import idSafety from "../../../locales/id/safety.json";
import idSettings from "../../../locales/id/settings.json";
import idSupport from "../../../locales/id/support.json";
import idTheme from "../../../locales/id/theme.json";
import idWiki from "../../../locales/id/wiki.json";
import enIden from "../../../locales/en/iden.json";
import koIden from "../../../locales/ko/iden.json";
import esIden from "../../../locales/es/iden.json";
import ptIden from "../../../locales/pt/iden.json";
import idIden from "../../../locales/id/iden.json";
import enHome from "../../../locales/en/home.json";
import koHome from "../../../locales/ko/home.json";
import esHome from "../../../locales/es/home.json";
import ptHome from "../../../locales/pt/home.json";
import idHome from "../../../locales/id/home.json";
import { detectLanguage, loadNativeLanguagePreference, saveLanguagePreference } from "./languageDetector";
import { isAvailableUiLocale, type AvailableUiLocale } from "./locales";

export const NAMESPACES = ["common", "auth", "safety", "consent", "capture", "inbox", "secondb", "plans", "wiki", "support", "data", "esm", "formats", "insights", "research", "recordDetail", "theme", "import", "notFound", "ops", "profile", "permissions", "settings", "iden", "home"] as const;
export type Namespace = (typeof NAMESPACES)[number];

// Keyed by AVAILABLE_UI_LOCALES (locales.ts is the single source of truth):
// shipping a new pack = add its bundle imports here + the code to that list,
// and the `satisfies` below fails the build if either side is missed.
export const resources = {
  en: { common: enCommon, auth: enAuth, safety: enSafety, consent: enConsent, capture: enCapture, inbox: enInbox, secondb: enSecondb, plans: enPlans, wiki: enWiki, support: enSupport, data: enData, esm: enEsm, formats: enFormats, insights: enInsights, research: enResearch, recordDetail: enRecordDetail, theme: enTheme, import: enImport, notFound: enNotFound, ops: enOps, profile: enProfile, permissions: enPermissions, settings: enSettings, iden: enIden, home: enHome },
  ko: { common: koCommon, auth: koAuth, safety: koSafety, consent: koConsent, capture: koCapture, inbox: koInbox, secondb: koSecondb, plans: koPlans, wiki: koWiki, support: koSupport, data: koData, esm: koEsm, formats: koFormats, insights: koInsights, research: koResearch, recordDetail: koRecordDetail, theme: koTheme, import: koImport, notFound: koNotFound, ops: koOps, profile: koProfile, permissions: koPermissions, settings: koSettings, iden: koIden, home: koHome },
  // ES pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
  // EN copies on purpose: crisis and legal copy is never machine-translated
  // (gate policy 2026-06-11) - they ship localized only after human review.
  es: { common: esCommon, auth: esAuth, safety: esSafety, consent: esConsent, capture: esCapture, inbox: esInbox, secondb: esSecondb, plans: esPlans, wiki: esWiki, support: esSupport, data: esData, esm: esEsm, formats: esFormats, insights: esInsights, research: esResearch, recordDetail: esRecordDetail, theme: esTheme, import: esImport, notFound: esNotFound, ops: esOps, profile: esProfile, permissions: esPermissions, settings: esSettings, iden: esIden, home: esHome },
  // PT pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
  // EN copies by policy - localized only after human review.
  pt: { common: ptCommon, auth: ptAuth, safety: ptSafety, consent: ptConsent, capture: ptCapture, inbox: ptInbox, secondb: ptSecondb, plans: ptPlans, wiki: ptWiki, support: ptSupport, data: ptData, esm: ptEsm, formats: ptFormats, insights: ptInsights, research: ptResearch, recordDetail: ptRecordDetail, theme: ptTheme, import: ptImport, notFound: ptNotFound, ops: ptOps, profile: ptProfile, permissions: ptPermissions, settings: ptSettings, iden: ptIden, home: ptHome },
  // ID pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
  // EN copies by policy - localized only after human review.
  id: { common: idCommon, auth: idAuth, safety: idSafety, consent: idConsent, capture: idCapture, inbox: idInbox, secondb: idSecondb, plans: idPlans, wiki: idWiki, support: idSupport, data: idData, esm: idEsm, formats: idFormats, insights: idInsights, research: idResearch, recordDetail: idRecordDetail, theme: idTheme, import: idImport, notFound: idNotFound, ops: idOps, profile: idProfile, permissions: idPermissions, settings: idSettings, iden: idIden, home: idHome },
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
