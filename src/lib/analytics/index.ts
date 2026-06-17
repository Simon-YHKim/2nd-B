// Lightweight analytics + error-tracking abstraction.
//
// Why: the blueprint promises $0 fixed cost. PostHog, GA4, MS Clarity, and
// Sentry all have free tiers, but we do not load an SDK until it is actually
// configured. This module is a no-op when the relevant env id is
// unset (so dev/preview builds stay dependency-free) and wires up the real
// tools when Simon adds the ids to GitHub Actions / EAS Variables.
//
// Web-only for now (Expo Web on GitHub Pages). Native builds (iOS/Android via
// EAS) get their own SDK wiring later.
//
// PRIVACY / PIPA: product analytics (PostHog, GA4, Clarity) load ONLY after the
// user grants the optional `analytics` consent (consent-selections.ts). The
// consent decision is persisted on web (localStorage) so it gates the next load
// too. Error tracking (Sentry) is operational, carries no PII (sendDefaultPii
// off), and loads independently. GA4 runs with IP anonymization + no ad
// signals; Clarity is loaded only post-consent and its project must be set to
// mask text (the app shows sensitive self-knowledge content).

import { Platform } from "react-native";

import { getEnv, type Env } from "../env";

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
  /** True for 14-17 high-privacy users. Product analytics stay off. */
  isMinor?: boolean | null;
  /** True below the KR/PIPA self-consent floor. Product analytics and ads stay off. */
  underDigitalConsentAge?: boolean | null;
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
  return granted === true && gate?.isMinor !== true && gate?.underDigitalConsentAge !== true;
}

const CONSENT_KEY = "2ndb_analytics_consent";

let initialized = false;
let analyticsConsent = false;
let posthogClient: { capture: (name: string, props?: Record<string, unknown>) => void; identify: (id: string) => void } | null = null;
let sentryClient: { captureException: (err: unknown, context?: Record<string, unknown>) => void } | null = null;
let ga4Id: string | null = null; // set once GA4 is loaded
let clarityLoaded = false;

type WebGlobal = {
  localStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
};

function webWindow(): WebGlobal | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  return window as unknown as WebGlobal;
}

function cleanProps(props: AnalyticsProps | undefined): Record<string, AnalyticsPropValue> {
  const out: Record<string, AnalyticsPropValue> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
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

  let env: Env;
  try {
    env = getEnv();
  } catch {
    return;
  }

  // Web-only path. Native builds will get their own wiring later.
  if (!webWindow()) return; // also covers SSR / static export

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
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      });
      sentryClient = { captureException: mod.captureException };
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] sentry init skipped:", (e as Error).message);
    }
  }

  // M1 (round-4): do NOT trust the localStorage cache to auto-load product
  // analytics at boot - a stale "granted", or a 14-17 minor who set the key in
  // devtools, would load GA4/Clarity/PostHog without re-checking the SERVER
  // decision. Product analytics now load ONLY from an explicit, server-derived
  // decision: initAnalytics({analyticsConsent}) or setAnalyticsConsent() once
  // AuthContext resolves external_analytics + minor status (see the
  // AnalyticsConsentSync effect in _layout). Sentry (above) is operational +
  // PII-free, so it loads regardless of this gate.
  analyticsConsent = canLoadProductAnalytics(opts?.analyticsConsent ?? false, opts);
  if (analyticsConsent) await loadProductAnalytics(env);
}

/**
 * Load the consent-gated product-analytics SDKs (PostHog + GA4 + Clarity). Each
 * is independently gated on its id/key and on already-loaded guards, so this is
 * safe to call more than once (e.g. from initAnalytics and again from
 * setAnalyticsConsent when the user opts in mid-session).
 */
async function loadProductAnalytics(env: Env): Promise<void> {
  const w = webWindow();
  if (!w) return;

  // PostHog product analytics.
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
      mod.default.init(env.EXPO_PUBLIC_POSTHOG_KEY, {
        api_host: env.EXPO_PUBLIC_POSTHOG_HOST,
        autocapture: false, // explicit events only - no input scraping
        capture_pageview: false, // screen-level events captured manually
        disable_session_recording: true, // privacy-first
        persistence: "memory", // no localStorage by default
      });
      posthogClient = mod.default;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] posthog init skipped:", (e as Error).message);
    }
  }

  // GA4 (gtag.js) - public measurement id, privacy-hardened (IP anonymized, no
  // Google/ad signals). Inject the tag script once.
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
  if (!clarityLoaded && env.EXPO_PUBLIC_CLARITY_PROJECT_ID) {
    try {
      const id = env.EXPO_PUBLIC_CLARITY_PROJECT_ID;
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
      first?.parentNode?.insertBefore(t, first);
      w.clarity?.("consent"); // we only load Clarity after analytics consent
      clarityLoaded = true;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] clarity init skipped:", (e as Error).message);
    }
  }
}

/**
 * Record the user's analytics-consent decision. Persists it (web) so it gates
 * the next load, and - when granting in-session after init - loads the product
 * analytics SDKs immediately. Revoking takes effect on the next reload (loaded
 * third-party SDKs can't be cleanly torn down mid-session).
 */
export function setAnalyticsConsent(granted: boolean, gate?: AnalyticsSubjectGate): void {
  analyticsConsent = canLoadProductAnalytics(granted, gate);
  const w = webWindow();
  try {
    w?.localStorage?.setItem(CONSENT_KEY, analyticsConsent ? "granted" : "denied");
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  if (analyticsConsent && initialized && w) {
    let env: Env;
    try {
      env = getEnv();
    } catch {
      return;
    }
    void loadProductAnalytics(env);
  }
}

/** Track a high-level product event. No-op until product analytics are loaded. */
export function captureEvent(event: AnalyticsEvent): void {
  // Opt-out must be immediate: loaded SDKs can't be torn down mid-session, but
  // all emission is app-driven (autocapture/page_view off), so gating here stops
  // every GA4/PostHog hit the instant consent is revoked.
  if (!analyticsConsent) return;
  const props = cleanProps(event.props);
  if (posthogClient) {
    try {
      posthogClient.capture(event.name, props);
    } catch {
      // analytics failures must not propagate
    }
  }
  const w = webWindow();
  if (ga4Id && w?.gtag) {
    try {
      w.gtag("event", event.name, props);
    } catch {
      // ignore
    }
  }
}

/** Pin events to the current user id (call after sign-in). No-op until loaded. */
export function identifyUser(userId: string): void {
  // Respect a revoked consent the same way captureEvent does.
  if (!analyticsConsent) return;
  if (posthogClient) {
    try {
      posthogClient.identify(userId);
    } catch {
      // ignore
    }
  }
  const w = webWindow();
  if (ga4Id && w?.gtag) {
    try {
      w.gtag("config", ga4Id, { user_id: userId });
    } catch {
      // ignore
    }
  }
  if (clarityLoaded && w?.clarity) {
    try {
      w.clarity("identify", userId);
    } catch {
      // ignore
    }
  }
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
  posthogClient = null;
  sentryClient = null;
  ga4Id = null;
  clarityLoaded = false;
}
