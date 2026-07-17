// Lightweight analytics + error-tracking abstraction.
//
// Why: the blueprint promises $0 fixed cost. PostHog, GA4, MS Clarity, and
// Sentry all have free tiers, but we do not load an SDK until it is actually
// configured. This module is a no-op when the relevant env id is
// unset (so dev/preview builds stay dependency-free) and wires up the real
// tools when Simon adds the ids to GitHub Actions / EAS Variables.
//
// Web SDKs (GA4/Clarity/PostHog/Sentry) load on Expo Web (GitHub Pages).
// Native Android builds mirror the same consent decision into Firebase
// Analytics via syncNativeAnalyticsCollection below: collection is OFF at the
// build level (firebase.json) and turns on only through that gate.
//
// PRIVACY / PIPA: product analytics (PostHog, GA4, Clarity) load ONLY after the
// user grants the optional `analytics` consent (consent-selections.ts) AND the
// server-derived birth date confirms the user is 18+. Unknown age fails closed.
// The consent decision is persisted on web (localStorage) so it gates the next
// load too. Error tracking (Sentry) is operational, carries no PII
// (sendDefaultPii off), and loads independently. GA4 runs with IP anonymization
// + no ad signals; Clarity is loaded only post-consent and its project must be
// set to mask text (the app shows sensitive self-knowledge content).

import { Platform } from "react-native";

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
  | "purchase";

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
  | PurchaseAnalyticsEvent;

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

export type StarLitAnalyticsEvent = { name: "star_lit"; props: StarLitEventProps };
export type ActivationMilestoneAnalyticsEvent = { name: "activation_milestone"; props: ActivationMilestoneEventProps };
export type AiLimitHitAnalyticsEvent = { name: "ai_limit_hit"; props: AiLimitHitEventProps };
export type PlansViewedAnalyticsEvent = { name: "plans_viewed"; props: PlansViewedEventProps };
export type PlansTierFocusedAnalyticsEvent = { name: "plans_tier_focused"; props: PlansTierFocusedEventProps };
export type CheckoutStartedAnalyticsEvent = { name: "checkout_started"; props: CheckoutStartedEventProps };
export type PurchaseAnalyticsEvent = { name: "purchase"; props: PurchaseEventProps };

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
// analytics_auto_collection_enabled=false plus denied consent-mode defaults,
// so the SDK collects nothing between process start and this gate running.
// At runtime the SAME canLoadProductAnalytics decision that gates the web
// SDKs is mirrored into the native SDK: collection turns ON only for a
// server-confirmed adult (18+) whose external_analytics pref is granted;
// 14-17 minors, under-14, and unresolved age stay OFF (fail closed).
//
// The SDK is imported lazily and every call is guarded: in Expo Go, on web,
// or when the native module / google-services config is absent, the import or
// call rejects and the build-level OFF default simply stands.

type NativeAnalyticsApplier = (enabled: boolean) => Promise<void>;

let nativeApplierOverride: NativeAnalyticsApplier | null = null;
let nativeApplyTarget: boolean | null = null;
let nativeApplyChain: Promise<void> = Promise.resolve();

async function applyNativeAnalyticsCollection(enabled: boolean): Promise<void> {
  try {
    const mod = await import("@react-native-firebase/analytics");
    const analytics = mod.getAnalytics();
    // Consent mode first so an enable can never race ahead of its storage
    // grant; ad signals stay denied in every state (analytics-only consent).
    await mod.setConsent(analytics, {
      analytics_storage: enabled,
      ad_storage: false,
      ad_user_data: false,
      ad_personalization: false,
    });
    await mod.setAnalyticsCollectionEnabled(analytics, enabled);
  } catch {
    // Fail closed: without the SDK/native module the build-level OFF stands.
  }
}

/**
 * Mirror the resolved product-analytics decision into the native Firebase
 * SDK. Serialized so rapid toggles apply in submission order; deduped on the
 * target state. No-op on web (loadProductAnalytics handles the web SDKs).
 */
function syncNativeAnalyticsCollection(enabled: boolean): void {
  if (Platform.OS === "web") return;
  if (nativeApplyTarget === enabled) return;
  nativeApplyTarget = enabled;
  const applier = nativeApplierOverride ?? applyNativeAnalyticsCollection;
  nativeApplyChain = nativeApplyChain.then(() => applier(enabled)).catch(() => {});
}

/** Test hook only: substitute the native applier (null restores the real one). */
export function __setNativeAnalyticsApplierForTests(applier: NativeAnalyticsApplier | null): void {
  nativeApplierOverride = applier;
}

/** Test hook only: await the native apply queue. */
export function __flushNativeAnalyticsForTests(): Promise<void> {
  return nativeApplyChain;
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
let posthogClient: { capture: (name: string, props?: Record<string, unknown>) => void; identify: (id: string) => void } | null = null;
let sentryClient: { captureException: (err: unknown, context?: Record<string, unknown>) => void } | null = null;
let ga4Id: string | null = null; // set once GA4 is loaded
let clarityLoaded = false;
let currentAnalyticsRoute = "/";

type WebGlobal = {
  localStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
  location?: { origin?: string };
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
    stopRuntimeAnalyticsPolling();
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
  if (clarityLoaded && w.clarity) {
    try {
      const clarityGranted = flags.analyticsEnabled && flags.clarityEnabled;
      w.clarity("consentv2", {
        ad_Storage: "denied",
        analytics_Storage: clarityGranted ? "granted" : "denied",
      });
      if (!clarityGranted) w.clarity("consent", false);
    } catch {
      // ignore
    }
  }
  const shouldLoad =
    runtimeAnalyticsBootstrapped &&
    flags.analyticsEnabled &&
    (!previous.analyticsEnabled ||
      (!previous.clarityEnabled && flags.clarityEnabled) ||
      !productAnalyticsReady);
  if (shouldLoad) {
    try {
      void loadProductAnalytics(getEnv());
    } catch {
      // invalid build env keeps analytics off
    }
  } else if (flags.analyticsEnabled && productAnalyticsReady) {
    flushPendingProductEvents();
  }
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
  if (
    runtimeAnalyticsTimer !== null ||
    !analyticsConsent ||
    !runtimeAnalyticsFlags.analyticsEnabled ||
    !webWindow()
  ) {
    return;
  }
  runtimeAnalyticsTimer = setTimeout(() => {
    runtimeAnalyticsTimer = null;
    void refreshRuntimeAnalyticsFlags(true).then((flags) => {
      if (analyticsConsent && flags.analyticsEnabled) scheduleRuntimeAnalyticsPolling();
    });
  }, 60_000);
  unrefTimer(runtimeAnalyticsTimer);
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
  let delivered = clarityLoaded && runtimeAnalyticsFlags.clarityEnabled;
  if (posthogClient) {
    try {
      posthogClient.capture(event.name, event.props);
      delivered = true;
    } catch {
      // analytics failures must not propagate
    }
  }
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

type SentryBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

type SentryEvent = {
  request?: {
    url?: string;
    headers?: Record<string, unknown>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  transaction?: string;
  breadcrumbs?: SentryBreadcrumb[];
};

function scrubSentryBreadcrumb(breadcrumb: SentryBreadcrumb): SentryBreadcrumb {
  const data = { ...breadcrumb.data };
  for (const key of Object.keys(data)) {
    if (/(url|uri|href|path|query|referr|from|to)/i.test(key)) data[key] = "[redacted]";
  }
  const message =
    typeof breadcrumb.message === "string" &&
    /(https?:\/\/|\/record\/|\/peer\/|[?&](code|token|email)=)/i.test(breadcrumb.message)
      ? "[redacted]"
      : breadcrumb.message;
  return { ...breadcrumb, message, data };
}

/** Remove live URLs and request material from consent-independent Sentry events. */
export function scrubSentryEvent(
  event: SentryEvent,
  routePath = "/",
  origin?: string,
): SentryEvent {
  if (event.request) {
    event.request.url = buildAnalyticsPageLocation(routePath, origin);
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
  }
  event.transaction = sanitizeAnalyticsRoutePath(routePath);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubSentryBreadcrumb);
  return event;
}

/**
 * Lazy-initialize analytics. Safe to call multiple times - subsequent calls are
 * no-ops. Called once from src/app/_layout.tsx as `void initAnalytics()`.
 *
 * Error tracking loads whenever EXPO_PUBLIC_SENTRY_DSN is set. Product analytics load only
 * when analytics consent has been granted (explicit opt-in or a persisted prior
 * grant) AND the relevant id/key is configured.
 *
 * Failure modes (network, ad blockers, no ids, SSR): swallowed. Analytics must
 * never be a hard dependency for the app working.
 */
export async function initAnalytics(opts?: { analyticsConsent?: boolean } & AnalyticsSubjectGate): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Native (Android) Firebase Analytics: assert the fail-closed default
  // synchronously at boot, before any env/web checks. _layout calls this with
  // no opts, so a cold start always re-applies OFF until the server-derived
  // decision arrives through setAnalyticsConsent.
  syncNativeAnalyticsCollection(canLoadProductAnalytics(opts?.analyticsConsent ?? false, opts));

  let env: Env;
  try {
    env = getEnv();
  } catch {
    return;
  }

  // Web SDK path from here down; the native gate was already applied above.
  if (!webWindow()) return; // also covers SSR / static export

  // Establish the initial gate BEFORE the first await. Auth may resolve and call
  // setAnalyticsConsent() while Sentry's dynamic import is in flight; assigning
  // the default after that await would overwrite a newer server-derived grant.
  analyticsConsent = canLoadProductAnalytics(opts?.analyticsConsent ?? false, opts);

  // Sentry error tracking - operational, no PII, loads independently of the
  // analytics consent gate.
  const sentryDsn = env.EXPO_PUBLIC_SENTRY_DSN || env.SENTRY_DSN;
  if (sentryDsn) {
    try {
      const mod = (await import("@sentry/browser")) as {
        init: (opts: Record<string, unknown>) => void;
        captureException: (err: unknown, context?: Record<string, unknown>) => void;
      };
      mod.init({
        dsn: sentryDsn,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        tracePropagationTargets: [],
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        beforeSend: (event: SentryEvent) =>
          scrubSentryEvent(event, currentAnalyticsRoute, webWindow()?.location?.origin),
        beforeBreadcrumb: (breadcrumb: SentryBreadcrumb) => scrubSentryBreadcrumb(breadcrumb),
      });
      sentryClient = { captureException: mod.captureException };
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] sentry init skipped:", (e as Error).message);
    }
  }

  // Deployment-free operator gate. Consent and confirmed-adult status remain
  // mandatory, but neither can override an operator shutdown. Migration lag,
  // missing rows, and network errors all fail closed.
  runtimeAnalyticsFlags = await refreshRuntimeAnalyticsFlags(true);

  // M1 (round-4): do NOT trust the localStorage cache to auto-load product
  // analytics at boot - a stale "granted", or a 14-17 minor who set the key in
  // devtools, would load GA4/Clarity/PostHog without re-checking the SERVER
  // decision. Product analytics now load ONLY from an explicit, server-derived
  // decision: initAnalytics({analyticsConsent}) or setAnalyticsConsent() once
  // AuthContext resolves external_analytics + minor status (see the
  // AnalyticsConsentSync effect in _layout). Sentry (above) is operational +
  // PII-free, so it loads regardless of this gate.
  if (analyticsConsent && runtimeAnalyticsFlags.analyticsEnabled) {
    await loadProductAnalytics(env);
  }
  runtimeAnalyticsBootstrapped = true;
}

/**
 * Load the consent-gated product-analytics SDKs (PostHog + GA4 + Clarity). Each
 * is independently gated on its id/key and on already-loaded guards, so this is
 * safe to call more than once (e.g. from initAnalytics and again from
 * setAnalyticsConsent when the user opts in mid-session).
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
  // optional PostHog dynamic import so the first consented page view is not
  // delayed or dropped while an uninstalled optional package rejects.
  if (!ga4Id && env.EXPO_PUBLIC_GA4_MEASUREMENT_ID) {
    try {
      const id = env.EXPO_PUBLIC_GA4_MEASUREMENT_ID;
      w.dataLayer = w.dataLayer || [];
      const gtag = (...args: unknown[]) => {
        (w.dataLayer as unknown[]).push(args);
      };
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

  // MS Clarity - loaded only post-consent. The project must be configured to
  // mask text (sensitive content); signal cookie consent after load.
  if (
    runtimeAnalyticsFlags.clarityEnabled &&
    !clarityLoaded &&
    env.EXPO_PUBLIC_CLARITY_PROJECT_ID
  ) {
    try {
      const id = env.EXPO_PUBLIC_CLARITY_PROJECT_ID;
      // Mask the entire rendered document even if an operator later weakens the
      // project setting. Clarity still sees the live URL, so routes containing
      // ids/tokens require a separate console/vendor review before production.
      document.documentElement.setAttribute("data-clarity-mask", "true");
      const c = w as unknown as Record<string, unknown>;
      const clarity = (...args: unknown[]) => {
        const q = (c.clarity as { q?: unknown[] } | undefined)?.q;
        ((c.clarity as { q?: unknown[] }).q = q || []).push(args);
      };
      if (!c.clarity) c.clarity = clarity;
      const t = document.createElement("script");
      t.async = true;
      t.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
      const first = document.getElementsByTagName("script")[0];
      if (first?.parentNode) first.parentNode.insertBefore(t, first);
      else document.head.appendChild(t);
      // ConsentV2 is the current Clarity API. Advertising storage stays denied;
      // this product consent covers usage analytics only.
      w.clarity?.("consentv2", {
        ad_Storage: "denied",
        analytics_Storage: "granted",
      });
      clarityLoaded = true;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] clarity init skipped:", (e as Error).message);
    }
  }

  // PostHog product analytics. This remains last because it is an optional peer
  // dependency; a missing package must never delay GA4 or Clarity setup.
  if (!posthogClient && env.EXPO_PUBLIC_POSTHOG_KEY && env.EXPO_PUBLIC_POSTHOG_HOST) {
    try {
      // @ts-expect-error - optional peer dep. The operator installs posthog-js
      // once ready to wire analytics; until then this dynamic import throws.
      const mod = (await import("posthog-js")) as {
        default: {
          init: (key: string, opts: Record<string, unknown>) => void;
          capture: (name: string, props?: Record<string, unknown>) => void;
          identify: (id: string) => void;
        };
      };
      if (!analyticsConsent || !runtimeAnalyticsFlags.analyticsEnabled) return;
      mod.default.init(env.EXPO_PUBLIC_POSTHOG_KEY, {
        api_host: env.EXPO_PUBLIC_POSTHOG_HOST,
        autocapture: false, // explicit events only - no input scraping
        capture_pageview: false, // screen-level events captured manually
        disable_session_recording: true, // privacy-first
        persistence: "memory", // no localStorage by default
        property_denylist: [
          "$current_url",
          "$pathname",
          "$referrer",
          "$referring_domain",
          "$host",
          "$session_entry_url",
          "$session_entry_host",
          "$session_entry_pathname",
          "$prev_pageview_pathname",
        ],
      });
      posthogClient = mod.default;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] posthog init skipped:", (e as Error).message);
    }
  }
  if (
    env.EXPO_PUBLIC_GA4_MEASUREMENT_ID ||
    env.EXPO_PUBLIC_CLARITY_PROJECT_ID ||
    (env.EXPO_PUBLIC_POSTHOG_KEY && env.EXPO_PUBLIC_POSTHOG_HOST)
  ) {
    scheduleRuntimeAnalyticsPolling();
  }
}

/**
 * Record the user's analytics-consent decision. Persists it (web) so it gates
 * the next load, and - when granting in-session after init - loads the product
 * analytics SDKs immediately. Revoking stops app-driven events synchronously,
 * updates GA4/Clarity consent, and clears Clarity cookies in the current session.
 */
export interface AnalyticsConsentApplyOptions {
  /** Ignore a server read if a newer privacy action changed consent meanwhile. */
  expectedRevision?: number;
}

export function getAnalyticsConsentRevision(): number {
  return analyticsConsentRevision;
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
  analyticsConsent = canLoadProductAnalytics(granted, gate);
  // Native builds mirror the same resolved decision (revision-guarded above);
  // a native revoke is immediate (setAnalyticsCollectionEnabled false), unlike
  // the web SDKs which also need their consent-update calls below.
  syncNativeAnalyticsCollection(analyticsConsent);
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
    if (clarityLoaded && w.clarity) {
      try {
        w.clarity("consentv2", {
          ad_Storage: "denied",
          analytics_Storage: "denied",
        });
        // ConsentV1's false form is still the documented cookie-erasure API.
        w.clarity("consent", false);
      } catch {
        // ignore
      }
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
        if (flags.clarityEnabled && clarityLoaded && w.clarity) {
          w.clarity("consentv2", {
            ad_Storage: "denied",
            analytics_Storage: "granted",
          });
        }
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
  }
  // Re-check at most once per minute. The current event uses the last safe
  // snapshot; a newly disabled flag revokes loaded GA/Clarity immediately
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

/** Report an exception with structured context. No-op when Sentry isn't configured. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryClient) {
    // Fall back to console so failures aren't silent in dev.
    if (typeof console !== "undefined") console.error("[exception]", err, context);
    return;
  }
  try {
    sentryClient.captureException(err, context);
  } catch {
    // ignore
  }
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
  posthogClient = null;
  sentryClient = null;
  ga4Id = null;
  clarityLoaded = false;
  currentAnalyticsRoute = "/";
  nativeApplierOverride = null;
  nativeApplyTarget = null;
  nativeApplyChain = Promise.resolve();
}
