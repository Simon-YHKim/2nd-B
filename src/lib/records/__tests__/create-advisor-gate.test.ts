// createRecord Advisor entitlement gate (cycle-5 wiring of canUsePremium).
// The journal Advisor follow-up is the only client path into callAdvisor and
// the marginal-cost surface — when the caller names its tier, sub-Brain tiers
// must save the entry WITHOUT an AI follow-up. The audit_response follow-up
// (Lv1-3 core loop) is never tier-gated.

const mockCallAdvisor = jest.fn();
const mockCallLlm = jest.fn();
const mockClassifyRecordCrisis = jest.fn();

jest.mock("../../llm/boundary", () => ({
  callAdvisor: (...args: unknown[]) => mockCallAdvisor(...args),
  callLlm: (...args: unknown[]) => mockCallLlm(...args),
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

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    mockCallLlm.mockReset().mockResolvedValue({ text: "ok", safety: { zone: "green" } });
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

    expect(mockCallLlm).toHaveBeenCalledTimes(1);
    expect(mockCallAdvisor).not.toHaveBeenCalled();
  });

  test("audit_response LLM failure falls back to local crisis classification and still saves", async () => {
    mockCallLlm.mockRejectedValueOnce(new Error("proxy down"));
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

    expect(mockCallLlm).toHaveBeenCalledTimes(1);
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

describe("createRecord — typed domainIntent (별 담기 provenance)", () => {
  beforeEach(() => {
    mockCallAdvisor.mockReset().mockResolvedValue(ADVISOR_OK);
    mockCallLlm.mockReset().mockResolvedValue({ text: "ok", safety: { zone: "green" } });
    mockClassifyRecordCrisis.mockReset().mockResolvedValue(null);
    mockInsert.mockClear();
  });

  test("domainIntent reaches the insert payload as the record's one domain tag", async () => {
    await createRecord({
      userId: "u1",
      locale: "ko",
      kind: "journal",
      body: "그냥 떠오른 생각",
      tags: ["mine"],
      domainIntent: "growth",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["domain:growth", "mine"] }),
    );
  });

  test("intent wins over the detector, raw domain:* still stripped", async () => {
    await createRecord({
      userId: "u1",
      locale: "ko",
      kind: "note",
      body: "회사 면접 준비",
      tags: ["domain:finance", "keep"],
      domainIntent: "growth",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["domain:growth", "keep"] }),
    );
  });

  test("no intent keeps detector-owned tagging unchanged", async () => {
    await createRecord({
      userId: "u1",
      locale: "ko",
      kind: "note",
      body: "회사 면접 준비",
      tags: ["domain:finance", "keep"],
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["domain:career", "keep"] }),
    );
  });
});

// capture 화면의 domainIntent 배선. 컴포넌트 렌더 테스트는 이 저장소에서 막혀
// 있으므로(RN 0.85 upstream) 소스 계약으로 고정한다 — 배선이 사라지면 여기서
// 걸린다.
describe("capture 화면 — domainIntent 배선 (source contract)", () => {
  const src = readFileSync(join(process.cwd(), "src", "app", "capture.tsx"), "utf8");

  test("허용목록(isDomainId) 통과 tag 만 intent 가 되고, 일반/무효 tag 는 이전 intent 를 지운다", () => {
    // 삼항 한 줄이 두 회귀를 함께 막는다: 무효 값 승격(허용목록), 그리고 같은
    // mount 에서 뒤에 온 tagParam 이 옛 의도를 조용히 살려두는 stale override.
    expect(src).toContain(
      "setDomainIntent(candidate !== null && isDomainId(candidate) ? candidate : null);",
    );
    expect(src).not.toContain("if (candidate !== null && isDomainId(candidate)) setDomainIntent(");
  });

  test("journal·note 두 createRecord 경로 모두에 intent 를 전달한다", () => {
    expect((src.match(/domainIntent: domainIntent \?\? undefined/g) ?? []).length).toBe(2);
  });

  test("성공(reset)·모드 전환이 지나는 resetTransientCaptureState 가 intent 를 지운다", () => {
    const fn = src.split("function resetTransientCaptureState")[1]?.split("\n  }")[0] ?? "";
    expect(fn).toContain("setDomainIntent(null)");
  });

  test("같은 별의 태그 칩을 지우면 숨은 intent 도 함께 사라진다", () => {
    const fn = src.split("function removeTag")[1]?.split("\n  }")[0] ?? "";
    expect(fn).toContain("domainTagFor(prev) === t ? null : prev");
  });

  test("기존 tagParam UX 는 보존된다 — 칩 추가는 그대로", () => {
    expect(src).toContain("setTagsEditable((prev) => (prev.includes(tg) ? prev : [...prev, tg]))");
  });
});
