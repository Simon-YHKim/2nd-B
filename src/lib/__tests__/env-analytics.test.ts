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

describe("provider toggles survive the ''-for-unset workflow behavior", () => {
  function envWith(overrides: Record<string, string | undefined>): typeof import("../env").getEnv extends () => infer R ? R : never {
    let result: ReturnType<typeof import("../env").getEnv> | undefined;
    jest.isolateModules(() => {
      const prev: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(overrides)) {
        prev[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      try {
        result = (require("../env") as typeof import("../env")).getEnv();
      } finally {
        for (const [k, v] of Object.entries(prev)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });
    return result as never;
  }

  test("empty-string toggles fall back to defaults instead of failing the union", () => {
    const env = envWith({
      EXPO_PUBLIC_ENABLE_APPLE: "",
      EXPO_PUBLIC_ENABLE_KAKAO: "",
      EXPO_PUBLIC_ENABLE_GOOGLE: "",
      EXPO_PUBLIC_LLM_MODE: "",
      EXPO_PUBLIC_FORCE_TIER: "",
    });
    expect(env.EXPO_PUBLIC_ENABLE_GOOGLE).toBe(true);
    expect(env.EXPO_PUBLIC_ENABLE_APPLE).toBe(false);
    expect(env.EXPO_PUBLIC_ENABLE_KAKAO).toBe(false);
    expect(env.EXPO_PUBLIC_FORCE_TIER).toBe("off");
  });

  test("Apple/Kakao default OFF until the Supabase provider is actually enabled (live QA 2026-06-11)", () => {
    const env = envWith({
      EXPO_PUBLIC_ENABLE_APPLE: undefined,
      EXPO_PUBLIC_ENABLE_KAKAO: undefined,
      EXPO_PUBLIC_ENABLE_GOOGLE: undefined,
    });
    expect(env.EXPO_PUBLIC_ENABLE_GOOGLE).toBe(true);
    expect(env.EXPO_PUBLIC_ENABLE_APPLE).toBe(false);
    expect(env.EXPO_PUBLIC_ENABLE_KAKAO).toBe(false);
    const flipped = envWith({ EXPO_PUBLIC_ENABLE_KAKAO: "true" });
    expect(flipped.EXPO_PUBLIC_ENABLE_KAKAO).toBe(true);
  });
});
