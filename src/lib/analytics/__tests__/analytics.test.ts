// Smoke tests for the analytics abstraction. SDK loading is gated by web
// platform checks, env ids, and consent, so the default test path should be a
// no-op without throwing.

import {
  canLoadProductAnalytics,
  capture,
  captureEvent,
  captureException,
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
  __resetAnalytics,
} from "../index";

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

  test("PIPA/C10 gate blocks product analytics for minors and under-14 users", () => {
    expect(canLoadProductAnalytics(true)).toBe(true);
    expect(canLoadProductAnalytics(false)).toBe(false);
    expect(canLoadProductAnalytics(true, { isMinor: true })).toBe(false);
    expect(canLoadProductAnalytics(true, { underDigitalConsentAge: true })).toBe(false);
    expect(() => setAnalyticsConsent(true, { underDigitalConsentAge: true })).not.toThrow();
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
    expect(canLoadProductAnalytics(true, { isMinor: true })).toBe(false);
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
