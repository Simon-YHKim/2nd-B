// Unit tests for the layered safety classifier (src/lib/llm/safety.ts).
// Layer 1 = lexicon (deterministic). Layer 2 = Gemini Flash (mocked here).
// Behavior verified:
//   - mock mode (no LLM): falls back to lexicon only
//   - Gemini Flash returns RED: union with lexicon GREEN → RED wins
//   - Gemini Flash returns GREEN, lexicon RED: union → RED wins (conservative)
//   - Gemini Flash throws: fallback to lexicon
//   - fixedCrisisResponse returns the correct verbatim template per locale

const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

const mockEnv = jest.fn();
jest.mock("../../env", () => ({
  getEnv: () => mockEnv(),
}));

const mockInsertAudit = jest.fn().mockResolvedValue(undefined);
jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: (...args: unknown[]) => mockInsertAudit(...args),
}));

import { classifySafety, fixedCrisisResponse } from "../safety";

const LIVE_ENV = {
  EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
  EXPO_PUBLIC_LLM_MODE: "live" as const,
  // Vertex: the live egress that legitimately runs the Flash classifier (GCP-
  // billed, exempt from the H4 spend-cap guard). The API-key direct path is now
  // refused on live builds (see LIVE_APIKEY_ENV below), so these classifier tests
  // exercise the Vertex path.
  EXPO_PUBLIC_USE_VERTEX: true,
  GOOGLE_CLOUD_PROJECT: "test-project",
  GOOGLE_CLOUD_LOCATION: "us-central1",
  GOOGLE_API_KEY: "test-key",
  SENTRY_DSN: undefined,
  EXPO_PUBLIC_POSTHOG_KEY: undefined,
  EXPO_PUBLIC_POSTHOG_HOST: undefined,
};

const MOCK_ENV = { ...LIVE_ENV, EXPO_PUBLIC_LLM_MODE: "mock" as const };

// H4-residual (round-5): a LIVE non-Vertex (API-key) build must NOT construct the
// direct Flash client — that egress is uncapped (bypasses the gemini-proxy spend
// cap). classifySafety degrades to the lexicon-only backstop instead.
const LIVE_APIKEY_ENV = { ...LIVE_ENV, EXPO_PUBLIC_USE_VERTEX: false };

describe("classifySafety (layered)", () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
    mockEnv.mockReset();
    mockInsertAudit.mockClear();
  });

  test("mock mode: Gemini Flash never called, lexicon-only result", async () => {
    mockEnv.mockReturnValue(MOCK_ENV);
    const r = await classifySafety("자살하고 싶다", "ko");
    expect(r.zone).toBe("red");
    expect(r.source).toBe("lexicon-fallback");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test("live mode + LLM RED on green-text input → union promotes to RED", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        zone: "red",
        triggers: ["passive_ideation"],
        confidence: 0.92,
        cssrsLevel: 2,
      }),
    });
    // Lexicon thinks this is GREEN, LLM says RED. Conservative union → RED.
    const r = await classifySafety("그냥 모든 게 무의미하게 느껴져요", "ko");
    expect(r.zone).toBe("red");
    expect(r.cssrsLevel).toBe(2);
    expect(r.source).toBe("lexicon+llm");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  test("live mode + LLM GREEN on lexicon-RED input → still RED (lexicon wins)", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ zone: "green", triggers: [], confidence: 0.8, cssrsLevel: null }),
    });
    const r = await classifySafety("죽고 싶어요", "ko");
    expect(r.zone).toBe("red"); // false-negative defense
    expect(r.source).toBe("lexicon+llm");
  });

  test("live mode + LLM returns an out-of-enum zone → lexicon RED preserved (fail-closed)", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ zone: "unknown", triggers: [], confidence: 0.9, cssrsLevel: null }),
    });
    // An unrecognized model zone must never downgrade a lexicon RED (cycle-3
    // fail-closed fix): it ranks RED-most and normalizes to "red".
    const r = await classifySafety("죽고 싶어요", "ko");
    expect(r.zone).toBe("red");
  });

  test("live mode + LLM throws → silent fallback to lexicon", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockRejectedValueOnce(new Error("rate limit"));
    const r = await classifySafety("자살에 대해 생각해요", "ko");
    expect(r.zone).toBe("red");
    expect(r.source).toBe("lexicon-fallback");
  });

  test("live mode + LLM returns invalid JSON → silent fallback", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({ text: "not json" });
    const r = await classifySafety("그냥 산책 갔어요", "ko");
    // Lexicon says GREEN → no LLM result → GREEN.
    expect(r.zone).toBe("green");
    expect(r.source).toBe("lexicon-fallback");
  });

  test("C3: a completed-but-malformed payload still audits (parse failure must not skip the insert)", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({ text: "not json" });
    const r = await classifySafety("그냥 산책 갔어요", "ko", { userId: "u1" });
    expect(r.source).toBe("lexicon-fallback"); // degraded to lexicon
    expect(mockInsertAudit).toHaveBeenCalledTimes(1); // but the billed call IS audited
  });

  test("off-scale cssrsLevel from the LLM is nulled, not passed to the crisis ledger", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ zone: "red", triggers: ["passive_ideation"], confidence: 0.9, cssrsLevel: 0 }),
    });
    // DB CHECK is BETWEEN 1 AND 6; a 0 would void the swallowed ledger insert.
    const r = await classifySafety("죽고 싶어요", "ko");
    expect(r.zone).toBe("red");
    expect(r.cssrsLevel).toBeNull();
  });

  test("fractional in-range cssrsLevel is rounded; out-of-range confidence is clamped", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ zone: "red", triggers: [], confidence: 1.4, cssrsLevel: 4.6 }),
    });
    const r = await classifySafety("그냥 모든 게 무의미하게 느껴져요", "ko");
    expect(r.cssrsLevel).toBe(5);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  test("C3: audits the Flash classifier call when a userId is supplied", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ zone: "green", triggers: [], confidence: 0.5, cssrsLevel: null }),
    });
    await classifySafety("그냥 산책 갔어요", "ko", { userId: "u1" });
    expect(mockInsertAudit).toHaveBeenCalledTimes(1);
    expect(mockInsertAudit.mock.calls[0]![0]).toMatchObject({
      userId: "u1",
      modelUsed: "gemini-2.5-flash",
    });
  });

  test("C3: does NOT audit when no userId (no attribution / web no-key path)", async () => {
    mockEnv.mockReturnValue(LIVE_ENV);
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ zone: "green", triggers: [], confidence: 0.5, cssrsLevel: null }),
    });
    await classifySafety("그냥 산책 갔어요", "ko");
    expect(mockInsertAudit).not.toHaveBeenCalled();
  });

  test("H4-residual: a live non-Vertex (API-key) build does NOT call the uncapped Flash client", async () => {
    mockEnv.mockReturnValue(LIVE_APIKEY_ENV);
    await classifySafety("그냥 산책 갔어요", "ko", { userId: "u1" });
    // getFlashClient refuses the uncapped API-key egress on live -> lexicon-only.
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockInsertAudit).not.toHaveBeenCalled();
  });

  test("H4-residual: a RED input is still caught by the lexicon backstop on that build", async () => {
    mockEnv.mockReturnValue(LIVE_APIKEY_ENV);
    const r = await classifySafety("자살하고 싶다", "ko");
    expect(r.zone).toBe("red");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe("fixedCrisisResponse", () => {
  test("Korean adult template uses the current 109 line (not retired 1393)", () => {
    const r = fixedCrisisResponse("ko");
    expect(r.text).toContain("109");
    expect(r.text).not.toContain("1393");
    expect(r.version).toBe("red-ko-v2");
  });

  test("Korean minor template surfaces the youth line 1388 alongside 109", () => {
    const r = fixedCrisisResponse("ko", true);
    expect(r.text).toContain("1388");
    expect(r.text).toContain("109");
    expect(r.version).toBe("red-ko-minor-v1");
  });

  test("English template includes 988 and findahelpline", () => {
    const r = fixedCrisisResponse("en");
    expect(r.text).toContain("988");
    expect(r.text).toContain("findahelpline.com");
    expect(r.version).toBe("red-en-v1");
  });

  test("templates never include AI-improvised crisis language", () => {
    const ko = fixedCrisisResponse("ko").text;
    const en = fixedCrisisResponse("en").text;
    // No "have you tried", "you should" — these are listening-mode violations.
    expect(en).not.toMatch(/have you tried/i);
    expect(en).not.toMatch(/you should/i);
    expect(ko).not.toMatch(/해보세요/);
    // AI step-back language present.
    expect(ko).toContain("두번째 뇌");
    expect(en).toContain("2nd-Brain");
  });
});
