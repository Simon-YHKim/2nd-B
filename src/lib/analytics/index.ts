// Lightweight product-analytics abstraction.
//
// Why: the blueprint promises $0 fixed cost. GA4 and MS Clarity have free
// tiers, but cost is not the only gate: the web Clarity loader is deliberately
// absent because its SPA auto-restart violates the private-route collection
// boundary. Third-party crash reporting is likewise absent while its processor
// disclosure, DPA, and native redaction contract remain unresolved.
//
// Web SDK: GA4. Native Android includes Firebase Analytics + Clarity, but this
// JS bundle emits only OFF decisions to both native product-analytics SDKs.
// Web GA4 retains the adult/consent and runtime gates below.
//
// PRIVACY / PIPA: product analytics load ONLY after the user grants the optional
// `analytics` consent (consent-selections.ts) AND the server-derived birth date
// confirms the user is 18+. Unknown age fails closed.
// The consent decision is persisted on web (localStorage) so it gates the next
// load too. GA4 runs with IP anonymization + no ad signals; this bundle has no
// native product-analytics ON path and no third-party crash-reporting init path.

import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

import { syncNativeClarity } from "./clarity-native";

import { getEnv, type Env } from "../env";
import { getSupabaseClient } from "../supabase/client";

export type AnalyticsPropValue = string | number | boolean | null;
export type AnalyticsProps = Record<string, AnalyticsPropValue | undefined>;
export type AnalyticsEventName =
  | "page_view"
  | "capture"
  | "secondb_session"
  | "star_lit"
  | "activation_milestone"
  | "ai_limit_hit"
  | "plans_viewed"
  | "plans_tier_focused"
  | "checkout_started"
  | "purchase"
  | "proposal_decided";

export interface PageViewEventProps extends AnalyticsProps {
  path: string;
  title?: string;
  locale?: "en" | "ko";
}

export type CaptureAction = "started" | "saved" | "failed" | "classified" | "promoted";
export interface CaptureEventProps extends AnalyticsProps {
  action: CaptureAction;
  mode?: "journal" | "memo" | "link" | "clip" | "file" | "photo" | "ocr";
  source_kind?: string;
  has_file?: boolean;
}

export type SecondBSessionAction = "started" | "message_sent" | "message_received" | "ended" | "failed";
export interface SecondBSessionEventProps extends AnalyticsProps {
  action: SecondBSessionAction;
  mode?: "chat" | "divergent" | "coach" | "analytic";
  turn_count?: number;
  /** "ok" when the turn completed; "blocked" when the safety/limit gate stopped it. */
  outcome?: "ok" | "blocked";
  /** Daily AI count after this turn (scalar). */
  used?: number;
  /** Daily AI cap for the user's tier (scalar). */
  limit?: number;
  /** Subscription tier id (scalar string). */
  tier?: string;
}

export type PageViewAnalyticsEvent = { name: "page_view"; props: PageViewEventProps };
export type CaptureAnalyticsEvent = { name: "capture"; props: CaptureEventProps };
export type SecondBSessionAnalyticsEvent = { name: "secondb_session"; props: SecondBSessionEventProps };
export type AnalyticsEvent =
  | PageViewAnalyticsEvent
  | CaptureAnalyticsEvent
  | SecondBSessionAnalyticsEvent
  | StarLitAnalyticsEvent
  | ActivationMilestoneAnalyticsEvent
  | AiLimitHitAnalyticsEvent
  | PlansViewedAnalyticsEvent
  | PlansTierFocusedAnalyticsEvent
  | CheckoutStartedAnalyticsEvent
  | PurchaseAnalyticsEvent
  | ProposalDecidedAnalyticsEvent;

export interface AnalyticsSubjectGate {
  /** True below 18. Null/undefined means age is unresolved and fails closed. */
  isMinor?: boolean | null;
  /** True only after the current signed-in subject was confirmed adult by server-derived data. */
  confirmedAdult?: boolean;
  /** True below the KR/PIPA self-consent floor. Product analytics and ads stay off. */
  underDigitalConsentAge?: boolean | null;
}

export interface AnalyticsRuntimeFlags {
  analyticsEnabled: boolean;
  clarityEnabled: boolean;
}

const RUNTIME_ANALYTICS_DEFAULTS: AnalyticsRuntimeFlags = {
  analyticsEnabled: false,
  clarityEnabled: false,
};

export function resolveAnalyticsRuntimeFlags(rows: unknown): AnalyticsRuntimeFlags {
  if (!Array.isArray(rows)) return { ...RUNTIME_ANALYTICS_DEFAULTS };
  const enabled = new Map<string, boolean>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { key, enabled: value } = row as { key?: unknown; enabled?: unknown };
    if (typeof key === "string" && typeof value === "boolean") enabled.set(key, value);
  }
  const analyticsEnabled = enabled.get("analytics_enabled") === true;
  return {
    analyticsEnabled,
    clarityEnabled: analyticsEnabled && enabled.get("clarity_enabled") === true,
  };
}

export function pageView(props: PageViewEventProps): PageViewAnalyticsEvent {
  return { name: "page_view", props };
}

export function capture(props: CaptureEventProps): CaptureAnalyticsEvent {
  return { name: "capture", props };
}

export function secondBSession(props: SecondBSessionEventProps): SecondBSessionAnalyticsEvent {
  return { name: "secondb_session", props };
}

// Conversion-funnel events (persona-sim memo §7). Leading indicator for the
// paid-conversion path so it becomes measurable post-launch. All props are
// PII-free scalars only - ids, levels, counts, tiers. Never carry record
// bodies, chat text, or the user id (captureEvent emits only what is here).

// A self-understanding star crossed up a ladder level (its brightness grew).
export interface StarLitEventProps extends AnalyticsProps {
  star_id: string;
  ladder_level: number;
  source: "questionnaire" | "journal" | "esm";
  ms_since_signup?: number;
  session_n?: number;
}

// The aggregate readout (북극성) reached a fuller state - lit-count + brightness.
export interface ActivationMilestoneEventProps extends AnalyticsProps {
  stars_lit_count: number;
  soul_core_brightness: number;
  ms_since_signup?: number;
}

// The daily AI cap was reached for the user's tier.
export interface AiLimitHitEventProps extends AnalyticsProps {
  tier: string;
  limit: number;
  upgrade_to?: string;
  ms_since_first_star?: number;
}

// The plans screen was opened, with the entry point that led here.
export interface PlansViewedEventProps extends AnalyticsProps {
  current_tier: string;
  source: "ai_limit" | "advisor_lock" | "direct";
  locale?: "en" | "ko";
  currency_shown?: string;
}

// A specific plan tier drew focus (default-highlighted or selected).
export interface PlansTierFocusedEventProps extends AnalyticsProps {
  tier: string;
  price?: number;
  currency?: string;
}

// Post-IAP only (creator fn defined now; no call site until native IAP lands).
export interface CheckoutStartedEventProps extends AnalyticsProps {
  tier: string;
  price?: number;
  currency?: string;
}

// Post-IAP only (creator fn defined now; no call site until native IAP lands).
export interface PurchaseEventProps extends AnalyticsProps {
  tier: string;
  price?: number;
  currency?: string;
  period?: string;
}

// propose→ratify quality signal (2026-07-26): until this event, only the
// reasoning flow persisted reject outcomes (reasoning_run_proposals) — every
// other decline vanished, so acceptance rates (the cheapest output-quality
// feedback the app can collect) were unmeasurable. Counts only, never content.
export type ProposalDecisionFlow = "self_model" | "import" | "reasoning";
export interface ProposalDecidedEventProps extends AnalyticsProps {
  flow: ProposalDecisionFlow;
  decision: "ratify" | "decline";
  /** How many proposals this decision covered (1 for single-target flows). */
  count: number;
}

export type StarLitAnalyticsEvent = { name: "star_lit"; props: StarLitEventProps };
export type ActivationMilestoneAnalyticsEvent = { name: "activation_milestone"; props: ActivationMilestoneEventProps };
export type AiLimitHitAnalyticsEvent = { name: "ai_limit_hit"; props: AiLimitHitEventProps };
export type PlansViewedAnalyticsEvent = { name: "plans_viewed"; props: PlansViewedEventProps };
export type PlansTierFocusedAnalyticsEvent = { name: "plans_tier_focused"; props: PlansTierFocusedEventProps };
export type CheckoutStartedAnalyticsEvent = { name: "checkout_started"; props: CheckoutStartedEventProps };
export type PurchaseAnalyticsEvent = { name: "purchase"; props: PurchaseEventProps };
export type ProposalDecidedAnalyticsEvent = { name: "proposal_decided"; props: ProposalDecidedEventProps };

export function starLit(props: StarLitEventProps): StarLitAnalyticsEvent {
  return { name: "star_lit", props };
}

export function activationMilestone(props: ActivationMilestoneEventProps): ActivationMilestoneAnalyticsEvent {
  return { name: "activation_milestone", props };
}

export function aiLimitHit(props: AiLimitHitEventProps): AiLimitHitAnalyticsEvent {
  return { name: "ai_limit_hit", props };
}

export function plansViewed(props: PlansViewedEventProps): PlansViewedAnalyticsEvent {
  return { name: "plans_viewed", props };
}

export function plansTierFocused(props: PlansTierFocusedEventProps): PlansTierFocusedAnalyticsEvent {
  return { name: "plans_tier_focused", props };
}

export function checkoutStarted(props: CheckoutStartedEventProps): CheckoutStartedAnalyticsEvent {
  return { name: "checkout_started", props };
}

export function purchase(props: PurchaseEventProps): PurchaseAnalyticsEvent {
  return { name: "purchase", props };
}

export function proposalDecided(props: ProposalDecidedEventProps): ProposalDecidedAnalyticsEvent {
  return { name: "proposal_decided", props };
}

export function canLoadProductAnalytics(granted: boolean, gate?: AnalyticsSubjectGate): boolean {
  return (
    granted === true &&
    gate?.isMinor === false &&
    gate?.confirmedAdult === true &&
    gate?.underDigitalConsentAge !== true
  );
}

// ---------------------------------------------------------------------------
// Native Firebase Analytics (Android-first; iOS pods stay excluded via
// react-native.config.js until a static-frameworks pass lands).
//
// Build-level default is OFF: firebase.json ships
// analytics_auto_collection_enabled=false plus denied consent-mode defaults.
// The runtime OFF below also clears an ON override persisted by an older bundle
// once the native bridge becomes available.
// Native Firebase collection is intentionally OFF for every consent state.
// Web GA4 keeps its adult/consent gate below; Android receives an explicit OFF
// on every native sync so an ON value persisted by an older bundle is cleared.
//
// The SDK is imported lazily and every call is guarded: in Expo Go, on web,
// or when the native module / google-services config is absent, the import or
// call rejects and the build-level OFF default simply stands.

type NativeAnalyticsApplier = (enabled: false) => Promise<void>;
type NativeModuleLookup = (name: string) => unknown;

const RNFB_ANALYTICS_MODULE = "RNFBAnalyticsModule";

let nativeApplierOverride: NativeAnalyticsApplier | null = null;
let nativeLatestApply: Promise<void> = Promise.resolve();

/**
 * OTA compatibility gate for binaries built before native Firebase landed.
 *
 * runtimeVersion 0.0.8 shipped both with and without RNFirebase. Importing the
 * JS package against the older binary can terminate Android during cold start,
 * so prove the native analytics module exists before evaluating that package.
 */
export function hasNativeFirebaseAnalyticsModule(
  lookup: NativeModuleLookup = (name) =>
    TurboModuleRegistry.get(name) ?? NativeModules[name],
): boolean {
  try {
    return lookup(RNFB_ANALYTICS_MODULE) != null;
  } catch {
    return false;
  }
}

function absorbNativeOffCall(factory: () => Promise<unknown>): Promise<void> {
  try {
    return Promise.resolve(factory()).then(
      () => {},
      () => {},
    );
  } catch {
    return Promise.resolve();
  }
}

async function applyNativeAnalyticsOff(): Promise<void> {
  if (!hasNativeFirebaseAnalyticsModule()) return;
  try {
    const mod = await import("@react-native-firebase/analytics");
    const analytics = mod.getAnalytics();
    // A wedged consent acknowledgement must not prevent collection OFF. Ad
    // signals remain denied in every state.
    await Promise.all([
      absorbNativeOffCall(() =>
        mod.setConsent(analytics, {
          analytics_storage: false,
          ad_storage: false,
          ad_user_data: false,
          ad_personalization: false,
        }),
      ),
      absorbNativeOffCall(() => mod.setAnalyticsCollectionEnabled(analytics, false)),
    ]);
  } catch {
    // Fail closed: without the SDK/native module the build-level OFF stands.
  }
}

/**
 * Native Firebase OFF attempts are independent: no failed or never-settling
 * bridge call may head-of-line block the next explicit OFF assertion.
 */
function startNativeAnalyticsOffAttempt(): void {
  const applier = nativeApplierOverride ?? applyNativeAnalyticsOff;
  let raw: Promise<void>;
  try {
    raw = Promise.resolve(applier(false));
  } catch {
    raw = Promise.resolve();
  }
  nativeLatestApply = raw.catch(() => {});
}

/**
 * Reassert both native product-analytics SDKs OFF. Firebase goes first and its
 * attempt is never chained; Clarity is separately exception-isolated.
 */
function syncNativeAnalyticsOff(): void {
  if (Platform.OS === "web") return;
  startNativeAnalyticsOffAttempt();
  syncNativeClarityOff();
}

/**
 * Send native Clarity only OFF decisions until its disclosure/processing
 * contract is complete. This removes new ON paths; it does not claim that a
 * previously running native instance has acknowledged pause.
 */
function syncNativeClarityOff(): void {
  if (Platform.OS === "web") return;
  try {
    syncNativeClarity({
      enabled: false,
      route: currentAnalyticsRoute,
      allowedRoute: isClarityAllowedRoute(currentAnalyticsRoute),
      projectId: clarityProjectIdForNative(),
    });
  } catch {
    // Firebase OFF and app startup must not depend on the optional Clarity SDK.
  }
}

/** Read the build-time project id without throwing on an invalid build env. */
function clarityProjectIdForNative(): string | undefined {
  try {
    return getEnv().EXPO_PUBLIC_CLARITY_PROJECT_ID;
  } catch {
    return undefined;
  }
}

/** Test hook only: substitute the native applier (null restores the real one). */
export function __setNativeAnalyticsApplierForTests(applier: NativeAnalyticsApplier | null): void {
  nativeApplierOverride = applier;
}

/** Test hook only: await the most recently issued native OFF attempt. */
export function __flushNativeAnalyticsForTests(): Promise<void> {
  return nativeLatestApply;
}

const CONSENT_KEY = "2ndb_analytics_consent";

let initialized = false;
let analyticsConsent = false;
let analyticsConsentRevision = 0;
let runtimeAnalyticsFlags = { ...RUNTIME_ANALYTICS_DEFAULTS };
let runtimeAnalyticsFlagsCheckedAt = 0;
let runtimeAnalyticsRefresh: Promise<AnalyticsRuntimeFlags> | null = null;
let runtimeAnalyticsTimer: ReturnType<typeof setTimeout> | null = null;
let runtimeAnalyticsBootstrapped = false;
let productAnalyticsReady = false;
let productAnalyticsLoad: Promise<void> | null = null;
type PreparedProductEvent = {
  name: AnalyticsEventName;
  props: Record<string, AnalyticsPropValue>;
  route: string;
};
let pendingProductEvents: PreparedProductEvent[] = [];
let ga4Id: string | null = null; // set once GA4 is loaded
let currentAnalyticsRoute = "/";

/**
 * Web Clarity is intentionally unavailable, even when the remote flag and
 * project id are both present. The vendor's SPA history hook stops and then
 * restarts itself after pushState/replaceState, so an app-side route stop
 * cannot uphold the privacy promise on personal screens. Native Clarity is
 * likewise kept OFF by the native sync path above.
 */
export const WEB_CLARITY_HARD_DISABLED = true;
export const NATIVE_CLARITY_HARD_DISABLED = true;

type WebGlobal = {
  localStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  location?: { origin?: string; hostname?: string };
};

function webWindow(): WebGlobal | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  return window as unknown as WebGlobal;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  const candidate = timer as unknown as { unref?: () => void };
  candidate.unref?.();
}

function applyRuntimeAnalyticsFlags(flags: AnalyticsRuntimeFlags): void {
  const previous = runtimeAnalyticsFlags;
  runtimeAnalyticsFlags = flags;
  if (!flags.analyticsEnabled) {
    productAnalyticsReady = false;
    pendingProductEvents = [];
  }
  const w = webWindow();
  if (!w || !analyticsConsent) return;
  if (!flags.analyticsEnabled) {
    try {
      w.gtag?.("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    } catch {
      // ignore
    }
  } else {
    try {
      w.gtag?.("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    } catch {
      // ignore
    }
  }
  const shouldLoad =
    runtimeAnalyticsBootstrapped &&
    flags.analyticsEnabled &&
    (!previous.analyticsEnabled || !productAnalyticsReady);
  if (shouldLoad) {
    try {
      void loadProductAnalytics(getEnv());
    } catch {
      // invalid build env keeps analytics off
    }
  } else if (flags.analyticsEnabled && productAnalyticsReady) {
    flushPendingProductEvents();
  }
  scheduleRuntimeAnalyticsPolling();
}

async function fetchRuntimeAnalyticsFlags(): Promise<AnalyticsRuntimeFlags> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const query = getSupabaseClient()
      .from("runtime_flags")
      .select("key, enabled")
      .in("key", ["analytics_enabled", "clarity_enabled"]);
    const { data, error } = await Promise.race([
      query,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("runtime_flags_timeout")), 5_000);
        unrefTimer(timeout);
      }),
    ]);
    if (error) return { ...RUNTIME_ANALYTICS_DEFAULTS };
    return resolveAnalyticsRuntimeFlags(data);
  } catch {
    return { ...RUNTIME_ANALYTICS_DEFAULTS };
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

async function refreshRuntimeAnalyticsFlags(force = false): Promise<AnalyticsRuntimeFlags> {
  const isFresh = Date.now() - runtimeAnalyticsFlagsCheckedAt < 60_000;
  if (!force && isFresh) return runtimeAnalyticsFlags;
  if (runtimeAnalyticsRefresh) return runtimeAnalyticsRefresh;
  runtimeAnalyticsRefresh = fetchRuntimeAnalyticsFlags()
    .then((flags) => {
      runtimeAnalyticsFlagsCheckedAt = Date.now();
      applyRuntimeAnalyticsFlags(flags);
      return flags;
    })
    .finally(() => {
      runtimeAnalyticsRefresh = null;
    });
  return runtimeAnalyticsRefresh;
}

function stopRuntimeAnalyticsPolling(): void {
  if (runtimeAnalyticsTimer === null) return;
  clearTimeout(runtimeAnalyticsTimer);
  runtimeAnalyticsTimer = null;
}

function scheduleRuntimeAnalyticsPolling(): void {
  let env: Env;
  try {
    env = getEnv();
  } catch {
    return;
  }
  if (
    runtimeAnalyticsTimer !== null ||
    !analyticsConsent ||
    !hasProductAnalyticsConfig(env) ||
    !webWindow()
  ) {
    return;
  }
  runtimeAnalyticsTimer = setTimeout(() => {
    runtimeAnalyticsTimer = null;
    void refreshRuntimeAnalyticsFlags(true).then(() => {
      if (analyticsConsent) scheduleRuntimeAnalyticsPolling();
    });
  }, 60_000);
  unrefTimer(runtimeAnalyticsTimer);
}

function hasProductAnalyticsConfig(env: Env): boolean {
  // Web Clarity is structurally disabled above. Its project id must not keep
  // the web polling loop alive or be mistaken for an active product SDK.
  return Boolean(env.EXPO_PUBLIC_GA4_MEASUREMENT_ID);
}

function cleanProps(props: AnalyticsProps | undefined): Record<string, AnalyticsPropValue> {
  const out: Record<string, AnalyticsPropValue> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Prepare event properties so a live page URL cannot survive in `path` or `title`. */
export function cleanAnalyticsEventProps(event: AnalyticsEvent): Record<string, AnalyticsPropValue> {
  if (event.name !== "page_view") return cleanProps(event.props);
  return cleanProps({
    ...event.props,
    path: sanitizeAnalyticsRoutePath(event.props.path),
    title: undefined,
  });
}

const GITHUB_PAGES_BASE_PATH = "/2nd-B";
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Defense-in-depth for accidental live URLs. The canonical caller supplies
 * Expo file segments such as `/record/[id]`; this also strips query/hash data
 * and replaces common live id/token segments if another caller regresses.
 */
export function sanitizeAnalyticsRoutePath(routePath: string): string {
  const pathOnly = routePath.split(/[?#]/, 1)[0] || "/";
  const segments = pathOnly
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (/^\[[^\]]+\]$/.test(segment) || /^\([^)]+\)$/.test(segment)) return segment;
      if (UUID_SEGMENT.test(segment) || /^\d+$/.test(segment)) return "[id]";
      if (segment.length >= 20) return "[token]";
      return segment;
    });
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

// ---------------------------------------------------------------------------
// Clarity route allow-list (2026-07-18 decision; precondition for enabling
// Clarity in production). Clarity can mask CONTENT but cannot hide URL path
// segments, and its client API has no pause/stop command - so the only
// reliable control is to never INJECT it while the session sits on an
// identifier-carrying screen. Residual risk stays real (see the PR): once
// injected on an allowed route, later same-page-lifetime navigation
// (including /record/*, /peer/*) IS recorded - URLs, clicks, referrers -
// while content stays masked via data-clarity-mask. Clarity's vendor policy
// also bars under-18 audiences; the analyticsConsent gate already restricts
// every product-analytics load to server-confirmed adults.

/** Routes where the Clarity script may be injected. "/" matches exactly;
 *  the rest are prefix matches. Identifier-carrying (/record/*, /peer/*)
 *  and writing surfaces stay out by construction (allow-list, not deny). */
export const CLARITY_ALLOWED_ROUTE_PREFIXES: readonly string[] = [
  "/",
  "/plans",
  "/settings",
  "/sign-in",
  "/onboarding",
];

/**
 * 진단 스냅샷 — Clarity 가 왜 안 켜졌는지를 **한 줄로** 볼 수 있게 게이트를 모아 준다.
 *
 * 이게 없으면 판정이 불가능하다: SDK 는 기본 로그를 안 남기고, 릴리스 빌드에는
 * 콘솔이 없다. 그래서 "대시보드에 안 뜬다"만 알 뿐 **어느 고리가 끊겼는지**를 알
 * 방법이 없었다. 각 값은 결정에 실제로 쓰이는 바로 그 변수를 읽는다.
 *
 * clarityEnabled 는 서버의 원시 flag, webHardDisabled/nativeHardDisabled 는
 * 코드 안전장치다. 원시 운영값과 실제 실행 가능 상태를 분리해서 보여 준다.
 */
export function clarityGateSnapshot(): {
  consent: boolean;
  analyticsEnabled: boolean;
  clarityEnabled: boolean;
  webHardDisabled: boolean;
  nativeHardDisabled: boolean;
  projectId: boolean;
  route: string;
  allowedRoute: boolean;
} {
  return {
    consent: analyticsConsent,
    analyticsEnabled: runtimeAnalyticsFlags.analyticsEnabled,
    clarityEnabled: runtimeAnalyticsFlags.clarityEnabled,
    webHardDisabled: Platform.OS === "web" && WEB_CLARITY_HARD_DISABLED,
    nativeHardDisabled: Platform.OS !== "web" && NATIVE_CLARITY_HARD_DISABLED,
    projectId: Boolean(clarityProjectIdForNative()),
    route: currentAnalyticsRoute,
    allowedRoute: isClarityAllowedRoute(currentAnalyticsRoute),
  };
}

export function isClarityAllowedRoute(routePath: string): boolean {
  const route = sanitizeAnalyticsRoutePath(routePath);
  return CLARITY_ALLOWED_ROUTE_PREFIXES.some((p) =>
    p === "/" ? route === "/" : route === p || route.startsWith(`${p}/`),
  );
}

/** Build a GA-safe absolute page location without reading the live URL. */
export function buildAnalyticsPageLocation(routePath: string, origin?: string): string {
  const safeRoute = sanitizeAnalyticsRoutePath(routePath);
  const safeOrigin = origin?.replace(/\/+$/, "") ?? "";
  return `${safeOrigin}${GITHUB_PAGES_BASE_PATH}${safeRoute}`;
}

function gaContextProps(w: WebGlobal, routePath = currentAnalyticsRoute): Record<string, string> {
  const path = sanitizeAnalyticsRoutePath(routePath);
  const safeRoot = buildAnalyticsPageLocation("/", w.location?.origin);
  return {
    page_location: buildAnalyticsPageLocation(path, w.location?.origin),
    page_referrer: safeRoot,
    page_title: path,
  };
}

function deliverProductEvent(event: PreparedProductEvent): boolean {
  let delivered = false;
  const w = webWindow();
  if (ga4Id && w?.gtag) {
    try {
      // Never let the browser's live URL/title enrich a custom event.
      w.gtag("event", event.name, { ...event.props, ...gaContextProps(w, event.route) });
      delivered = true;
    } catch {
      // ignore
    }
  }
  return delivered;
}

function enqueueProductEvent(event: PreparedProductEvent): void {
  if (pendingProductEvents.length >= 20) pendingProductEvents.shift();
  pendingProductEvents.push(event);
}

function flushPendingProductEvents(): void {
  if (!analyticsConsent || !runtimeAnalyticsFlags.analyticsEnabled) {
    pendingProductEvents = [];
    return;
  }
  if (!productAnalyticsReady) return;
  const queued = pendingProductEvents;
  pendingProductEvents = [];
  for (const event of queued) deliverProductEvent(event);
}

/**
 * Lazy-initialize analytics. Safe to call multiple times - subsequent calls are
 * no-ops. Called once from src/app/_layout.tsx as `void initAnalytics()`.
 *
 * Product analytics load only when analytics consent has been granted AND the
 * relevant id/key is configured. Third-party crash reporting is hard-disabled:
 * configured crash-reporting credentials are deliberately not read here.
 *
 * Failure modes (network, ad blockers, no ids, SSR): swallowed. Analytics must
 * never be a hard dependency for the app working.
 */
export async function initAnalytics(opts?: { analyticsConsent?: boolean } & AnalyticsSubjectGate): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Assert both native product-analytics SDKs OFF synchronously at boot, before
  // any env/web checks. Web GA4 keeps its independent consent/runtime flow.
  syncNativeAnalyticsOff();

  let env: Env;
  try {
    env = getEnv();
  } catch {
    return;
  }

  // Web SDK path from here down; the native gate was already applied above.
  if (!webWindow()) return; // also covers SSR / static export

  // Establish the initial gate before the first await. Auth may resolve and call
  // setAnalyticsConsent() while the runtime flag fetch is in flight; assigning
  // the default after that await would overwrite a newer server-derived grant.
  analyticsConsent = canLoadProductAnalytics(opts?.analyticsConsent ?? false, opts);

  // Deployment-free operator gate. Consent and confirmed-adult status remain
  // mandatory, but neither can override an operator shutdown. Migration lag,
  // missing rows, and network errors all fail closed.
  runtimeAnalyticsFlags = await refreshRuntimeAnalyticsFlags(true);

  // M1 (round-4): do NOT trust the localStorage cache to auto-load product
  // analytics at boot - a stale "granted", or a 14-17 minor who set the key in
  // devtools, would load GA4/Clarity without re-checking the SERVER
  // decision. Product analytics now load ONLY from an explicit, server-derived
  // decision: initAnalytics({analyticsConsent}) or setAnalyticsConsent() once
  // AuthContext resolves external_analytics + minor status (see the
  // AnalyticsConsentSync effect in _layout).
  if (analyticsConsent && runtimeAnalyticsFlags.analyticsEnabled) {
    await loadProductAnalytics(env);
  }
  runtimeAnalyticsBootstrapped = true;
}

/**
 * Load the consent-gated web product analytics SDK (GA4). Web Clarity is
 * structurally disabled; native Clarity is controlled by clarity-native.ts.
 * This remains safe to call more than once (e.g. from initAnalytics and again
 * from setAnalyticsConsent when the user opts in mid-session).
 */
async function loadProductAnalytics(env: Env): Promise<void> {
  if (!webWindow() || !analyticsConsent || !runtimeAnalyticsFlags.analyticsEnabled) return;
  if (productAnalyticsLoad) return productAnalyticsLoad;
  productAnalyticsReady = false;
  productAnalyticsLoad = performProductAnalyticsLoad(env).finally(() => {
    productAnalyticsLoad = null;
    if (analyticsConsent && runtimeAnalyticsFlags.analyticsEnabled) {
      productAnalyticsReady = true;
      flushPendingProductEvents();
    }
  });
  return productAnalyticsLoad;
}

async function performProductAnalyticsLoad(env: Env): Promise<void> {
  const w = webWindow();
  if (!w || !analyticsConsent || !runtimeAnalyticsFlags.analyticsEnabled) return;

  // GA4 (gtag.js) - public measurement id, privacy-hardened (IP anonymized, no
  // Google/ad signals). Inject the tag script once. Keep this before the
  // async SDK loads so the first consented page view is not
  // delayed or dropped while an uninstalled optional package rejects.
  if (!ga4Id && env.EXPO_PUBLIC_GA4_MEASUREMENT_ID) {
    try {
      const id = env.EXPO_PUBLIC_GA4_MEASUREMENT_ID;
      w.dataLayer = w.dataLayer || [];
      // gtag.js processes ONLY command tuples pushed as `arguments` objects; a
      // plain array is silently dropped. That shipped as the 2026-07-18 P0
      // no-collect defect: the container loaded and the dataLayer sequence
      // looked right, yet zero /g/collect hits left the page. Keep this a
      // `function` (arrows have no `arguments`).
      const gtag = function () {
        (w.dataLayer as unknown[]).push(arguments);
      } as (...args: unknown[]) => void;
      w.gtag = gtag;
      gtag("js", new Date());
      // Consent mode: we only reach here after explicit opt-in.
      gtag("consent", "default", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      gtag("config", id, {
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        send_page_view: false,
        ...gaContextProps(w),
      });
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(s);
      ga4Id = id;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] ga4 init skipped:", (e as Error).message);
    }
  }

  if (hasProductAnalyticsConfig(env)) {
    scheduleRuntimeAnalyticsPolling();
  }
}

/**
 * Record the user's analytics-consent decision. Persists it (web) so it gates
 * the next load, and - when granting in-session after init - loads the product
 * analytics SDK immediately. Revoking stops app-driven events synchronously,
 * updates GA4 consent, and clears any legacy Clarity cookies in the session.
 */
export interface AnalyticsConsentApplyOptions {
  /** Ignore a server read if a newer privacy action changed consent meanwhile. */
  expectedRevision?: number;
}

export function getAnalyticsConsentRevision(): number {
  return analyticsConsentRevision;
}

// Trackers the app may have set while consent was granted: GA4 stores
// _ga / _ga_<STREAM> (prefix "_ga" also covers _gat throttling cookies);
// Clarity stores _clck / _clsk. Prefix match against document.cookie names.
const TRACKING_COOKIE_PREFIXES = ["_clck", "_clsk", "_ga"] as const;

/**
 * Expire tracker cookies after a REAL consent revoke. document.cookie only
 * exposes name=value pairs, never each cookie's domain/path, so every present
 * tracker name is expired across all plausible variants: host-only, the exact
 * hostname, and the dot-hostname, each at "/", the GitHub Pages base path,
 * and the base path with a trailing slash. Expiring a variant that was never
 * set is a no-op; cookie access failures must never break the consent flow.
 */
function expireTrackingCookies(): void {
  const w = webWindow();
  if (!w || typeof document === "undefined") return;
  try {
    const names = new Set(
      document.cookie
        .split(";")
        .map((part) => part.split("=", 1)[0]?.trim() ?? "")
        .filter((name) => TRACKING_COOKIE_PREFIXES.some((p) => name.startsWith(p))),
    );
    if (names.size === 0) return;
    const hostname = w.location?.hostname ?? "";
    const domains = [""];
    if (hostname) domains.push(hostname, `.${hostname}`);
    const paths = ["/", GITHUB_PAGES_BASE_PATH, `${GITHUB_PAGES_BASE_PATH}/`];
    for (const name of names) {
      for (const path of paths) {
        for (const domain of domains) {
          document.cookie =
            `${name}=; Max-Age=0; path=${path}` + (domain ? `; domain=${domain}` : "");
        }
      }
    }
  } catch {
    // ignore - a blocked cookie store (exotic embeddings) is already private
  }
}

export function setAnalyticsConsent(
  granted: boolean,
  gate?: AnalyticsSubjectGate,
  options?: AnalyticsConsentApplyOptions,
): boolean {
  if (
    options?.expectedRevision !== undefined &&
    options.expectedRevision !== analyticsConsentRevision
  ) {
    return false;
  }
  analyticsConsentRevision += 1;
  const wasGranted = analyticsConsent;
  analyticsConsent = canLoadProductAnalytics(granted, gate);
  // Both native product-analytics SDKs are reasserted OFF for every resolved
  // decision; web SDK consent is handled below.
  syncNativeAnalyticsOff();
  const w = webWindow();
  try {
    w?.localStorage?.setItem(CONSENT_KEY, analyticsConsent ? "granted" : "denied");
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  if (!analyticsConsent) {
    productAnalyticsReady = false;
    pendingProductEvents = [];
    stopRuntimeAnalyticsPolling();
  }
  if (!analyticsConsent && w) {
    try {
      w.gtag?.("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    } catch {
      // ignore
    }
    // Expire tracker cookies (_clck/_clsk/_ga*) on a REAL revoke (granted ->
    // denied in this session) or a server-resolved denial (expectedRevision
    // present = the AnalyticsConsentSync outcome, catching a revoke made on
    // another device). The boot-time preemptive revoke (no options) must NOT
    // purge: it fires before every grant resolution, and wiping _ga there
    // would reset a consented user's GA client id on every cold start.
    if (wasGranted || options?.expectedRevision !== undefined) {
      expireTrackingCookies();
    }
    return true;
  }
  if (analyticsConsent && initialized && w) {
    let env: Env;
    try {
      env = getEnv();
    } catch {
      return true;
    }
    void refreshRuntimeAnalyticsFlags(true).then((flags) => {
      if (!analyticsConsent || !flags.analyticsEnabled) return;
      try {
        w.gtag?.("consent", "update", {
          analytics_storage: "granted",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
      } catch {
        // ignore
      }
      void loadProductAnalytics(env);
    });
  }
  return true;
}

/** Track a high-level product event. Returns false when consent blocks it. */
export function captureEvent(event: AnalyticsEvent): boolean {
  // Remember the safe file route even while consent is denied. If consent is
  // granted moments later, GA config and every subsequent custom event still
  // receive the correct redacted route rather than the browser's live URL.
  if (event.name === "page_view") {
    currentAnalyticsRoute = sanitizeAnalyticsRoutePath(event.props.path);
    // Native Clarity is OFF-only; navigation reasserts that state with the
    // already-sanitized route metadata.
    syncNativeClarityOff();
  }
  // Re-check at most once per minute. The current event uses the last safe
  // snapshot; a newly disabled flag revokes loaded GA immediately
  // when the asynchronous refresh resolves.
  if (initialized && webWindow()) void refreshRuntimeAnalyticsFlags();
  const prepared = {
    name: event.name,
    props: cleanAnalyticsEventProps(event),
    route: currentAnalyticsRoute,
  } satisfies PreparedProductEvent;
  // Opt-out is immediate for every app-driven event. A Google tag already
  // loaded in this document can still emit consent-status/cookieless pings;
  // production therefore also requires GA's behavioral + diagnostic data
  // transmission controls and automatic history events to be disabled.
  if (!analyticsConsent) return false;
  if (
    runtimeAnalyticsRefresh ||
    !runtimeAnalyticsFlags.analyticsEnabled ||
    !productAnalyticsReady
  ) {
    const awaitingDecision =
      runtimeAnalyticsRefresh !== null ||
      runtimeAnalyticsFlagsCheckedAt === 0 ||
      (runtimeAnalyticsFlags.analyticsEnabled && !productAnalyticsReady);
    if (!awaitingDecision) return false;
    enqueueProductEvent(prepared);
    return true;
  }
  return deliverProductEvent(prepared);
}

/**
 * Kept as a compatibility no-op. Direct app account ids are intentionally not
 * forwarded to third-party web analytics; anonymous consented sessions are
 * sufficient for the current product metrics.
 */
export function identifyUser(_userId: string): void {
  // Intentionally empty.
}

/** Local compatibility fallback while third-party crash reporting is hard-disabled. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  // Keep failures visible to local development without transmitting them.
  if (typeof console !== "undefined") console.error("[exception]", err, context);
}

/** Test hook only. */
export function __resetAnalytics(): void {
  initialized = false;
  analyticsConsent = false;
  analyticsConsentRevision = 0;
  runtimeAnalyticsFlags = { ...RUNTIME_ANALYTICS_DEFAULTS };
  runtimeAnalyticsFlagsCheckedAt = 0;
  runtimeAnalyticsRefresh = null;
  stopRuntimeAnalyticsPolling();
  runtimeAnalyticsBootstrapped = false;
  productAnalyticsReady = false;
  productAnalyticsLoad = null;
  pendingProductEvents = [];
  ga4Id = null;
  currentAnalyticsRoute = "/";
  nativeApplierOverride = null;
  nativeLatestApply = Promise.resolve();
}
