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
});
