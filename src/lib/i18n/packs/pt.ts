// PT pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
// EN copies by policy - localized only after human review.
//
// Loaded on demand by ensureLocalePack() in ../index.ts: this module is a
// separate async chunk on web and is not evaluated at init on native, so an
// EN/KO user never pays for it. Keep every Namespace covered - the
// `satisfies` below fails the build when a namespace is missing.
import ptAuth from "../../../../locales/pt/auth.json";
import ptCapture from "../../../../locales/pt/capture.json";
import ptCommon from "../../../../locales/pt/common.json";
import ptCommunity from "../../../../locales/pt/community.json";
import ptConsent from "../../../../locales/pt/consent.json";
import ptData from "../../../../locales/pt/data.json";
import ptEsm from "../../../../locales/pt/esm.json";
import ptFormats from "../../../../locales/pt/formats.json";
import ptImport from "../../../../locales/pt/import.json";
import ptInsights from "../../../../locales/pt/insights.json";
import ptInbox from "../../../../locales/pt/inbox.json";
import ptSecondb from "../../../../locales/pt/secondb.json";
import ptPlans from "../../../../locales/pt/plans.json";
import ptOps from "../../../../locales/pt/ops.json";
import ptNotFound from "../../../../locales/pt/notFound.json";
import ptPermissions from "../../../../locales/pt/permissions.json";
import ptProfile from "../../../../locales/pt/profile.json";
import ptRecordDetail from "../../../../locales/pt/recordDetail.json";
import ptResearch from "../../../../locales/pt/research.json";
import ptSafety from "../../../../locales/pt/safety.json";
import ptSettings from "../../../../locales/pt/settings.json";
import ptSupport from "../../../../locales/pt/support.json";
import ptTheme from "../../../../locales/pt/theme.json";
import ptWiki from "../../../../locales/pt/wiki.json";
import ptPeer from "../../../../locales/pt/peer.json";
import ptIden from "../../../../locales/pt/iden.json";
import ptHome from "../../../../locales/pt/home.json";
import ptDeepspace from "../../../../locales/pt/deepspace.json";
import ptAttachment from "../../../../locales/pt/attachment.json";
import ptAudit from "../../../../locales/pt/audit.json";
import ptBigFive from "../../../../locales/pt/big-five.json";
import ptBrightness from "../../../../locales/pt/brightness.json";
import ptCoreBrain from "../../../../locales/pt/core-brain.json";
import ptImagine from "../../../../locales/pt/imagine.json";
import ptInterview from "../../../../locales/pt/interview.json";
import ptIpipNeo from "../../../../locales/pt/ipip-neo.json";
import ptManual from "../../../../locales/pt/manual.json";
import ptPersona from "../../../../locales/pt/persona.json";
import ptPrivacy from "../../../../locales/pt/privacy.json";
import ptRatifications from "../../../../locales/pt/ratifications.json";
import ptRecords from "../../../../locales/pt/records.json";
import ptReview from "../../../../locales/pt/review.json";
import ptRlss from "../../../../locales/pt/rlss.json";
import ptTrinity from "../../../../locales/pt/trinity.json";
import ptIndex from "../../../../locales/pt/index.json";
import type { Namespace } from "../index";

export const pack = { common: ptCommon, community: ptCommunity, auth: ptAuth, safety: ptSafety, consent: ptConsent, capture: ptCapture, inbox: ptInbox, secondb: ptSecondb, plans: ptPlans, wiki: ptWiki,
  peer: ptPeer, support: ptSupport, data: ptData, esm: ptEsm, formats: ptFormats, insights: ptInsights, research: ptResearch, recordDetail: ptRecordDetail, theme: ptTheme, import: ptImport, notFound: ptNotFound, ops: ptOps, profile: ptProfile, permissions: ptPermissions, settings: ptSettings, iden: ptIden, home: ptHome, deepspace: ptDeepspace, attachment: ptAttachment, audit: ptAudit, "big-five": ptBigFive, brightness: ptBrightness, "core-brain": ptCoreBrain, imagine: ptImagine, interview: ptInterview, "ipip-neo": ptIpipNeo, manual: ptManual, persona: ptPersona, privacy: ptPrivacy, ratifications: ptRatifications, records: ptRecords, review: ptReview, rlss: ptRlss, trinity: ptTrinity, index: ptIndex } satisfies Record<Namespace, unknown>;
