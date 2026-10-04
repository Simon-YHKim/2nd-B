// ID pack (O-R2 (2)-b, machine-translated + beta label). safety/consent are
// EN copies by policy - localized only after human review.
//
// Loaded on demand by ensureLocalePack() in ../index.ts: this module is a
// separate async chunk on web and is not evaluated at init on native, so an
// EN/KO user never pays for it. Keep every Namespace covered - the
// `satisfies` below fails the build when a namespace is missing.
import idAuth from "../../../../locales/id/auth.json";
import idAvatar from "../../../../locales/id/avatar.json";
import idAvatarPalette from "../../../../locales/id/avatarPalette.json";
import idCapture from "../../../../locales/id/capture.json";
import idCommon from "../../../../locales/id/common.json";
import idCommunity from "../../../../locales/id/community.json";
import idConsent from "../../../../locales/id/consent.json";
import idData from "../../../../locales/id/data.json";
import idEsm from "../../../../locales/id/esm.json";
import idFormats from "../../../../locales/id/formats.json";
import idImport from "../../../../locales/id/import.json";
import idInbox from "../../../../locales/id/inbox.json";
import idSecondb from "../../../../locales/id/secondb.json";
import idPlans from "../../../../locales/id/plans.json";
import idOps from "../../../../locales/id/ops.json";
import idNotFound from "../../../../locales/id/notFound.json";
import idProfile from "../../../../locales/id/profile.json";
import idRecordDetail from "../../../../locales/id/recordDetail.json";
import idSafety from "../../../../locales/id/safety.json";
import idSettings from "../../../../locales/id/settings.json";
import idSupport from "../../../../locales/id/support.json";
import idTheme from "../../../../locales/id/theme.json";
import idWiki from "../../../../locales/id/wiki.json";
import idPeer from "../../../../locales/id/peer.json";
import idIden from "../../../../locales/id/iden.json";
import idHome from "../../../../locales/id/home.json";
import idDeepspace from "../../../../locales/id/deepspace.json";
import idAttachment from "../../../../locales/id/attachment.json";
import idAudit from "../../../../locales/id/audit.json";
import idBigFive from "../../../../locales/id/big-five.json";
import idBrightness from "../../../../locales/id/brightness.json";
import idCoreBrain from "../../../../locales/id/core-brain.json";
import idImagine from "../../../../locales/id/imagine.json";
import idInterview from "../../../../locales/id/interview.json";
import idIpipNeo from "../../../../locales/id/ipip-neo.json";
import idManual from "../../../../locales/id/manual.json";
import idPersona from "../../../../locales/id/persona.json";
import idPrivacy from "../../../../locales/id/privacy.json";
import idRatifications from "../../../../locales/id/ratifications.json";
import idRlss from "../../../../locales/id/rlss.json";
import type { Namespace } from "../index";

export const pack = { common: idCommon, community: idCommunity, auth: idAuth, avatar: idAvatar, avatarPalette: idAvatarPalette, safety: idSafety, consent: idConsent, capture: idCapture, inbox: idInbox, secondb: idSecondb, plans: idPlans, wiki: idWiki,
  peer: idPeer, support: idSupport, data: idData, esm: idEsm, formats: idFormats, recordDetail: idRecordDetail, theme: idTheme, import: idImport, notFound: idNotFound, ops: idOps, profile: idProfile, settings: idSettings, iden: idIden, home: idHome, deepspace: idDeepspace, attachment: idAttachment, audit: idAudit, "big-five": idBigFive, brightness: idBrightness, "core-brain": idCoreBrain, imagine: idImagine, interview: idInterview, "ipip-neo": idIpipNeo, manual: idManual, persona: idPersona, privacy: idPrivacy, ratifications: idRatifications, rlss: idRlss } satisfies Record<Namespace, unknown>;
