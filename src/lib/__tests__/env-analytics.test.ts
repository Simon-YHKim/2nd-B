// Regression guard for the 2026-06-11 live outage: the deploy workflow
// renders unset repo Variables as the EMPTY STRING, and a strict .url()
// check on EXPO_PUBLIC_POSTHOG_HOST threw at module init - every visitor
// got a dead black screen. Telemetry config must never brick the app.

import { normalizeAnalyticsUrl } from "../env";

describe("normalizeAnalyticsUrl (analytics endpoints never brick the app)", () => {
  test("empty, whitespace, and undefined turn analytics off instead of throwing", () => {
    expect(normalizeAnalyticsUrl("X", undefined)).toBeUndefined();
    expect(normalizeAnalyticsUrl("X", "")).toBeUndefined();
    expect(normalizeAnalyticsUrl("X", "   ")).toBeUndefined();
  });

  test("a valid https URL passes through untouched", () => {
    expect(normalizeAnalyticsUrl("X", "https://us.i.posthog.com")).toBe("https://us.i.posthog.com");
  });

  test("the common scheme-less paste form gets https:// assumed", () => {
    expect(normalizeAnalyticsUrl("X", "us.i.posthog.com")).toBe("https://us.i.posthog.com");
    expect(normalizeAnalyticsUrl("X", " app.posthog.com ")).toBe("https://app.posthog.com");
  });

  test("garbage degrades to off with a warning, never a throw", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeAnalyticsUrl("EXPO_PUBLIC_POSTHOG_HOST", "ht!tp::/bad url")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EXPO_PUBLIC_POSTHOG_HOST"));
    warn.mockRestore();
  });

  test("getEnv boots with an empty-string PostHog host (the outage shape)", () => {
    jest.isolateModules(() => {
      const prev = process.env.EXPO_PUBLIC_POSTHOG_HOST;
      process.env.EXPO_PUBLIC_POSTHOG_HOST = "";
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getEnv } = require("../env") as typeof import("../env");
        expect(() => getEnv()).not.toThrow();
        expect(getEnv().EXPO_PUBLIC_POSTHOG_HOST).toBeUndefined();
      } finally {
        if (prev === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_HOST;
        else process.env.EXPO_PUBLIC_POSTHOG_HOST = prev;
      }
    });
  });
});
