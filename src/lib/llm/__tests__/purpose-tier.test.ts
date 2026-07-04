// 3-tier purpose router + effort default. Verifies, in mock mode (no network):
//   - the purpose -> tier default map (classify -> lite, chat -> flash,
//     advisor/reasoning -> pro) via the returned audit's modelUsed
//     (mock:<modelId>),
//   - an explicit `model` arg still wins over the purpose default,
//   - the reasoning (pro) tier records the default effort "high" in the audit,
//   - env-overridable model ids (PURPOSE_TIER + MODELS) resolve as expected.
//
// Asserts against the `audit` object callGemini/callAdvisor RETURN to the caller
// (GeminiResult.audit / AdvisorResult.audit) — so this file does NOT import the
// audit/crisis-events modules (keeps it off the C3 import-boundary allowlist).
// C3 (audit on every call) and C9 (classify-first) are exercised by the sibling
// suites; this one is purely the tier/effort router.

const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

// Stubbed via string-arg jest.mock (no `import ... from` — boundary-safe).
jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

// retrieveEvidence is hit by callAdvisor before the (mock) model call.
// loadDomainLevels is called by callAdvisor to bias evidence toward dim
// domains. Stub it so this suite stays hermetic (no Supabase round-trip).
jest.mock("../../persona/load-domain-levels", () => ({
  loadDomainLevels: jest.fn().mockResolvedValue({ domainLevels: {}, northStarBrightness: 0.2 }),
}));

jest.mock("../../knowledge/retrieve", () => ({
  retrieveEvidence: jest.fn().mockResolvedValue({
    assembledPrompt: "ASSEMBLED",
    matchedBatches: [],
    rows: [],
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: undefined,
    SENTRY_DSN: undefined,
    EXPO_PUBLIC_POSTHOG_KEY: undefined,
    EXPO_PUBLIC_POSTHOG_HOST: undefined,
  }),
}));

import { callGemini, callAdvisor } from "../gemini";
import { MODELS, PURPOSE_TIER, type AuditMeta } from "../types";
import { resetAuditWriteOutboxForTests } from "../audit-write-outbox";

describe("purpose -> tier router + effort default (mock mode)", () => {
  beforeEach(async () => {
    await resetAuditWriteOutboxForTests();
    mockGenerateContent.mockClear();
  });

  test("map sanity: classify->lite, chat->flash, advisor->pro", () => {
    expect(PURPOSE_TIER.capture_classify).toBe("lite");
    expect(PURPOSE_TIER.clipper_classify).toBe("lite");
    expect(PURPOSE_TIER.secondb_chat).toBe("flash");
    // D-26 taxonomy split of the old persona_chat catch-all.
    expect(PURPOSE_TIER.persona_narrative).toBe("flash");
    expect(PURPOSE_TIER.gap_synthesize).toBe("flash");
    expect(PURPOSE_TIER.self_model_propose).toBe("flash");
    expect(PURPOSE_TIER.advisor).toBe("pro");
    expect(PURPOSE_TIER.journal_reflect).toBe("pro");
    // Routing decisions (docs/LLM-ROUTING.md): interview_probe demoted to
    // flash (deterministic layer choice; LLM only drafts one question), and
    // the two previously-unmapped estimate purposes pinned explicitly.
    expect(PURPOSE_TIER.interview_probe).toBe("flash");
    expect(PURPOSE_TIER.northstar_propose).toBe("flash");
    expect(PURPOSE_TIER.axis_estimate).toBe("flash");
  });

  test("classify purpose routes to the lite model id", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "capture_classify",
      user: "tag this",
    });
    expect(r.audit.modelUsed).toBe(`mock:${MODELS.lite}`);
  });

  test("chat purpose routes to the flash model id", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "secondb_chat",
      user: "hello",
    });
    expect(r.audit.modelUsed).toBe(`mock:${MODELS.flash}`);
  });

  test("reasoning purpose (journal_reflect) routes to the pro model id", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "journal_reflect",
      user: "today felt long",
    });
    expect(r.audit.modelUsed).toBe(`mock:${MODELS.pro}`);
  });

  test("explicit model arg wins over the purpose default", async () => {
    // capture_classify defaults to lite; force pro explicitly.
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "capture_classify",
      user: "tag this",
      model: "pro",
    });
    expect(r.audit.modelUsed).toBe(`mock:${MODELS.pro}`);
  });

  test("existing-caller default preserved: mapped interactive purpose stays flash", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "ops_recommend",
      user: "what next?",
    });
    expect(r.audit.modelUsed).toBe(`mock:${MODELS.flash}`);
  });

  test("pro tier records the default effort 'high' + gemini provider in the audit", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "journal_reflect",
      user: "go on",
    });
    const audit = r.audit as AuditMeta;
    expect(audit.modelUsed).toBe(`mock:${MODELS.pro}`);
    expect(audit.effort).toBe("high");
    expect(audit.reasoningProvider).toBe("gemini");
  });

  test("an explicit effort overrides the default on the pro tier", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "journal_reflect",
      user: "go on",
      effort: "max",
    });
    expect((r.audit as AuditMeta).effort).toBe("max");
  });

  test("interview_probe (demoted) routes flash and records no effort", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "interview_probe",
      user: "go on",
    });
    const audit = r.audit as AuditMeta;
    expect(audit.modelUsed).toBe(`mock:${MODELS.flash}`);
    expect(audit.effort).toBeUndefined();
  });

  test("lite/flash tiers do NOT record an effort (reasoning-only field)", async () => {
    const r = await callGemini({
      userId: "u1",
      locale: "en",
      purpose: "secondb_chat",
      user: "hello",
    });
    expect((r.audit as AuditMeta).effort).toBeUndefined();
  });

  test("callAdvisor (reasoning path) uses pro + default effort 'high'", async () => {
    const r = await callAdvisor({
      userId: "u1",
      locale: "en",
      userMessage: "I am reflecting on my week.",
    });
    expect(r.audit.modelUsed).toBe(`mock:${MODELS.pro}`);
    expect((r.audit as AuditMeta).effort).toBe("high");
  });
});
