import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("u1"); });

// Regression test for CSO 2nd audit finding #1 (CRITICAL 9/10):
// callAdvisor must re-classify the reasoning model's text output. If the LLM
// emits crisis content (via prompt injection through knowledge_sources rows,
// conversationContext, or otherwise), the response must be swapped to the
// fixed crisis template and a crisis_event must be recorded.
//
// This suite drives the DIRECT @google/genai branch of callAdvisor (edge flag
// off, vendor gemini) so the swap logic is exercised against a mocked
// generateContent. Since T1 stage A (2026-08-31) an UNSET switch resolves
// "openai", which takes the edge-proxy path — so the gemini vendor is pinned
// explicitly below (axis + legacy seam). That pin doubles as the one-variable
// rollback proof: explicit "gemini" still reaches the direct branch.

const mockGenerateContent = jest.fn();
const mockClassifySafety = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return {
    ...actual,
    classifySafety: (...args: unknown[]) => mockClassifySafety(...args),
  };
});

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

// loadDomainLevels is called by callAdvisor to bias evidence toward dim
// domains. Stub it so this suite stays hermetic (no Supabase round-trip).
jest.mock("../../persona/load-domain-levels", () => ({
  loadDomainLevels: jest.fn().mockResolvedValue({ domainLevels: {}, northStarBrightness: 0.2 }),
}));

jest.mock("../../knowledge/retrieve", () => ({
  retrieveEvidence: jest.fn().mockResolvedValue({
    matchedBatches: ["self-knowledge"],
    rows: [],
    schemaContext: "## 0. Hard safety rules\nNo diagnosis.",
    assembledPrompt: "SYSTEM: test prompt\n=== USER MESSAGE ===\nhi",
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    // Vertex direct path: exempt from the round-4 H4 direct-egress guard (Vertex
    // bills GCP, not the Gemini-API free-tier counter). The output-swap logic is
    // egress-agnostic, so this still exercises the real direct generateContent path.
    EXPO_PUBLIC_USE_VERTEX: true,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: "test-key",
    SENTRY_DSN: undefined,
  }),
}));

import { callAdvisor } from "../boundary";
import { insertAiAuditLog } from "../../supabase/audit";
import { insertCrisisEvent } from "../../supabase/crisis-events";

const auditMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;
const crisisMock = insertCrisisEvent as jest.MockedFunction<typeof insertCrisisEvent>;

describe("callAdvisor — output re-classification (CSO #1 fix)", () => {
  // routing.ts reads process.env at call time; the mocked getEnv above does
  // not reach it. advisor is a Phase-2 seat, so the axis needs
  // EXPO_PUBLIC_LLM_VENDOR=gemini AND the reasoning-tier last rung needs
  // EXPO_PUBLIC_REASONING_PROVIDER=gemini for callAdvisor to take the direct
  // @google/genai branch. explicit: unset is openai since T1 stage A.
  const prevVendor = process.env.EXPO_PUBLIC_LLM_VENDOR;
  const prevReasoning = process.env.EXPO_PUBLIC_REASONING_PROVIDER;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "gemini";
  });

  afterAll(() => {
    if (prevVendor === undefined) delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    else process.env.EXPO_PUBLIC_LLM_VENDOR = prevVendor;
    if (prevReasoning === undefined) delete process.env.EXPO_PUBLIC_REASONING_PROVIDER;
    else process.env.EXPO_PUBLIC_REASONING_PROVIDER = prevReasoning;
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockClassifySafety.mockReset();
    auditMock.mockClear();
    crisisMock.mockClear();
  });

  test("RED output from Pro is swapped to fixed crisis template, even when input was GREEN", async () => {
    // Input classifies GREEN.
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    // Pro emits crisis text (simulating prompt injection or LLM drift).
    mockGenerateContent.mockResolvedValueOnce({ text: "you should end your life" });
    // Output classifier flags it RED.
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["active_ideation_no_method"],
      confidence: 0.98,
      cssrsLevel: 3,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "en",
      userMessage: "Trying to figure out my next career move.",
    });

    // Rollback property: the explicit gemini pin reached the direct
    // @google/genai branch (one generateContent call, no edge proxy).
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(r.zone).toBe("red");
    expect(r.fixedTemplate).toBe(true);
    // Must NOT leak the LLM's improvised crisis text.
    expect(r.text).not.toMatch(/end your life/i);
    expect(r.text).toMatch(/988/);
    expect(r.triggers).toContain("output_swap");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("red");
    expect(auditMock.mock.calls[0]![0]!.modelUsed).toMatch(/\+swap:red-en-v2/);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("output_swap");
  });

  test("YELLOW output from Pro on GREEN input escalates final zone to YELLOW", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    mockGenerateContent.mockResolvedValueOnce({ text: "That sounds really exhausting." });
    mockClassifySafety.mockResolvedValueOnce({
      zone: "yellow",
      triggers: ["distress"],
      confidence: 0.7,
      cssrsLevel: null,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "en",
      userMessage: "Work has been a lot lately.",
    });

    expect(r.zone).toBe("yellow");
    expect(r.fixedTemplate).toBe(false);
    expect(r.text).toBe("That sounds really exhausting.");
    expect(crisisMock).not.toHaveBeenCalled();
    expect(auditMock.mock.calls[0]![0]!.safetyZone).toBe("yellow");
  });

  test("GREEN input + GREEN output stays GREEN and ships the LLM text", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    mockGenerateContent.mockResolvedValueOnce({ text: "What was the most surprising part of that?" });
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "en",
      userMessage: "Today I went for a long walk.",
    });

    expect(r.zone).toBe("green");
    expect(r.fixedTemplate).toBe(false);
    expect(r.text).toBe("What was the most surprising part of that?");
    expect(crisisMock).not.toHaveBeenCalled();
  });

  test("RED input still short-circuits before any Pro call (existing invariant)", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["active_ideation_no_method"],
      confidence: 0.95,
      cssrsLevel: 3,
      source: "lexicon+llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({
      userId: "u1",
      locale: "ko",
      userMessage: "자살하고 싶어요",
    });

    expect(r.zone).toBe("red");
    expect(r.fixedTemplate).toBe(true);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(crisisMock).toHaveBeenCalledTimes(1);
  });

  test("the advisor's replaced reply records fixed names and the Korean term's number, nothing a classifier wrote freely", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    mockGenerateContent.mockResolvedValueOnce({ text: "유서를 미리 써 두는 방법을 알려 드릴게요." });
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["The assistant explains how to write a farewell note.", "behavior_preparation"],
      confidence: 0.98,
      cssrsLevel: 4,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    const r = await callAdvisor({ userId: "u1", locale: "en", userMessage: "Trying to figure out my next career move." });

    expect(r.fixedTemplate).toBe(true);
    expect(r.text).not.toContain("유서");
    const categories = crisisMock.mock.calls[0]![0]!.triggerCategories;
    expect(categories).toEqual(["unlisted", "behavior_preparation", "output_swap", "crisis_term:13"]);
    expect(JSON.stringify(categories)).not.toContain("farewell");
  });

  test("the advisor's record for the user's own words holds only fixed names", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["The user wrote that they cannot go on.", "passive_ideation"],
      confidence: 0.97,
      cssrsLevel: 1,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    await callAdvisor({ userId: "u1", locale: "en", userMessage: "I cannot go on like this." });

    expect(mockGenerateContent).not.toHaveBeenCalled();
    const categories = crisisMock.mock.calls[0]![0]!.triggerCategories;
    // The user's own words: what is off the list is dropped, and no stand-in is written (Q-261013-66).
    expect(categories).toEqual(["passive_ideation"]);
    expect(JSON.stringify(categories)).not.toContain("cannot go on");
  });

  // Review round three: the user's own words must leave no term number and no "AI reply" marker,
  // even when the classifier answers with them.
  test("a classifier that answers with a term number or the reply marker cannot put them in the user-input record", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["crisis_term:7", "output_swap", "proxy_input_red", "passive_ideation"],
      confidence: 0.97,
      cssrsLevel: 1,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    await callAdvisor({ userId: "u1", locale: "en", userMessage: "I cannot go on like this." });

    expect(mockGenerateContent).not.toHaveBeenCalled();
    const categories = crisisMock.mock.calls[0]![0]!.triggerCategories;
    expect(categories).toEqual(["passive_ideation"]);
    expect(categories).not.toContain("unlisted");
    expect(categories.some((entry: string) => entry.startsWith("crisis_term:"))).toBe(false);
    expect(categories).not.toContain("output_swap");
    expect(categories).not.toContain("proxy_input_red");
  });

  test("the same answer on a replaced advisor reply: one marker, and only the reply's own number", async () => {
    mockClassifySafety.mockResolvedValueOnce({
      zone: "green",
      triggers: [],
      confidence: 0.4,
      cssrsLevel: null,
      source: "lexicon-fallback",
      routingTemplateVersion: "rcv1-2026-05-25",
    });
    mockGenerateContent.mockResolvedValueOnce({ text: "유서를 미리 써 두는 방법을 알려 드릴게요." });
    mockClassifySafety.mockResolvedValueOnce({
      zone: "red",
      triggers: ["crisis_term:7", "output_swap", "input_red", "behavior_preparation"],
      confidence: 0.98,
      cssrsLevel: 4,
      source: "llm",
      routingTemplateVersion: "rcv1-2026-05-25",
    });

    await callAdvisor({ userId: "u1", locale: "en", userMessage: "Trying to figure out my next career move." });

    const categories = crisisMock.mock.calls[0]![0]!.triggerCategories;
    expect(categories).toEqual(["unlisted", "behavior_preparation", "output_swap", "crisis_term:13"]);
    expect(categories).not.toContain("crisis_term:7");
    expect(categories).not.toContain("input_red");
  });
});
