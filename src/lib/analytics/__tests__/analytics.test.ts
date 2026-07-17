// Smoke tests for the analytics abstraction. SDK loading is gated by web
// platform checks, env ids, and consent, so the default test path should be a
// no-op without throwing.

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
  sanitizeAnalyticsRoutePath,
  scrubSentryEvent,
  __resetAnalytics,
  __setNativeAnalyticsApplierForTests,
  __flushNativeAnalyticsForTests,
} from "../index";

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
  });

  afterEach(() => {
    __setNativeAnalyticsApplierForTests(null);
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
});
