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
import enPeer from "../../../locales/en/peer.json";
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
import koPeer from "../../../locales/ko/peer.json";
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
import esPeer from "../../../locales/es/peer.json";
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
import ptPeer from "../../../locales/pt/peer.json";
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
import idPeer from "../../../locales/id/peer.json";
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
import enDeepspace from "../../../locales/en/deepspace.json";
import koDeepspace from "../../../locales/ko/deepspace.json";
import esDeepspace from "../../../locales/es/deepspace.json";
import ptDeepspace from "../../../locales/pt/deepspace.json";
import idDeepspace from "../../../locales/id/deepspace.json";
import enAttachment from "../../../locales/en/attachment.json";
import enAudit from "../../../locales/en/audit.json";
import enBigFive from "../../../locales/en/big-five.json";
import enBrightness from "../../../locales/en/brightness.json";
import enCoreBrain from "../../../locales/en/core-brain.json";
import enImagine from "../../../locales/en/imagine.json";
import enInterview from "../../../locales/en/interview.json";
import enIpipNeo from "../../../locales/en/ipip-neo.json";
import enManual from "../../../locales/en/manual.json";
import enPersona from "../../../locales/en/persona.json";
import enPrivacy from "../../../locales/en/privacy.json";
import enRatifications from "../../../locales/en/ratifications.json";
import enRecords from "../../../locales/en/records.json";
import enReview from "../../../locales/en/review.json";
import enRlss from "../../../locales/en/rlss.json";
import enTrinity from "../../../locales/en/trinity.json";
import koAttachment from "../../../locales/ko/attachment.json";
import koAudit from "../../../locales/ko/audit.json";
import koBigFive from "../../../locales/ko/big-five.json";
import koBrightness from "../../../locales/ko/brightness.json";
import koCoreBrain from "../../../locales/ko/core-brain.json";
import koImagine from "../../../locales/ko/imagine.json";
import koInterview from "../../../locales/ko/interview.json";
import koIpipNeo from "../../../locales/ko/ipip-neo.json";
import koManual from "../../../locales/ko/manual.json";
import koPersona from "../../../locales/ko/persona.json";
import koPrivacy from "../../../locales/ko/privacy.json";
import koRatifications from "../../../locales/ko/ratifications.json";
import koRecords from "../../../locales/ko/records.json";
import koReview from "../../../locales/ko/review.json";
import koRlss from "../../../locales/ko/rlss.json";
import koTrinity from "../../../locales/ko/trinity.json";
import esAttachment from "../../../locales/es/attachment.json";
import esAudit from "../../../locales/es/audit.json";
import esBigFive from "../../../locales/es/big-five.json";
import esBrightness from "../../../locales/es/brightness.json";
import esCoreBrain from "../../../locales/es/core-brain.json";
import esImagine from "../../../locales/es/imagine.json";
import esInterview from "../../../locales/es/interview.json";
import esIpipNeo from "../../../locales/es/ipip-neo.json";
import esManual from "../../../locales/es/manual.json";
import esPersona from "../../../locales/es/persona.json";
import esPrivacy from "../../../locales/es/privacy.json";
import esRatifications from "../../../locales/es/ratifications.json";
import esRecords from "../../../locales/es/records.json";
import esReview from "../../../locales/es/review.json";
import esRlss from "../../../locales/es/rlss.json";
import esTrinity from "../../../locales/es/trinity.json";
import ptAttachment from "../../../locales/pt/attachment.json";
import ptAudit from "../../../locales/pt/audit.json";
import ptBigFive from "../../../locales/pt/big-five.json";
import ptBrightness from "../../../locales/pt/brightness.json";
import ptCoreBrain from "../../../locales/pt/core-brain.json";
import ptImagine from "../../../locales/pt/imagine.json";
import ptInterview from "../../../locales/pt/interview.json";
import ptIpipNeo from "../../../locales/pt/ipip-neo.json";
import ptManual from "../../../locales/pt/manual.json";
import ptPersona from "../../../locales/pt/persona.json";
import ptPrivacy from "../../../locales/pt/privacy.json";
import ptRatifications from "../../../locales/pt/ratifications.json";
import ptRecords from "../../../locales/pt/records.json";
import ptReview from "../../../locales/pt/review.json";
import ptRlss from "../../../locales/pt/rlss.json";
import ptTrinity from "../../../locales/pt/trinity.json";
import idAttachment from "../../../locales/id/attachment.json";
import idAudit from "../../../locales/id/audit.json";
import idBigFive from "../../../locales/id/big-five.json";
import idBrightness from "../../../locales/id/brightness.json";
import idCoreBrain from "../../../locales/id/core-brain.json";
import idImagine from "../../../locales/id/imagine.json";
import idInterview from "../../../locales/id/interview.json";
import idIpipNeo from "../../../locales/id/ipip-neo.json";
import idManual from "../../../locales/id/manual.json";
import idPersona from "../../../locales/id/persona.json";
import idPrivacy from "../../../locales/id/privacy.json";
import idRatifications from "../../../locales/id/ratifications.json";
import idRecords from "../../../locales/id/records.json";
import idReview from "../../../locales/id/review.json";
import idRlss from "../../../locales/id/rlss.json";
import idTrinity from "../../../locales/id/trinity.json";
import { detectLanguage, loadNativeLanguagePreference, saveLanguagePreference } from "./languageDetector";
import { isAvailableUiLocale, type AvailableUiLocale } from "./locales";

export const NAMESPACES = ["common", "auth", "safety", "consent", "capture", "inbox", "secondb", "plans", "wiki", "support", "data", "esm", "formats", "insights", "research", "recordDetail", "theme", "import", "notFound", "ops", "profile", "permissions", "settings", "iden", "home", "deepspace", "peer", "attachment", "audit", "big-five", "brightness", "core-brain", "imagine", "interview", "ipip-neo", "manual", "persona", "privacy", "ratifications", "records", "review", "rlss", "trinity"] as const;
export type Namespace = (typeof NAMESPACES)[number];

// Keyed by AVAILABLE_UI_LOCALES (locales.ts is the single source of truth):
// shipping a new pack = add its bundle imports here + the code to that list,
// and the `satisfies` below fails the build if either side is missed.
export const resources = {
  en: { common: enCommon, auth: enAuth, safety: enSafety, consent: enConsent, capture: enCapture, inbox: enInbox, secondb: enSecondb, plans: enPlans, wiki: enWiki,
    peer: enPeer, support: enSupport, data: enData, esm: enEsm, formats: enFormats, insights: enInsights, research: enResearch, recordDetail: enRecordDetail, theme: enTheme, import: enImport, notFound: enNotFound, ops: enOps, profile: enProfile, permissions: enPermissions, settings: enSettings, iden: enIden, home: enHome, deepspace: enDeepspace, attachment: enAttachment, audit: enAudit, "big-five": enBigFive, brightness: enBrightness, "core-brain": enCoreBrain, imagine: enImagine, interview: enInterview, "ipip-neo": enIpipNeo, manual: enManual, persona: enPersona, privacy: enPrivacy, ratifications: enRatifications, records: enRecords, review: enReview, rlss: enRlss, trinity: enTrinity },
  ko: { common: koCommon, auth: koAuth, safety: koSafety, consent: koConsent, capture: koCapture, inbox: koInbox, secondb: koSecondb, plans: koPlans, wiki: koWiki,
    peer: koPeer, support: koSupport, data: koData, esm: koEsm, formats: koFormats, insights: koInsights, research: koResearch, recordDetail: koRecordDetail, theme: koTheme, import: koImport, notFound: koNotFound, ops: koOps, profile: koProfile, permissions: koPermissions, settings: koSettings, iden: koIden, home: koHome, deepspace: koDeepspace, attachment: koAttachment, audit: koAudit, "big-five": koBigFive, brightness: koBrightness, "core-brain": koCoreBrain, imagine: koImagine, interview: koInterview, "ipip-neo": koIpipNeo, manual: koManual, persona: koPersona, privacy: koPrivacy, ratifications: koRatifications, records: koRecords, review: koReview, rlss: koRlss, trinity: koTrinity },
  // ES pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
  // EN copies on purpose: crisis and legal copy is never machine-translated
  // (gate policy 2026-06-11) - they ship localized only after human review.
  es: { common: esCommon, auth: esAuth, safety: esSafety, consent: esConsent, capture: esCapture, inbox: esInbox, secondb: esSecondb, plans: esPlans, wiki: esWiki,
    peer: esPeer, support: esSupport, data: esData, esm: esEsm, formats: esFormats, insights: esInsights, research: esResearch, recordDetail: esRecordDetail, theme: esTheme, import: esImport, notFound: esNotFound, ops: esOps, profile: esProfile, permissions: esPermissions, settings: esSettings, iden: esIden, home: esHome, deepspace: esDeepspace, attachment: esAttachment, audit: esAudit, "big-five": esBigFive, brightness: esBrightness, "core-brain": esCoreBrain, imagine: esImagine, interview: esInterview, "ipip-neo": esIpipNeo, manual: esManual, persona: esPersona, privacy: esPrivacy, ratifications: esRatifications, records: esRecords, review: esReview, rlss: esRlss, trinity: esTrinity },
  // PT pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
  // EN copies by policy - localized only after human review.
  pt: { common: ptCommon, auth: ptAuth, safety: ptSafety, consent: ptConsent, capture: ptCapture, inbox: ptInbox, secondb: ptSecondb, plans: ptPlans, wiki: ptWiki,
    peer: ptPeer, support: ptSupport, data: ptData, esm: ptEsm, formats: ptFormats, insights: ptInsights, research: ptResearch, recordDetail: ptRecordDetail, theme: ptTheme, import: ptImport, notFound: ptNotFound, ops: ptOps, profile: ptProfile, permissions: ptPermissions, settings: ptSettings, iden: ptIden, home: ptHome, deepspace: ptDeepspace, attachment: ptAttachment, audit: ptAudit, "big-five": ptBigFive, brightness: ptBrightness, "core-brain": ptCoreBrain, imagine: ptImagine, interview: ptInterview, "ipip-neo": ptIpipNeo, manual: ptManual, persona: ptPersona, privacy: ptPrivacy, ratifications: ptRatifications, records: ptRecords, review: ptReview, rlss: ptRlss, trinity: ptTrinity },
  // ID pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
  // EN copies by policy - localized only after human review.
  id: { common: idCommon, auth: idAuth, safety: idSafety, consent: idConsent, capture: idCapture, inbox: idInbox, secondb: idSecondb, plans: idPlans, wiki: idWiki,
    peer: idPeer, support: idSupport, data: idData, esm: idEsm, formats: idFormats, insights: idInsights, research: idResearch, recordDetail: idRecordDetail, theme: idTheme, import: idImport, notFound: idNotFound, ops: idOps, profile: idProfile, permissions: idPermissions, settings: idSettings, iden: idIden, home: idHome, deepspace: idDeepspace, attachment: idAttachment, audit: idAudit, "big-five": idBigFive, brightness: idBrightness, "core-brain": idCoreBrain, imagine: idImagine, interview: idInterview, "ipip-neo": idIpipNeo, manual: idManual, persona: idPersona, privacy: idPrivacy, ratifications: idRatifications, records: idRecords, review: idReview, rlss: idRlss, trinity: idTrinity },
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
