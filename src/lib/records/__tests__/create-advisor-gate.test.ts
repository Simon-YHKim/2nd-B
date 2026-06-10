// createRecord Advisor entitlement gate (cycle-5 wiring of canUsePremium).
// The journal Advisor follow-up is the only client path into callAdvisor and
// the marginal-cost surface — when the caller names its tier, sub-Brain tiers
// must save the entry WITHOUT an AI follow-up. The audit_response follow-up
// (Lv1-3 core loop) is never tier-gated.

const mockCallAdvisor = jest.fn();
const mockCallGemini = jest.fn();

jest.mock("../../llm/gemini", () => ({
  callAdvisor: (...args: unknown[]) => mockCallAdvisor(...args),
  callGemini: (...args: unknown[]) => mockCallGemini(...args),
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
    mockInsert.mockClear();
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
});
