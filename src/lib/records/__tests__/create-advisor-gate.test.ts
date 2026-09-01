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

  test("runtime-invalid intent falls back to the detector (insert is the last gate)", async () => {
    // 타입은 컴파일 타임 방벽일 뿐 — 값의 근원이 URL 파라미터라 insert 에서
    // isDomainId 로 한 번 더 거른다. 무효 값은 없는 것처럼 동작한다.
    await createRecord({
      userId: "u1",
      locale: "ko",
      kind: "journal",
      body: "회사 면접 준비",
      domainIntent: "hacker" as never,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["domain:career"] }),
    );
  });
});

// capture 화면의 domainIntent 배선. 컴포넌트 렌더 테스트는 이 저장소에서 막혀
// 있으므로(RN 0.85 upstream) 소스 계약으로 고정한다 — 배선이 사라지면 여기서
// 걸린다.
describe("capture 화면 — domainIntent 배선 (source contract)", () => {
  const src = readFileSync(join(process.cwd(), "src", "app", "capture.tsx"), "utf8");

  test("딥링크 소비는 순수 계획(planCaptureParamConsumption)을 집행만 한다", () => {
    // 전이 규칙 자체는 lib/capture/draft.ts + draft.test.ts 가 지킨다. 여기는
    // 화면이 그 계획을 우회하지 않는지만 본다.
    expect(src).toContain("planCaptureParamConsumption({");
    // latch 해제 — 파라미터 공백이 오면 같은 tag 재배달을 새로 소비할 수 있다.
    expect(src).toContain("modeParamConsumedRef.current = null;");
    // 라우트발 모드 변경도 손 전환과 같은 계약을 탄다 — raw setMode 금지.
    expect(src).toContain("switchCaptureMode(plan.targetMode)");
    expect(src).not.toContain("setMode(m)");
    // IntentTransition 네 원인이 그대로 집행된다 — set/clear 만 칩·intent 를
    // 만지고(전환을 가로질러도), preserve/defer-to-draft 는 손대지 않는다.
    expect(src).toContain('if (intent.kind === "set" || intent.kind === "clear")');
    expect(src).toContain('setDomainIntent(intent.kind === "set" ? intent.domain : null);');
    // domain 칩 걷어내기는 insert 와 같은 규약(isDomainTag, 대소문자 무시)을 쓴다.
    expect(src).toContain("prev.filter((x) => !isDomainTag(x))");
  });

  test("shared + mode 는 한 계획으로 원자 소비한다 (콜드 스타트 초안 소실 방지)", () => {
    // 폴드·전환 규칙은 planSharedConsumption + draft.test.ts 가 지킨다.
    expect(src).toContain("planSharedConsumption({");
    // param effect 는 미소비 share 가 있으면 물러난다 — 낡은 closure 로
    // 전환을 걸면 폴드 전 상태를 접어 넣는다.
    expect(src).toContain("if (pendingSharedRef.current) return;");
    // share 가 mode 를 함께 소비하면 param effect 이중 소비를 latch 로 막는다.
    expect(src).toContain("plan.consumedModeParam !== null");
    // 4W1H 은 body 가 아니라 다섯 칸 state 를 읽는다 — payload 는 setFourw 로 싣는다.
    expect(src).toContain("setFourw(plan.liveFourw)");
    // linkclip 하드코딩 폴드로 되돌아가면 mode 동반 share 텍스트가 화면에서 사라진다.
    expect(src).not.toContain("consumeSharedIntoDrafts");
  });

  test("별 intent 는 journal 초안과 함께 영속되고 복원 시 칩과 같이 돌아온다", () => {
    expect(src).toContain('...(targetMode === "journal" && domainIntent !== null ? { domainIntent } : {})');
    expect(src).toContain("draft?.domainIntent");
    // 본문 변경 없이 intent 만 바뀌어도 디바운스 저장이 따라간다.
    expect(src).toContain("ocrReviewApproved, domainIntent]");
    // 복원도 딥링크 집행과 같은 교체 계약이다: domain:* 칩을 전부 걷어낸 뒤
    // 정본 칩 하나만 — intent 없는 초안은 domain 칩 0개로 복원된다.
    expect(src).toContain(
      "return restoredIntent === null ? base : [...base, domainTagFor(restoredIntent)];",
    );
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

  test("일반 tag 의 칩 추가 UX 는 보존된다 (dedupe 후 append)", () => {
    expect(src).toContain("base.includes(chip) ? base : [...base, chip]");
  });
});
