// createRecord Advisor entitlement gate (cycle-5 wiring of canUsePremium).
// The journal Advisor follow-up is the only client path into callAdvisor and
// the marginal-cost surface — when the caller names its tier, sub-Brain tiers
// must save the entry WITHOUT an AI follow-up. The audit_response follow-up
// (Lv1-3 core loop) is never tier-gated.

const mockCallAdvisor = jest.fn();
const mockCallGemini = jest.fn();
const mockClassifyRecordCrisis = jest.fn();

jest.mock("../../llm/gemini", () => ({
  callAdvisor: (...args: unknown[]) => mockCallAdvisor(...args),
  callGemini: (...args: unknown[]) => mockCallGemini(...args),
  classifyRecordTextForCrisis: (...args: unknown[]) => mockClassifyRecordCrisis(...args),
}));

jest.mock("../../progression/xp", () => ({
  awardXpSafe: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../knowledge/engines", () => ({
  buildMemorizedPattern: jest.fn(() => ({ user_id: "u1" })),
}));

const mockInsert = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mockInsert(row);
        return {
          select: () => ({
            single: async () => ({ data: { id: "r1" }, error: null }),
          }),
        };
      },
    }),
  }),
}));

import { createRecord } from "../create";

const ADVISOR_OK = {
  text: "What stood out today?",
  zone: "green",
  triggers: [],
  cssrsLevel: null,
  fixedTemplate: false,
  matchedBatches: [],
  evidence: [],
  audit: {},
};

describe("createRecord — Advisor premium gate", () => {
  beforeEach(() => {
    mockCallAdvisor.mockReset().mockResolvedValue(ADVISOR_OK);
    mockCallGemini.mockReset().mockResolvedValue({ text: "ok", safety: { zone: "green" } });
    mockClassifyRecordCrisis.mockReset().mockResolvedValue(null);
    mockInsert.mockClear();
  });

  test("C9 is not premium: a free-tier journal save still runs the local crisis classifier", async () => {
    await createRecord({
      userId: "u1",
      locale: "ko",
      kind: "journal",
      body: "오늘 하루.",
      withFollowup: true,
      tier: "free",
      minor: true,
    });

    expect(mockClassifyRecordCrisis).toHaveBeenCalledWith("오늘 하루.", "ko", "u1", true);
    expect(mockCallAdvisor).not.toHaveBeenCalled();
  });

  test("free-tier red-zone journal: hotline follow-up attaches as a fixed template and the entry STILL saves", async () => {
    mockClassifyRecordCrisis.mockResolvedValue({ text: "지금 많이 힘드신 것 같아요. 109로 연락해 주세요." });

    const r = await createRecord({
      userId: "u1",
      locale: "ko",
      kind: "journal",
      body: "red zone text",
      withFollowup: true,
      tier: "free",
    });

    expect(r.id).toBe("r1");
    expect(r.followup).toEqual(
      expect.objectContaining({ zone: "red", fixedTemplate: true }),
    );
    expect(mockInsert).toHaveBeenCalledTimes(1); // the entry itself still lands
  });

  test("a crisis-fallback failure never blocks the save (best-effort)", async () => {
    mockClassifyRecordCrisis.mockRejectedValue(new Error("network down"));

    const r = await createRecord({
      userId: "u1",
      locale: "en",
      kind: "journal",
      body: "Today went well.",
      withFollowup: true,
      tier: "free",
    });

    expect(r.id).toBe("r1");
    expect(r.followup).toBeUndefined();
  });

  test("brain tier (advisor path): the fallback classifier does NOT double-run", async () => {
    await createRecord({
      userId: "u1",
      locale: "en",
      kind: "journal",
      body: "Today went well.",
      withFollowup: true,
      tier: "brain",
    });

    expect(mockCallAdvisor).toHaveBeenCalledTimes(1);
    expect(mockClassifyRecordCrisis).not.toHaveBeenCalled();
  });

  test("free tier: journal entry saves, Advisor is NOT called", async () => {
    const r = await createRecord({
      userId: "u1",
      locale: "en",
      kind: "journal",
      body: "Today went well.",
      withFollowup: true,
      tier: "free",
    });

    expect(mockCallAdvisor).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledTimes(1); // the entry itself still lands
    expect(r.id).toBe("r1");
    expect(r.followup).toBeUndefined();
  });

  test("brain tier: Advisor follow-up runs", async () => {
    const r = await createRecord({
      userId: "u1",
      locale: "en",
      kind: "journal",
      body: "Today went well.",
      withFollowup: true,
      tier: "brain",
    });

    expect(mockCallAdvisor).toHaveBeenCalledTimes(1);
    expect(r.followup?.text).toBe("What stood out today?");
  });

  test("tier omitted (legacy caller): behavior unchanged, Advisor runs", async () => {
    await createRecord({
      userId: "u1",
      locale: "en",
      kind: "journal",
      body: "Today went well.",
      withFollowup: true,
    });

    expect(mockCallAdvisor).toHaveBeenCalledTimes(1);
  });

  test("audit_response follow-up is never tier-gated (Lv1-3 core loop)", async () => {
    await createRecord({
      userId: "u1",
      locale: "en",
      kind: "audit_response",
      body: "My answer.",
      withFollowup: true,
      tier: "free",
    });

    expect(mockCallGemini).toHaveBeenCalledTimes(1);
    expect(mockCallAdvisor).not.toHaveBeenCalled();
  });

  test("audit_response LLM failure falls back to local crisis classification and still saves", async () => {
    mockCallGemini.mockRejectedValueOnce(new Error("proxy down"));
    mockClassifyRecordCrisis.mockResolvedValueOnce({
      text: "Please contact 988 now.",
    });

    const r = await createRecord({
      userId: "u1",
      locale: "en",
      kind: "audit_response",
      body: "red zone answer",
      withFollowup: true,
      tier: "free",
      minor: false,
    });

    expect(mockCallGemini).toHaveBeenCalledTimes(1);
    expect(mockClassifyRecordCrisis).toHaveBeenCalledWith("red zone answer", "en", "u1", false);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ai_followup: expect.objectContaining({
          text: "Please contact 988 now.",
          zone: "red",
          fixedTemplate: true,
        }),
      }),
    );
    expect(r.followup).toEqual(
      expect.objectContaining({
        text: "Please contact 988 now.",
        zone: "red",
        fixedTemplate: true,
      }),
    );
  });
});
