// Env validation tests. Verifies the zod schema's defaults, refinements,
// and the EXPO_PUBLIC_GOOGLE_API_KEY → GOOGLE_API_KEY priority that
// powers the client-side Gemini path.

describe("getEnv", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Fresh env per test + reset module-level cache.
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("falls back to demo placeholders when Supabase URL missing", async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe("https://demo.invalid.supabase.co");
    expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBe("demo-key-placeholder-20-chars-min");
  });

  test("LLM_MODE defaults to mock when no key and not Vertex", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    delete process.env.EXPO_PUBLIC_LLM_MODE;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
    delete process.env.EXPO_PUBLIC_USE_VERTEX;
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.EXPO_PUBLIC_LLM_MODE).toBe("mock");
  });

  test("LLM_MODE defaults to live when EXPO_PUBLIC_GOOGLE_API_KEY is set", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    delete process.env.EXPO_PUBLIC_LLM_MODE;
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = "AIza-fake-key-for-test";
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.EXPO_PUBLIC_LLM_MODE).toBe("live");
    expect(env.GOOGLE_API_KEY).toBe("AIza-fake-key-for-test");
  });

  test("EXPO_PUBLIC_GOOGLE_API_KEY wins over GOOGLE_API_KEY when both set", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY = "public-variant";
    process.env.GOOGLE_API_KEY = "server-variant";
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.GOOGLE_API_KEY).toBe("public-variant");
  });

  test("GOOGLE_API_KEY used as fallback when EXPO_PUBLIC variant absent", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    delete process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = "server-only";
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.GOOGLE_API_KEY).toBe("server-only");
  });

  test("USE_VERTEX 'true' parses to boolean true", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    process.env.EXPO_PUBLIC_USE_VERTEX = "true";
    process.env.GOOGLE_CLOUD_PROJECT = "some-project";
    process.env.EXPO_PUBLIC_LLM_MODE = "live";
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.EXPO_PUBLIC_USE_VERTEX).toBe(true);
  });

  test("Vertex live mode requires GOOGLE_CLOUD_PROJECT (C2)", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    process.env.EXPO_PUBLIC_USE_VERTEX = "true";
    process.env.EXPO_PUBLIC_LLM_MODE = "live";
    delete process.env.GOOGLE_CLOUD_PROJECT;
    const { getEnv } = await import("../env");
    expect(() => getEnv()).toThrow();
  });

  test("Mock mode skips Vertex GOOGLE_CLOUD_PROJECT requirement", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    process.env.EXPO_PUBLIC_USE_VERTEX = "true";
    process.env.EXPO_PUBLIC_LLM_MODE = "mock";
    delete process.env.GOOGLE_CLOUD_PROJECT;
    const { getEnv } = await import("../env");
    expect(() => getEnv()).not.toThrow();
  });

  test("LLM_VIA_EDGE_FUNCTION defaults to false", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    delete process.env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION;
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION).toBe(false);
  });

  test("LLM_VIA_EDGE_FUNCTION 'true' parses to boolean true", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    process.env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION = "true";
    const { getEnv } = await import("../env");
    const env = getEnv();
    expect(env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION).toBe(true);
  });

  test("FORCE_TIER defaults to off (launch: real billing gating)", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    delete process.env.EXPO_PUBLIC_FORCE_TIER;
    const { getEnv } = await import("../env");
    expect(getEnv().EXPO_PUBLIC_FORCE_TIER).toBe("off");
  });

  test("FORCE_TIER='off' parses through (restores real billing)", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    process.env.EXPO_PUBLIC_FORCE_TIER = "off";
    const { getEnv } = await import("../env");
    expect(getEnv().EXPO_PUBLIC_FORCE_TIER).toBe("off");
  });

  test("FORCE_TIER rejects an unknown tier value", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    process.env.EXPO_PUBLIC_FORCE_TIER = "platinum";
    const { getEnv } = await import("../env");
    expect(() => getEnv()).toThrow();
  });

  test("USE_V3_ART defaults to true (Simon worldview art on by default)", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(40);
    delete process.env.EXPO_PUBLIC_USE_V3_ART;
    const { getEnv } = await import("../env");
    expect(getEnv().EXPO_PUBLIC_USE_V3_ART).toBe(true);
  });

  test("IS_DEMO_BUILD correctly identifies demo URLs", async () => {
    const { IS_DEMO_BUILD } = await import("../env");
    expect(IS_DEMO_BUILD(undefined)).toBe(true);
    expect(IS_DEMO_BUILD("")).toBe(true);
    expect(IS_DEMO_BUILD("https://demo.invalid.supabase.co")).toBe(true);
    expect(IS_DEMO_BUILD("https://real.supabase.co")).toBe(false);
  });
});
