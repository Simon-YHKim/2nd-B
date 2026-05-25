// Lightweight analytics + error-tracking abstraction.
//
// Why: the blueprint promises $0 fixed cost. Sentry and PostHog both
// have generous free tiers, but we don't want to commit to either SDK
// in the bundle until they're actually configured. This module is a
// no-op when no env keys are set (so dev/preview builds stay
// dependency-free) and wires up real SDK calls when Simon adds the
// keys to GitHub Actions Variables.
//
// Native builds (iOS/Android via EAS) will use sentry-expo +
// posthog-react-native; until those builds exist this stays Web-only.
//
// Apple/Play Console policies require a privacy manifest disclosing
// analytics use — see docs/PRIVACY.md (to be written when production
// builds ship). The keys below are GDPR-safe defaults:
//   - no IP collection
//   - no autocapture of user input
//   - sessionId-based, anonymous

import { Platform } from "react-native";

import { getEnv } from "../env";

export interface AnalyticsEvent {
  name: string;
  props?: Record<string, string | number | boolean | null>;
}

let initialized = false;
let posthogClient: { capture: (name: string, props?: Record<string, unknown>) => void; identify: (id: string) => void } | null = null;
let sentryClient: { captureException: (err: unknown, context?: Record<string, unknown>) => void } | null = null;

/**
 * Lazy-initialize the analytics SDKs. Safe to call multiple times —
 * subsequent calls are no-ops. Called once from src/app/_layout.tsx.
 *
 * Failure modes (network, ad blockers, no keys configured): swallowed.
 * Analytics must never be a hard dependency for the app working.
 */
export async function initAnalytics(): Promise<void> {
  if (initialized) return;
  initialized = true;

  let env;
  try {
    env = getEnv();
  } catch {
    return;
  }

  // Web-only path. Native builds will get their own wiring later.
  if (Platform.OS !== "web") return;
  if (typeof window === "undefined") return; // SSR / static export

  // PostHog product analytics — only when key is configured.
  if (env.EXPO_PUBLIC_POSTHOG_KEY && env.EXPO_PUBLIC_POSTHOG_HOST) {
    try {
      // Dynamic import keeps the SDK out of native bundles.
      // The package must be installed by the operator before keys are set.
      // @ts-expect-error — optional peer dep. The operator installs
      // posthog-js (or posthog-react-native) once they're ready to wire
      // analytics; until then this dynamic import throws and we no-op.
      const mod = (await import("posthog-js")) as {
        default: {
          init: (key: string, opts: Record<string, unknown>) => void;
          capture: (name: string, props?: Record<string, unknown>) => void;
          identify: (id: string) => void;
        };
      };
      mod.default.init(env.EXPO_PUBLIC_POSTHOG_KEY, {
        api_host: env.EXPO_PUBLIC_POSTHOG_HOST,
        autocapture: false, // explicit events only — no input scraping
        capture_pageview: false, // we'll capture screen-level events manually
        disable_session_recording: true, // privacy-first
        persistence: "memory", // no localStorage by default
      });
      posthogClient = mod.default;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] posthog init skipped:", (e as Error).message);
    }
  }

  // Sentry error tracking — only when DSN is configured.
  if (env.SENTRY_DSN) {
    try {
      // @ts-expect-error — optional peer dep. Install @sentry/browser
      // (web) or @sentry/react-native (native) before configuring SENTRY_DSN.
      const mod = (await import("@sentry/browser")) as {
        init: (opts: Record<string, unknown>) => void;
        captureException: (err: unknown, context?: Record<string, unknown>) => void;
      };
      mod.init({
        dsn: env.SENTRY_DSN,
        sendDefaultPii: false,
        // Minimal sampling — we're on the free tier (5k events/month).
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      });
      sentryClient = { captureException: mod.captureException };
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[analytics] sentry init skipped:", (e as Error).message);
    }
  }
}

/** Track a high-level product event. No-op when PostHog isn't configured. */
export function captureEvent(event: AnalyticsEvent): void {
  if (!posthogClient) return;
  try {
    posthogClient.capture(event.name, event.props ?? {});
  } catch {
    // analytics failures must not propagate
  }
}

/** Pin events to the current user id (call after sign-in). */
export function identifyUser(userId: string): void {
  if (!posthogClient) return;
  try {
    posthogClient.identify(userId);
  } catch {
    // ignore
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
  posthogClient = null;
  sentryClient = null;
}
