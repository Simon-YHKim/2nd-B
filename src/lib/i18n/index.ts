import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { useSyncExternalStore } from "react";

import enAuth from "../../../locales/en/auth.json";
import enCapture from "../../../locales/en/capture.json";
import enCommon from "../../../locales/en/common.json";
import enCommunity from "../../../locales/en/community.json";
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
import koCommunity from "../../../locales/ko/community.json";
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
import enIden from "../../../locales/en/iden.json";
import koIden from "../../../locales/ko/iden.json";
import enHome from "../../../locales/en/home.json";
import koHome from "../../../locales/ko/home.json";
import enDeepspace from "../../../locales/en/deepspace.json";
import koDeepspace from "../../../locales/ko/deepspace.json";
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
import { detectLanguage, loadNativeLanguagePreference, saveLanguagePreference } from "./languageDetector";
import { isAvailableUiLocale, type AvailableUiLocale } from "./locales";
import {
  ADDRESS_VARIABLES_CHANGED_EVENT,
  seedAddressDefault,
} from "@/lib/persona/use-address";

export const NAMESPACES = ["common", "auth", "safety", "consent", "capture", "community", "inbox", "secondb", "plans", "wiki", "support", "data", "esm", "formats", "insights", "research", "recordDetail", "theme", "import", "notFound", "ops", "profile", "permissions", "settings", "iden", "home", "deepspace", "peer", "attachment", "audit", "big-five", "brightness", "core-brain", "imagine", "interview", "ipip-neo", "manual", "persona", "privacy", "ratifications", "records", "review", "rlss", "trinity"] as const;
export type Namespace = (typeof NAMESPACES)[number];

// Two tiers of locale packs (audit D6-04, 2026-09-06):
//   - EAGER (en, ko): bundled into the entry and handed to i18next.init at
//     module scope, exactly as before. EN is canonical (C7) and the universal
//     fallback; KO is the primary market. Their first paint is synchronous.
//   - LAZY (es, pt, id): 132 JSON modules that used to sit in the web entry
//     for every user. They now live in ./packs/<lng>.ts behind a dynamic
//     import() and are attached with addResourceBundle only when that locale
//     is actually detected or chosen (ensureLocalePack).
// locales.ts stays the single source of truth for AVAILABLE_UI_LOCALES:
// shipping a new pack = add its bundle imports to one of the two tiers + the
// code to that list, and the `satisfies` clauses below fail the build if
// either side is missed (eager keys + lazy keys must equal the list).
export const EAGER_LOCALES = ["en", "ko"] as const satisfies readonly AvailableUiLocale[];
export type EagerLocale = (typeof EAGER_LOCALES)[number];
export type LazyLocale = Exclude<AvailableUiLocale, EagerLocale>;

export const resources = {
  en: { common: enCommon, community: enCommunity, auth: enAuth, safety: enSafety, consent: enConsent, capture: enCapture, inbox: enInbox, secondb: enSecondb, plans: enPlans, wiki: enWiki,
    peer: enPeer, support: enSupport, data: enData, esm: enEsm, formats: enFormats, insights: enInsights, research: enResearch, recordDetail: enRecordDetail, theme: enTheme, import: enImport, notFound: enNotFound, ops: enOps, profile: enProfile, permissions: enPermissions, settings: enSettings, iden: enIden, home: enHome, deepspace: enDeepspace, attachment: enAttachment, audit: enAudit, "big-five": enBigFive, brightness: enBrightness, "core-brain": enCoreBrain, imagine: enImagine, interview: enInterview, "ipip-neo": enIpipNeo, manual: enManual, persona: enPersona, privacy: enPrivacy, ratifications: enRatifications, records: enRecords, review: enReview, rlss: enRlss, trinity: enTrinity },
  ko: { common: koCommon, community: koCommunity, auth: koAuth, safety: koSafety, consent: koConsent, capture: koCapture, inbox: koInbox, secondb: koSecondb, plans: koPlans, wiki: koWiki,
    peer: koPeer, support: koSupport, data: koData, esm: koEsm, formats: koFormats, insights: koInsights, research: koResearch, recordDetail: koRecordDetail, theme: koTheme, import: koImport, notFound: koNotFound, ops: koOps, profile: koProfile, permissions: koPermissions, settings: koSettings, iden: koIden, home: koHome, deepspace: koDeepspace, attachment: koAttachment, audit: koAudit, "big-five": koBigFive, brightness: koBrightness, "core-brain": koCoreBrain, imagine: koImagine, interview: koInterview, "ipip-neo": koIpipNeo, manual: koManual, persona: koPersona, privacy: koPrivacy, ratifications: koRatifications, records: koRecords, review: koReview, rlss: koRlss, trinity: koTrinity },
} as const satisfies Record<EagerLocale, Record<Namespace, unknown>>;

interface LocalePackModule {
  pack: Record<Namespace, unknown>;
}

// Keyed by LazyLocale (= AvailableUiLocale minus the eager pair), so adding a
// locale to AVAILABLE_UI_LOCALES without a loader here is a type error, and so
// is a loader for a locale the list does not ship.
export const LAZY_PACKS: Record<LazyLocale, () => Promise<LocalePackModule>> = {
  es: () => import("./packs/es"),
  pt: () => import("./packs/pt"),
  id: () => import("./packs/id"),
};

export function isLazyLocale(lng: AvailableUiLocale): lng is LazyLocale {
  return !(EAGER_LOCALES as readonly string[]).includes(lng);
}

// One in-flight/settled promise per lazy locale: repeat callers share it, and
// a rejected chunk (offline, stale deploy) clears the slot so the next
// changeLanguage retries instead of being stuck on the failure forever.
const packLoads = new Map<LazyLocale, Promise<void>>();

/**
 * Make sure i18next holds the bundles for `lng` before it is rendered.
 * No-op for the eager pair and for a pack that is already attached (or
 * loading). Rejects only when the chunk itself fails to load; callers that
 * must never throw wrap it (initI18n, changeUiLanguage).
 */
export function ensureLocalePack(lng: AvailableUiLocale): Promise<void> {
  if (!isLazyLocale(lng)) return Promise.resolve();
  const pending = packLoads.get(lng);
  if (pending) return pending;
  const load = LAZY_PACKS[lng]()
    .then(({ pack }) => {
      for (const ns of NAMESPACES) {
        i18next.addResourceBundle(lng, ns, pack[ns], true, true);
      }
    })
    .catch((error: unknown) => {
      packLoads.delete(lng);
      throw error;
    });
  packLoads.set(lng, load);
  return load;
}

/**
 * The one way to switch the UI language at runtime. Attaches a lazy pack
 * first so a beta locale never paints raw keys; if the chunk cannot load the
 * language still switches and fallbackLng ("en") renders the copy, so the
 * user's choice persists and the next launch retries the chunk.
 */
export async function changeUiLanguage(lng: AvailableUiLocale): Promise<void> {
  try {
    await ensureLocalePack(lng);
  } catch {
    // fallbackLng renders EN until a later ensureLocalePack succeeds.
  }
  await i18next.changeLanguage(lng);
}

// Readiness of the pack for the language detected at init. For en/ko it is
// settled before initI18n returns (the first render never waits); for a lazy
// locale it settles when the chunk is attached, or on failure (EN fallback),
// so the root gate can never hang.
let initialPackSettled = false;
let initialPackReady: Promise<void> = Promise.resolve();
const readyListeners = new Set<() => void>();

function settleInitialPack(): void {
  initialPackSettled = true;
  for (const listener of readyListeners) listener();
}

function subscribeInitialPack(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}

function readInitialPack(): boolean {
  return initialPackSettled;
}

export function i18nReady(): Promise<void> {
  return initialPackReady;
}

/**
 * True once the initial locale's bundles are attached. Synchronously true for
 * en/ko, so those users see no change in first-render timing; a lazy locale
 * flips it once its chunk settles (success or EN fallback).
 */
export function useI18nReady(): boolean {
  return useSyncExternalStore(subscribeInitialPack, readInitialPack, readInitialPack);
}

let initialized = false;
export function initI18n(): typeof i18next {
  if (initialized) return i18next;
  initialized = true;
  const lng = detectLanguage();
  void i18next.use(initReactI18next).init({
    resources,
    lng,
    // EN is canonical (C7) and the universal fallback: a beta pack with a
    // missing key renders the EN string, never a raw key name.
    fallbackLng: "en",
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    // Address interpolation changes need existing useTranslation consumers to
    // rerender, but must not impersonate languageChanged: that event persists
    // the locale as an explicit preference below.
    react: { bindI18n: `languageChanged ${ADDRESS_VARIABLES_CHANGED_EVENT}` },
    compatibilityJSON: "v3",
  });
  // Lazy locale detected synchronously (web localStorage / device language):
  // fetch its pack now. The root layout gate (useI18nReady) holds the tree on
  // the loader until this settles, so nothing is mounted that would need a
  // repaint and the first paint is in that language, not EN-then-flash. Never
  // throws: a failed chunk settles the gate too and fallbackLng carries the UI
  // in EN. Detection is deliberately NOT persisted here (only an explicit
  // changeLanguage is), same as before.
  if (isLazyLocale(lng)) {
    initialPackReady = ensureLocalePack(lng)
      .catch(() => {})
      .then(settleInitialPack);
  } else {
    settleInitialPack();
  }
  // ⚠ `{{who}}` 의 폴백을 **여기서 동기적으로** 심는다.
  //
  //   공급자(`useAddressTerm`, `_layout.tsx`)는 `useEffect` 라 **첫 렌더 뒤**에 돌고,
  //   값을 넣는 방식이 i18next 의 `defaultVariables` 를 변형하는 것이라 이미 그려진
  //   `t()` 결과를 다시 그리지 않는다. 그래서 그 화면이 재렌더되지 않으면
  //   화면에 `여기는 {{who}}의 공간입니다.` 가 **그대로 찍힌다** — 실제로 `/account`
  //   에서 그랬다(P1 채점의 DOM 텍스트 대조에서 잡혔다).
  //
  //   폴백을 넣는 것이지 이름을 지어내는 것이 아니다. 로그인 뒤 실제 이름은
  //   기존 공급자가 덮어쓴다.
  seedAddressDefault(i18next.language);
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
  // No-op on web and when it matches what detection already picked. Goes
  // through changeUiLanguage so a saved lazy locale attaches its pack first.
  void loadNativeLanguagePreference()
    .then((saved) => {
      if (saved && saved !== i18next.language) void changeUiLanguage(saved);
    })
    .catch(() => {});
  return i18next;
}
