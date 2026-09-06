// ES pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
// EN copies on purpose: crisis and legal copy is never machine-translated
// (gate policy 2026-06-11) - they ship localized only after human review.
//
// Loaded on demand by ensureLocalePack() in ../index.ts: this module is a
// separate async chunk on web and is not evaluated at init on native, so an
// EN/KO user never pays for it. Keep every Namespace covered - the
// `satisfies` below fails the build when a namespace is missing.
import esAuth from "../../../../locales/es/auth.json";
import esCapture from "../../../../locales/es/capture.json";
import esCommon from "../../../../locales/es/common.json";
import esCommunity from "../../../../locales/es/community.json";
import esConsent from "../../../../locales/es/consent.json";
import esData from "../../../../locales/es/data.json";
import esEsm from "../../../../locales/es/esm.json";
import esFormats from "../../../../locales/es/formats.json";
import esImport from "../../../../locales/es/import.json";
import esInsights from "../../../../locales/es/insights.json";
import esInbox from "../../../../locales/es/inbox.json";
import esSecondb from "../../../../locales/es/secondb.json";
import esPlans from "../../../../locales/es/plans.json";
import esOps from "../../../../locales/es/ops.json";
import esNotFound from "../../../../locales/es/notFound.json";
import esPermissions from "../../../../locales/es/permissions.json";
import esProfile from "../../../../locales/es/profile.json";
import esRecordDetail from "../../../../locales/es/recordDetail.json";
import esResearch from "../../../../locales/es/research.json";
import esSafety from "../../../../locales/es/safety.json";
import esSettings from "../../../../locales/es/settings.json";
import esSupport from "../../../../locales/es/support.json";
import esTheme from "../../../../locales/es/theme.json";
import esWiki from "../../../../locales/es/wiki.json";
import esPeer from "../../../../locales/es/peer.json";
import esIden from "../../../../locales/es/iden.json";
import esHome from "../../../../locales/es/home.json";
import esDeepspace from "../../../../locales/es/deepspace.json";
import esAttachment from "../../../../locales/es/attachment.json";
import esAudit from "../../../../locales/es/audit.json";
import esBigFive from "../../../../locales/es/big-five.json";
import esBrightness from "../../../../locales/es/brightness.json";
import esCoreBrain from "../../../../locales/es/core-brain.json";
import esImagine from "../../../../locales/es/imagine.json";
import esInterview from "../../../../locales/es/interview.json";
import esIpipNeo from "../../../../locales/es/ipip-neo.json";
import esManual from "../../../../locales/es/manual.json";
import esPersona from "../../../../locales/es/persona.json";
import esPrivacy from "../../../../locales/es/privacy.json";
import esRatifications from "../../../../locales/es/ratifications.json";
import esRecords from "../../../../locales/es/records.json";
import esReview from "../../../../locales/es/review.json";
import esRlss from "../../../../locales/es/rlss.json";
import esTrinity from "../../../../locales/es/trinity.json";
import type { Namespace } from "../index";

export const pack = { common: esCommon, community: esCommunity, auth: esAuth, safety: esSafety, consent: esConsent, capture: esCapture, inbox: esInbox, secondb: esSecondb, plans: esPlans, wiki: esWiki,
  peer: esPeer, support: esSupport, data: esData, esm: esEsm, formats: esFormats, insights: esInsights, research: esResearch, recordDetail: esRecordDetail, theme: esTheme, import: esImport, notFound: esNotFound, ops: esOps, profile: esProfile, permissions: esPermissions, settings: esSettings, iden: esIden, home: esHome, deepspace: esDeepspace, attachment: esAttachment, audit: esAudit, "big-five": esBigFive, brightness: esBrightness, "core-brain": esCoreBrain, imagine: esImagine, interview: esInterview, "ipip-neo": esIpipNeo, manual: esManual, persona: esPersona, privacy: esPrivacy, ratifications: esRatifications, records: esRecords, review: esReview, rlss: esRlss, trinity: esTrinity } satisfies Record<Namespace, unknown>;
