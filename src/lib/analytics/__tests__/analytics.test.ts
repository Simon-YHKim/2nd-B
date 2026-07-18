// Smoke tests for the analytics abstraction. SDK loading is gated by web
// platform checks, env ids, runtime flags, and consent, so the default test path should be a
// no-op without throwing.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildAnalyticsPageLocation,
  canLoadProductAnalytics,
  cleanAnalyticsEventProps,
  capture,
  captureEvent,
  captureException,
  getAnalyticsConsentRevision,
  hasNativeFirebaseAnalyticsModule,
  identifyUser,
  isClarityAllowedRoute,
  initAnalytics,
  pageView,
  secondBSession,
  setAnalyticsConsent,
  starLit,
  activationMilestone,
  aiLimitHit,
  plansViewed,
  plansTierFocused,
  checkoutStarted,
  purchase,
  resolveAnalyticsRuntimeFlags,
  sanitizeAnalyticsRoutePath,
  scrubSentryEvent,
  __resetAnalytics,
  __setNativeAnalyticsApplierForTests,
  __flushNativeAnalyticsForTests,
  __setRuntimeAnalyticsFlagsForTests,
} from "../index";

const ROOT = resolve(__dirname, "../../../..");

describe("analytics — no-op when no keys configured", () => {
  beforeEach(() => {
    __resetAnalytics();
    // Keep these web-focused tests hermetic: the native sync fires on every
    // consent call (jest Platform.OS is "ios"), so park it on a no-op applier
    // instead of letting it attempt the real Firebase dynamic import.
    __setNativeAnalyticsApplierForTests(async () => {});
  });

  test("initAnalytics() resolves without throwing when keys absent", async () => {
    await expect(initAnalytics()).resolves.toBeUndefined();
  });

  test("captureEvent is silent when not initialized", () => {
    expect(() => captureEvent(pageView({ path: "/test" }))).not.toThrow();
  });

  test("identifyUser is silent when not initialized", () => {
    expect(() => identifyUser("u1")).not.toThrow();
  });

  test("captureException falls back to console", () => {
    const err = new Error("test");
    const warn = jest.spyOn(console, "error").mockImplementation(() => {});
    captureException(err, { source: "test" });
    expect(warn).toHaveBeenCalledWith("[exception]", err, { source: "test" });
    warn.mockRestore();
  });

  test("initAnalytics() is idempotent", async () => {
    await initAnalytics();
    await initAnalytics();
    // No throw == pass; second call should short-circuit on the
    // `initialized` flag rather than re-running the platform check.
  });

  test("setAnalyticsConsent is silent off-web and never loads SDKs without keys", () => {
    expect(() => setAnalyticsConsent(true)).not.toThrow();
    // product analytics stay no-ops (off-web in jest, and no keys configured)
    expect(() => captureEvent(capture({ action: "saved", mode: "memo" }))).not.toThrow();
    expect(() => identifyUser("u2")).not.toThrow();
    expect(() => setAnalyticsConsent(false)).not.toThrow();
  });

  test("taxonomy helpers emit the three canonical event names", () => {
    expect(pageView({ path: "/capture", locale: "ko" }).name).toBe("page_view");
    expect(capture({ action: "started", mode: "link" }).name).toBe("capture");
    expect(secondBSession({ action: "message_sent", mode: "chat", turn_count: 1 }).name).toBe(
      "secondb_session",
    );
  });

  test("PIPA/C10 gate requires confirmed adult age and explicit consent", () => {
    expect(canLoadProductAnalytics(true)).toBe(false);
    expect(canLoadProductAnalytics(false)).toBe(false);
    expect(canLoadProductAnalytics(true, { isMinor: null })).toBe(false);
    expect(canLoadProductAnalytics(true, { isMinor: true })).toBe(false);
    expect(canLoadProductAnalytics(true, { isMinor: false })).toBe(false);
    expect(canLoadProductAnalytics(true, { isMinor: false, confirmedAdult: true })).toBe(true);
    expect(
      canLoadProductAnalytics(true, {
        isMinor: false,
        confirmedAdult: true,
        underDigitalConsentAge: true,
      }),
    ).toBe(false);
    expect(() =>
      setAnalyticsConsent(true, {
        isMinor: false,
        confirmedAdult: true,
        underDigitalConsentAge: true,
      }),
    ).not.toThrow();
  });

  test("runtime analytics flags fail closed for missing or malformed rows", () => {
    expect(resolveAnalyticsRuntimeFlags(undefined)).toEqual({
      analyticsEnabled: false,
      clarityEnabled: false,
    });
    expect(
      resolveAnalyticsRuntimeFlags([
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: true },
      ]),
    ).toEqual({
      analyticsEnabled: true,
      clarityEnabled: true,
    });
    expect(
      resolveAnalyticsRuntimeFlags([
        { key: "analytics_enabled", enabled: "true" },
        { key: "clarity_enabled", enabled: true },
      ]),
    ).toEqual({
      analyticsEnabled: false,
      clarityEnabled: false,
    });
  });

  test("Clarity route allow-list: identifier and writing surfaces stay out by construction", () => {
    expect(isClarityAllowedRoute("/")).toBe(true);
    expect(isClarityAllowedRoute("/plans")).toBe(true);
    expect(isClarityAllowedRoute("/settings/language")).toBe(true);
    expect(isClarityAllowedRoute("/sign-in")).toBe(true);
    expect(isClarityAllowedRoute("/onboarding")).toBe(true);
    // "/" is an exact match, never a match-everything prefix.
    expect(isClarityAllowedRoute("/record/abc")).toBe(false);
    expect(isClarityAllowedRoute("/record/9c820f74-17a2-4d0a-9a6e-234b86a6c120")).toBe(false);
    expect(isClarityAllowedRoute("/peer/abcdefghijklmnopqrstuvwxyz012345")).toBe(false);
    expect(isClarityAllowedRoute("/secondb")).toBe(false);
    expect(isClarityAllowedRoute("/capture")).toBe(false);
    expect(isClarityAllowedRoute("/journal")).toBe(false);
    // Query/hash data never widens the decision (sanitized first).
    expect(isClarityAllowedRoute("/plans?from=ai_limit#top")).toBe(true);
    expect(isClarityAllowedRoute("/record/abc?share=1")).toBe(false);
  });

  test("a stale server consent read cannot overwrite a newer privacy action", () => {
    const serverReadRevision = getAnalyticsConsentRevision();
    expect(setAnalyticsConsent(false, { isMinor: false, confirmedAdult: true })).toBe(true);
    expect(
      setAnalyticsConsent(
        true,
        { isMinor: false, confirmedAdult: true },
        { expectedRevision: serverReadRevision },
      ),
    ).toBe(false);
  });

  test("analytics page locations never include live ids, tokens, queries, or hashes", () => {
    const uuid = "9c820f74-17a2-4d0a-9a6e-234b86a6c120";
    expect(sanitizeAnalyticsRoutePath(`/record/${uuid}?email=private@example.com#detail`)).toBe(
      "/record/[id]",
    );
    expect(sanitizeAnalyticsRoutePath("/peer/abcdefghijklmnopqrstuvwxyz012345")).toBe(
      "/peer/[token]",
    );
    expect(buildAnalyticsPageLocation("/record/[id]", "https://simon-yhkim.github.io/")).toBe(
      "https://simon-yhkim.github.io/2nd-B/record/[id]",
    );
    expect(
      cleanAnalyticsEventProps(
        pageView({
          path: `/record/${uuid}?email=private@example.com`,
          title: "private record title",
        }),
      ),
    ).toEqual({ path: "/record/[id]" });
  });

  test("Sentry events redact live URLs, request material, and navigation breadcrumbs", () => {
    const scrubbed = scrubSentryEvent(
      {
        request: {
          url: "https://example.test/record/private?email=private@example.com",
          headers: { referer: "private" },
          cookies: "private",
          data: "private",
          query_string: "private",
        },
        breadcrumbs: [
          {
            category: "navigation",
            message: "https://example.test/peer/private-token",
            data: { from: "/record/private", to: "/peer/private" },
          },
        ],
      },
      "/record/[id]",
      "https://simon-yhkim.github.io",
    );
    expect(scrubbed.request).toEqual({
      url: "https://simon-yhkim.github.io/2nd-B/record/[id]",
    });
    expect(scrubbed.transaction).toBe("/record/[id]");
    expect(scrubbed.breadcrumbs?.[0]).toMatchObject({
      message: "[redacted]",
      data: { from: "[redacted]", to: "[redacted]" },
    });
  });

  test("conversion-funnel creators emit their canonical event names", () => {
    expect(starLit({ star_id: "now", ladder_level: 3, source: "journal" }).name).toBe("star_lit");
    expect(activationMilestone({ stars_lit_count: 7, soul_core_brightness: 0.8 }).name).toBe(
      "activation_milestone",
    );
    expect(aiLimitHit({ tier: "free", limit: 2 }).name).toBe("ai_limit_hit");
    expect(plansViewed({ current_tier: "free", source: "ai_limit" }).name).toBe("plans_viewed");
    expect(plansTierFocused({ tier: "soma" }).name).toBe("plans_tier_focused");
    expect(checkoutStarted({ tier: "soma" }).name).toBe("checkout_started");
    expect(purchase({ tier: "soma", period: "month" }).name).toBe("purchase");
  });

  test("funnel events never throw without consent and stay no-ops", () => {
    // Default test path: off-web, no keys, no consent. captureEvent must be a
    // silent no-op for every new funnel event.
    expect(() => captureEvent(starLit({ star_id: "values", ladder_level: 2, source: "esm" }))).not.toThrow();
    expect(() =>
      captureEvent(activationMilestone({ stars_lit_count: 3, soul_core_brightness: 0.42 })),
    ).not.toThrow();
    expect(() => captureEvent(aiLimitHit({ tier: "soma", limit: 30, upgrade_to: "cortex" }))).not.toThrow();
    expect(() =>
      captureEvent(plansViewed({ current_tier: "free", source: "advisor_lock", locale: "ko" })),
    ).not.toThrow();
    expect(() => captureEvent(plansTierFocused({ tier: "soma", price: 4900, currency: "KRW" }))).not.toThrow();
  });

  test("C10: a minor's revoked consent emits nothing for funnel events", () => {
    // canLoadProductAnalytics(false) for a minor -> setAnalyticsConsent stays
    // denied -> captureEvent must not reach any SDK (none loaded anyway).
    expect(canLoadProductAnalytics(true, { isMinor: true, confirmedAdult: false })).toBe(false);
    setAnalyticsConsent(true, { isMinor: true });
    expect(() => captureEvent(starLit({ star_id: "now", ladder_level: 4, source: "questionnaire" }))).not.toThrow();
    expect(() => captureEvent(aiLimitHit({ tier: "free", limit: 2 }))).not.toThrow();
  });

  test("secondb_session funnel props are scalar-only (no PII / nested objects)", () => {
    const evt = secondBSession({
      action: "message_sent",
      mode: "analytic",
      outcome: "ok",
      turn_count: 3,
      used: 1,
      limit: 2,
      tier: "free",
    });
    expect(evt.name).toBe("secondb_session");
    for (const value of Object.values(evt.props)) {
      const t = typeof value;
      expect(t === "string" || t === "number" || t === "boolean").toBe(true);
    }
  });
});

// Native Firebase Analytics gate (Android builds; jest's react-native mock
// reports Platform.OS "ios" = non-web, so the native sync path runs here).
// Collection may turn ON only for a server-confirmed adult with the
// external_analytics pref granted; every other state applies OFF.
describe("native Firebase Analytics collection gate", () => {
  const applied: boolean[] = [];

  beforeEach(() => {
    __resetAnalytics();
    applied.length = 0;
    __setNativeAnalyticsApplierForTests(async (enabled) => {
      applied.push(enabled);
    });
    // Default the #1054 runtime kill-switch to ON so the consent/age matrix
    // below tests exactly one variable; the kill-switch cases pin it OFF.
    __setRuntimeAnalyticsFlagsForTests({ analyticsEnabled: true, clarityEnabled: false });
  });

  afterEach(() => {
    __setNativeAnalyticsApplierForTests(null);
    __setRuntimeAnalyticsFlagsForTests(null);
  });

  test("old OTA binaries without RNFirebase fail closed before importing the SDK", () => {
    expect(hasNativeFirebaseAnalyticsModule(() => null)).toBe(false);
    expect(
      hasNativeFirebaseAnalyticsModule(() => {
        throw new Error("native module registry unavailable");
      }),
    ).toBe(false);
  });

  test("rebuilt binaries expose the linked analytics module", () => {
    const lookup = jest.fn((name: string) =>
      name === "RNFBAnalyticsModule" ? {} : null,
    );
    expect(hasNativeFirebaseAnalyticsModule(lookup)).toBe(true);
    expect(lookup).toHaveBeenCalledWith("RNFBAnalyticsModule");
  });

  test("boot with no opts asserts OFF (fail-closed default)", async () => {
    await initAnalytics();
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("server-confirmed adult with granted pref turns collection ON", async () => {
    setAnalyticsConsent(true, { isMinor: false, confirmedAdult: true });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([true]);
  });

  test("14-17 minor stays OFF even with a granted pref", async () => {
    setAnalyticsConsent(true, { isMinor: true, confirmedAdult: false });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("unresolved age stays OFF (no confirmedAdult)", async () => {
    setAnalyticsConsent(true, { isMinor: null });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("under digital-consent age stays OFF even when marked adult", async () => {
    setAnalyticsConsent(true, {
      isMinor: false,
      confirmedAdult: true,
      underDigitalConsentAge: true,
    });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("revoke after grant applies OFF immediately (no reload needed)", async () => {
    setAnalyticsConsent(true, { isMinor: false, confirmedAdult: true });
    setAnalyticsConsent(false, { isMinor: false, confirmedAdult: true });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([true, false]);
  });

  test("repeated same-state syncs are deduped to one native apply", async () => {
    await initAnalytics();
    setAnalyticsConsent(false, { isMinor: true, confirmedAdult: false });
    setAnalyticsConsent(true, { isMinor: null });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("a stale server read cannot enable native collection (revision guard)", async () => {
    await initAnalytics();
    const staleRevision = getAnalyticsConsentRevision();
    setAnalyticsConsent(false, { isMinor: true, confirmedAdult: false });
    setAnalyticsConsent(
      true,
      { isMinor: false, confirmedAdult: true },
      { expectedRevision: staleRevision },
    );
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("a rejecting native applier never throws and the queue stays alive", async () => {
    __setNativeAnalyticsApplierForTests(() => Promise.reject(new Error("native module missing")));
    expect(() => setAnalyticsConsent(true, { isMinor: false, confirmedAdult: true })).not.toThrow();
    await __flushNativeAnalyticsForTests();
    __setNativeAnalyticsApplierForTests(async (enabled) => {
      applied.push(enabled);
    });
    setAnalyticsConsent(false, { isMinor: false, confirmedAdult: true });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("runtime kill-switch OFF blocks a native enable for a consenting adult", async () => {
    __setRuntimeAnalyticsFlagsForTests({ analyticsEnabled: false, clarityEnabled: false });
    setAnalyticsConsent(true, { isMinor: false, confirmedAdult: true });
    await __flushNativeAnalyticsForTests();
    expect(applied).toEqual([false]);
  });

  test("unavailable runtime flags fail closed for a native enable", async () => {
    // Live path (no seam): the runtime_flags source is unreachable, so the
    // fetch resolves to the OFF defaults and the enable must not go through.
    // Isolated module registry with supabase mocked to throw - constructing
    // the real client in the node test env leaks an AsyncStorage rejection.
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "ios" } }));
    jest.doMock("../../supabase/client", () => ({
      getSupabaseClient: () => {
        throw new Error("no runtime flags source");
      },
    }));
    try {
      const analytics = require("../index") as typeof import("../index");
      const localApplied: boolean[] = [];
      analytics.__setNativeAnalyticsApplierForTests(async (enabled) => {
        localApplied.push(enabled);
      });
      analytics.setAnalyticsConsent(true, { isMinor: false, confirmedAdult: true });
      await analytics.__flushNativeAnalyticsForTests();
      expect(localApplied).toEqual([false]);
      analytics.__resetAnalytics();
    } finally {
      jest.dontMock("react-native");
      jest.dontMock("../../supabase/client");
      jest.resetModules();
    }
  });
});

describe("runtime operations config", () => {
  const migration = readFileSync(
    resolve(ROOT, "db/migrations/0092_runtime_flags.sql"),
    "utf8",
  );

  test("runtime flags are public-read-only and AI egress is server-gated", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.runtime_flags/i);
    expect(migration).toMatch(/ALTER TABLE public\.runtime_flags ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.runtime_flags TO anon, authenticated/i);
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.runtime_flags TO service_role/i,
    );
    expect(migration).not.toMatch(
      /CREATE POLICY[\s\S]*?FOR (?:INSERT|UPDATE|DELETE) TO (?:anon|authenticated)/i,
    );
    expect(migration).toMatch(/WHERE key = 'llm_enabled'/i);
    expect(migration).toMatch(/RAISE EXCEPTION 'llm_runtime_disabled'/i);
  });

  test("release profiles contain no committed analytics identifiers or CI fallbacks", () => {
    const eas = JSON.parse(readFileSync(resolve(ROOT, "eas.json"), "utf8")) as {
      build: Record<string, { environment?: string; env?: Record<string, string> }>;
    };
    const androidWorkflow = readFileSync(
      resolve(ROOT, ".github/workflows/android-release.yml"),
      "utf8",
    );
    const keys = [
      "EXPO_PUBLIC_SENTRY_DSN",
      "EXPO_PUBLIC_GA4_MEASUREMENT_ID",
      "EXPO_PUBLIC_CLARITY_PROJECT_ID",
      "EXPO_PUBLIC_POSTHOG_KEY",
      "EXPO_PUBLIC_POSTHOG_HOST",
    ];

    expect(eas.build.preview.environment).toBe("preview");
    expect(eas.build.production.environment).toBe("production");
    for (const profile of ["preview", "production"]) {
      expect(eas.build[profile].env?.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION).toBe("true");
      for (const key of keys) expect(eas.build[profile].env).not.toHaveProperty(key);
    }
    expect(androidWorkflow).toMatch(/EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION:\s*"true"/);
    for (const key of keys) {
      expect(androidWorkflow).toContain(`${key}: \${{ vars.${key} }}`);
      expect(androidWorkflow).not.toMatch(new RegExp(`^\\s+${key}:.*\\|\\|`, "m"));
    }
  });
});

describe("runtime analytics web transitions", () => {
  type RuntimeFlagRow = { key: string; enabled: boolean };
  type RuntimeFlagResponse = {
    data: RuntimeFlagRow[] | null;
    error: { message: string } | null;
  };
  type PostHogMock = {
    init: jest.Mock;
    capture: jest.Mock;
    identify: jest.Mock;
  };

  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = originalDocument;
    jest.dontMock("react-native");
    jest.dontMock("../../env");
    jest.dontMock("../../supabase/client");
    jest.resetModules();
  });

  async function flushAsyncWork(turns = 12): Promise<void> {
    for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
  }

  // gtag command tuples are `arguments` objects, NOT arrays - gtag.js silently
  // drops array-shaped commands (the 2026-07-18 P0 no-collect defect). Typed
  // as unknown[] purely so positional reads/casts below stay unchanged; the
  // dedicated regression test asserts the runtime shape is not an Array.
  function isGtagCommand(entry: unknown): entry is unknown[] {
    return (
      typeof entry === "object" &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof (entry as { length?: unknown }).length === "number"
    );
  }

  function loadWebModule(
    rowsRef: { current: RuntimeFlagRow[] },
    queryFlags?: () => Promise<RuntimeFlagResponse>,
    posthogClient?: PostHogMock,
  ): {
    analytics: typeof import("../index");
    dataLayer: unknown[];
    appendChild: jest.Mock;
    clarity: jest.Mock;
    fetchFlags: jest.Mock;
  } {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
    jest.doMock("../../env", () => ({
      getEnv: () => ({
        EXPO_PUBLIC_GA4_MEASUREMENT_ID: "G-TEST",
        EXPO_PUBLIC_CLARITY_PROJECT_ID: "clarity-test",
        ...(posthogClient
          ? {
              EXPO_PUBLIC_POSTHOG_KEY: "ph-test",
              EXPO_PUBLIC_POSTHOG_HOST: "https://posthog.test",
            }
          : {}),
      }),
    }));
    if (posthogClient) {
      jest.doMock(
        "posthog-js",
        () => ({
          __esModule: true,
          default: posthogClient,
        }),
        { virtual: true },
      );
    }
    const fetchFlags = jest.fn(
      queryFlags ??
        (() =>
          Promise.resolve({
            data: rowsRef.current,
            error: null,
          })),
    );
    jest.doMock("../../supabase/client", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            in: fetchFlags,
          }),
        }),
      }),
    }));

    const dataLayer: unknown[] = [];
    const appendChild = jest.fn();
    const clarity = jest.fn();
    (globalThis as { window?: unknown }).window = {
      dataLayer,
      clarity,
      location: { origin: "https://example.test" },
      localStorage: { getItem: jest.fn(), setItem: jest.fn() },
    };
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ async: false, src: "" }),
      documentElement: { setAttribute: jest.fn() },
      getElementsByTagName: () => [],
      head: { appendChild },
    };
    return {
      analytics: require("../index") as typeof import("../index"),
      dataLayer,
      appendChild,
      clarity,
      fetchFlags,
    };
  }

  test("runtime OFF blocks product SDK loading even for a consenting adult", async () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: false },
        { key: "clarity_enabled", enabled: false },
      ],
    };
    const { analytics, appendChild } = loadWebModule(rows);
    await analytics.initAnalytics({
      analyticsConsent: true,
      isMinor: false,
      confirmedAdult: true,
    });
    expect(appendChild).not.toHaveBeenCalled();
    expect(analytics.captureEvent(analytics.pageView({ path: "/capture" }))).toBe(false);
    expect(jest.getTimerCount()).toBe(1);
    analytics.__resetAnalytics();
  });

  test("overlapping init and consent use one async PostHog init and flush the page once", async () => {
    const enabledRows: RuntimeFlagRow[] = [
      { key: "analytics_enabled", enabled: true },
      { key: "clarity_enabled", enabled: true },
    ];
    const rows = {
      current: enabledRows,
    };
    let resolveFlags: ((response: RuntimeFlagResponse) => void) | undefined;
    const queryFlags = () =>
      new Promise<RuntimeFlagResponse>((resolve) => {
        resolveFlags = resolve;
      });
    const posthog = {
      init: jest.fn(),
      capture: jest.fn(),
      identify: jest.fn(),
    };
    const { analytics, appendChild, dataLayer, fetchFlags } = loadWebModule(
      rows,
      queryFlags,
      posthog,
    );

    const init = analytics.initAnalytics();
    analytics.setAnalyticsConsent(true, {
      isMinor: false,
      confirmedAdult: true,
    });
    expect(
      analytics.captureEvent(
        analytics.pageView({ path: "/record/9c820f74-17a2-4d0a-9a6e-234b86a6c120" }),
      ),
    ).toBe(true);
    expect(fetchFlags).toHaveBeenCalledTimes(1);

    resolveFlags?.({ data: enabledRows, error: null });
    await init;
    await flushAsyncWork();

    const scriptSources = appendChild.mock.calls.map(
      ([script]) => (script as { src?: string }).src,
    );
    expect(scriptSources.filter((src) => src?.includes("googletagmanager.com"))).toHaveLength(1);
    // The session sits on /record/[id] when the load runs, so the Clarity
    // route allow-list withholds injection (GA4/PostHog are unaffected).
    expect(scriptSources.filter((src) => src?.includes("clarity.ms"))).toHaveLength(0);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith(
      "ph-test",
      expect.objectContaining({
        api_host: "https://posthog.test",
        autocapture: false,
        capture_pageview: false,
      }),
    );
    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith("page_view", { path: "/record/[id]" });
    const pageViews = dataLayer.filter(
      (entry) => isGtagCommand(entry) && entry[0] === "event" && entry[1] === "page_view",
    ) as Array<[string, string, { path?: string }]>;
    expect(pageViews.map((entry) => entry[2].path)).toEqual(["/record/[id]"]);
    analytics.__resetAnalytics();
  });

  test("an unchanged ON poll flushes two queued page routes exactly once each", async () => {
    const enabledRows: RuntimeFlagRow[] = [
      { key: "analytics_enabled", enabled: true },
      { key: "clarity_enabled", enabled: true },
    ];
    const rows = { current: enabledRows };
    let requestCount = 0;
    let resolvePoll: ((response: RuntimeFlagResponse) => void) | undefined;
    const queryFlags = () => {
      requestCount += 1;
      if (requestCount === 2) {
        return new Promise<RuntimeFlagResponse>((resolve) => {
          resolvePoll = resolve;
        });
      }
      return Promise.resolve({ data: enabledRows, error: null });
    };
    const { analytics, dataLayer, fetchFlags } = loadWebModule(rows, queryFlags);
    try {
      await analytics.initAnalytics({
        analyticsConsent: true,
        isMinor: false,
        confirmedAdult: true,
      });

      await jest.advanceTimersByTimeAsync(60_000);
      expect(fetchFlags).toHaveBeenCalledTimes(2);
      expect(
        analytics.captureEvent(
          analytics.pageView({ path: "/record/9c820f74-17a2-4d0a-9a6e-234b86a6c120" }),
        ),
      ).toBe(true);
      expect(
        analytics.captureEvent(
          analytics.pageView({ path: "/peer/abcdefghijklmnopqrstuvwxyz012345" }),
        ),
      ).toBe(true);
      expect(
        dataLayer.filter(
          (entry) => isGtagCommand(entry) && entry[0] === "event" && entry[1] === "page_view",
        ),
      ).toHaveLength(0);

      resolvePoll?.({ data: enabledRows, error: null });
      await flushAsyncWork();

      const pageViews = dataLayer.filter(
        (entry) => isGtagCommand(entry) && entry[0] === "event" && entry[1] === "page_view",
      ) as Array<[string, string, { page_location?: string; path?: string }]>;
      expect(
        pageViews.map((entry) => ({
          path: entry[2].path,
          page_location: entry[2].page_location,
        })),
      ).toEqual([
        {
          path: "/record/[id]",
          page_location: "https://example.test/2nd-B/record/[id]",
        },
        {
          path: "/peer/[token]",
          page_location: "https://example.test/2nd-B/peer/[token]",
        },
      ]);
      expect(fetchFlags).toHaveBeenCalledTimes(2);
    } finally {
      analytics.__resetAnalytics();
    }
  });

  test("60-second polling keeps running while OFF and restores GA and Clarity", async () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: false },
        { key: "clarity_enabled", enabled: false },
      ],
    };
    const { analytics, appendChild, clarity, dataLayer, fetchFlags } = loadWebModule(rows);
    try {
      await analytics.initAnalytics({
        analyticsConsent: true,
        isMinor: false,
        confirmedAdult: true,
      });
      expect(fetchFlags).toHaveBeenCalledTimes(1);
      expect(appendChild).not.toHaveBeenCalled();

      rows.current = [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: true },
      ];
      await jest.advanceTimersByTimeAsync(60_000);
      await flushAsyncWork();
      expect(fetchFlags).toHaveBeenCalledTimes(2);
      expect(appendChild).toHaveBeenCalledTimes(2);

      rows.current = [
        { key: "analytics_enabled", enabled: false },
        { key: "clarity_enabled", enabled: false },
      ];
      await jest.advanceTimersByTimeAsync(60_000);
      await flushAsyncWork();
      expect(fetchFlags).toHaveBeenCalledTimes(3);
      expect(analytics.captureEvent(analytics.pageView({ path: "/blocked" }))).toBe(false);

      rows.current = [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: true },
      ];
      await jest.advanceTimersByTimeAsync(60_000);
      await flushAsyncWork();
      expect(fetchFlags).toHaveBeenCalledTimes(4);
      expect(appendChild).toHaveBeenCalledTimes(2);
      expect(analytics.captureEvent(analytics.pageView({ path: "/restored" }))).toBe(true);

      const gaConsentStates = dataLayer
        .filter((entry) => isGtagCommand(entry) && entry[0] === "consent")
        .map((entry) => (entry as [string, string, { analytics_storage: string }])[2].analytics_storage);
      expect(gaConsentStates).toEqual(["granted", "denied", "granted"]);
      const clarityConsentStates = clarity.mock.calls
        .filter(([command]) => command === "consentv2")
        .map(([, state]) => (state as { analytics_Storage: string }).analytics_Storage);
      expect(clarityConsentStates).toEqual(["granted", "denied", "granted"]);
      expect(jest.getTimerCount()).toBe(1);
    } finally {
      analytics.__resetAnalytics();
    }
  });

  test("a 5-second flag timeout fails closed and the next poll can recover", async () => {
    const enabledRows: RuntimeFlagRow[] = [
      { key: "analytics_enabled", enabled: true },
      { key: "clarity_enabled", enabled: true },
    ];
    const rows = { current: enabledRows };
    let requestCount = 0;
    const queryFlags = () => {
      requestCount += 1;
      if (requestCount === 2) return new Promise<RuntimeFlagResponse>(() => {});
      return Promise.resolve({ data: enabledRows, error: null });
    };
    const { analytics, dataLayer, fetchFlags } = loadWebModule(rows, queryFlags);
    try {
      await analytics.initAnalytics({
        analyticsConsent: true,
        isMinor: false,
        confirmedAdult: true,
      });

      await jest.advanceTimersByTimeAsync(60_000);
      expect(fetchFlags).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(4_999);
      expect(
        dataLayer.some(
          (entry) =>
            isGtagCommand(entry) &&
            entry[0] === "consent" &&
            (entry[2] as { analytics_storage?: string }).analytics_storage === "denied",
        ),
      ).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      await flushAsyncWork();
      expect(
        dataLayer.some(
          (entry) =>
            isGtagCommand(entry) &&
            entry[0] === "consent" &&
            (entry[2] as { analytics_storage?: string }).analytics_storage === "denied",
        ),
      ).toBe(true);
      expect(analytics.captureEvent(analytics.pageView({ path: "/timeout" }))).toBe(false);

      await jest.advanceTimersByTimeAsync(60_000);
      await flushAsyncWork();
      expect(fetchFlags).toHaveBeenCalledTimes(3);
      expect(analytics.captureEvent(analytics.pageView({ path: "/recovered" }))).toBe(true);
      const gaConsentStates = dataLayer
        .filter((entry) => isGtagCommand(entry) && entry[0] === "consent")
        .map((entry) => (entry as [string, string, { analytics_storage: string }])[2].analytics_storage);
      expect(gaConsentStates).toEqual(["granted", "denied", "granted"]);
    } finally {
      analytics.__resetAnalytics();
    }
  });

  test("gtag commands are arguments objects, not arrays (P0 2026-07-18: gtag.js drops arrays)", async () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: false },
      ],
    };
    const { analytics, dataLayer } = loadWebModule(rows);
    await analytics.initAnalytics({ analyticsConsent: true, isMinor: false, confirmedAdult: true });
    await flushAsyncWork();
    expect(analytics.captureEvent(analytics.pageView({ path: "/capture" }))).toBe(true);
    // js + consent default + config, then the page_view event.
    expect(dataLayer.length).toBeGreaterThanOrEqual(4);
    for (const entry of dataLayer) {
      // The exact defect shape: an Array-pushed command is silently ignored by
      // gtag.js, so nothing may ever push arrays again.
      expect(Array.isArray(entry)).toBe(false);
      expect(isGtagCommand(entry)).toBe(true);
    }
    const commands = dataLayer.filter(isGtagCommand).map((entry) => entry[0]);
    expect(commands).toContain("config");
    expect(commands).toContain("event");
    analytics.__resetAnalytics();
  });

  test("Clarity injects only on allow-listed routes and retries on the first allowed page_view", async () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: true },
      ],
    };
    const { analytics, appendChild, clarity } = loadWebModule(rows);
    // Land on an identifier route BEFORE consent resolves.
    analytics.captureEvent(
      analytics.pageView({ path: "/record/9c820f74-17a2-4d0a-9a6e-234b86a6c120" }),
    );
    await analytics.initAnalytics({ analyticsConsent: true, isMinor: false, confirmedAdult: true });
    await flushAsyncWork();
    // GA4 injected; Clarity withheld because the session sits on /record/[id].
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(clarity).not.toHaveBeenCalled();
    // The first page_view on an allow-listed route performs the lazy injection.
    analytics.captureEvent(analytics.pageView({ path: "/plans" }));
    await flushAsyncWork();
    expect(appendChild).toHaveBeenCalledTimes(2);
    expect(clarity.mock.calls.some(([command]) => command === "consentv2")).toBe(true);
    analytics.__resetAnalytics();
  });

  // Cookie purge on consent revoke. document.cookie never reveals a cookie's
  // domain/path, so the module expires every tracker name across host-only,
  // hostname, and dot-hostname variants at "/", the base path, and the base
  // path with a trailing slash.
  function stubCookieJar(): string[] {
    const writes: string[] = [];
    Object.defineProperty(globalThis.document, "cookie", {
      configurable: true,
      // The measured post-revoke jar from the 2026-07-18 production pass
      // (_clck + _ga + the full _ga_<CONTAINER> stream cookie), plus _clsk
      // for prefix coverage and a non-tracker control.
      get: () => "_clck=abc; _clsk=def; _ga=GA1.1.1; _ga_R6BK0F1RWE=stream; other=keep",
      set: (value: string) => {
        writes.push(value);
      },
    });
    (globalThis.window as { location?: { origin?: string; hostname?: string } }).location!.hostname =
      "example.test";
    return writes;
  }

  test("a real revoke expires _clck/_clsk/_ga* across domain and path variants", async () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: false },
      ],
    };
    const { analytics } = loadWebModule(rows);
    const writes = stubCookieJar();
    analytics.setAnalyticsConsent(true, { isMinor: false, confirmedAdult: true });
    await flushAsyncWork();
    analytics.setAnalyticsConsent(false, { isMinor: false, confirmedAdult: true });
    // 4 tracker names x 3 paths x 3 domain variants; "other" is untouched.
    expect(writes).toHaveLength(36);
    expect(writes).toContain("_clck=; Max-Age=0; path=/");
    expect(writes).toContain("_ga_R6BK0F1RWE=; Max-Age=0; path=/2nd-B; domain=.example.test");
    expect(writes).toContain("_clsk=; Max-Age=0; path=/2nd-B/; domain=example.test");
    expect(writes.some((entry) => entry.startsWith("other="))).toBe(false);
    analytics.__resetAnalytics();
  });

  test("the boot-time preemptive revoke never purges (no client-id churn for consented users)", () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: false },
      ],
    };
    const { analytics } = loadWebModule(rows);
    const writes = stubCookieJar();
    // The _layout guard fires this on every auth transition BEFORE the server
    // decision resolves - denied state, no prior grant, no expectedRevision.
    analytics.setAnalyticsConsent(false, { isMinor: true, confirmedAdult: false });
    expect(writes).toHaveLength(0);
    analytics.__resetAnalytics();
  });

  test("a server-resolved denial purges even without an in-session grant (cross-device revoke)", () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: false },
      ],
    };
    const { analytics } = loadWebModule(rows);
    const writes = stubCookieJar();
    analytics.setAnalyticsConsent(
      false,
      { isMinor: true, confirmedAdult: false },
      { expectedRevision: analytics.getAnalyticsConsentRevision() },
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes).toContain("_ga=; Max-Age=0; path=/");
    analytics.__resetAnalytics();
  });
});
