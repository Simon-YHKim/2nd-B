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
  identifyUser,
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
} from "../index";

const ROOT = resolve(__dirname, "../../../..");

describe("analytics — no-op when no keys configured", () => {
  beforeEach(() => {
    __resetAnalytics();
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
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = originalDocument;
    jest.dontMock("react-native");
    jest.dontMock("../../env");
    jest.dontMock("../../supabase/client");
    jest.resetModules();
  });

  function loadWebModule(rowsRef: {
    current: Array<{ key: string; enabled: boolean }>;
  }): {
    analytics: typeof import("../index");
    dataLayer: unknown[];
    appendChild: jest.Mock;
  } {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "web" } }));
    jest.doMock("../../env", () => ({
      getEnv: () => ({
        EXPO_PUBLIC_GA4_MEASUREMENT_ID: "G-TEST",
        EXPO_PUBLIC_CLARITY_PROJECT_ID: "clarity-test",
      }),
    }));
    jest.doMock("../../supabase/client", () => ({
      getSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            in: () => Promise.resolve({ data: rowsRef.current, error: null }),
          }),
        }),
      }),
    }));

    const dataLayer: unknown[] = [];
    const appendChild = jest.fn();
    (globalThis as { window?: unknown }).window = {
      dataLayer,
      clarity: jest.fn(),
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
    analytics.__resetAnalytics();
  });

  test("consent-time events queue until a newly enabled runtime gate loads SDKs", async () => {
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: false },
        { key: "clarity_enabled", enabled: false },
      ],
    };
    const { analytics, dataLayer } = loadWebModule(rows);
    await analytics.initAnalytics();
    rows.current = [
      { key: "analytics_enabled", enabled: true },
      { key: "clarity_enabled", enabled: true },
    ];

    analytics.setAnalyticsConsent(true, {
      isMinor: false,
      confirmedAdult: true,
    });
    expect(analytics.captureEvent(analytics.pageView({ path: "/record/private-id" }))).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(
      dataLayer.some(
        (entry) =>
          Array.isArray(entry) &&
          entry[0] === "event" &&
          entry[1] === "page_view" &&
          (entry[2] as { path?: string }).path === "/record/private-id",
      ),
    ).toBe(true);
    analytics.__resetAnalytics();
  });

  test("events queued during an enabled flag refresh flush after the gate stays enabled", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    const rows = {
      current: [
        { key: "analytics_enabled", enabled: true },
        { key: "clarity_enabled", enabled: true },
      ],
    };
    const { analytics, dataLayer } = loadWebModule(rows);
    try {
      await analytics.initAnalytics({
        analyticsConsent: true,
        isMinor: false,
        confirmedAdult: true,
      });
      now.mockReturnValue(61_001);

      expect(analytics.captureEvent(analytics.pageView({ path: "/capture" }))).toBe(true);
      expect(analytics.captureEvent(analytics.pageView({ path: "/settings" }))).toBe(true);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));

      const pageViews = dataLayer.filter(
        (entry) => Array.isArray(entry) && entry[0] === "event" && entry[1] === "page_view",
      ) as Array<[string, string, { page_location?: string; path?: string }]>;
      expect(pageViews.map((entry) => entry[2].path)).toEqual(["/capture", "/settings"]);
      expect(pageViews.map((entry) => entry[2].page_location)).toEqual([
        "https://example.test/2nd-B/capture",
        "https://example.test/2nd-B/settings",
      ]);
    } finally {
      now.mockRestore();
      analytics.__resetAnalytics();
    }
  });
});
