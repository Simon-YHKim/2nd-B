import {
  loadCaptureDraft,
  loadCaptureDraftState,
  planCaptureParamConsumption,
  saveCaptureDraft,
  saveCaptureDraftState,
  clearCaptureDraft,
  type CaptureParamPlan,
} from "../draft";

// The jest environment is node (no DOM), so pin the web path with an
// in-memory localStorage shim. The native path shares the same parse/serialize
// logic and key scheme.
const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("capture draft persistence (persona sim P1-5)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("round-trips journal body + topic through the compatibility helpers, scoped by user", async () => {
    saveCaptureDraft("u1", { body: "delivery memo", topic: "today" });
    expect(await loadCaptureDraft("u1")).toEqual({
      body: "delivery memo",
      topic: "today",
      conclusion: "",
      ocrReviewApproved: false,
    });
    expect(await loadCaptureDraft("u2")).toBeNull();
  });

  test("round-trips separate drafts and the last active mode", async () => {
    saveCaptureDraftState("u1", {
      lastMode: "ocr",
      drafts: {
        memo: { body: "memo draft", topic: "" },
        ocr: { body: "ocr text", topic: "", ocrReviewApproved: true },
        journal: { body: "journal body", topic: "journal topic", conclusion: "done" },
      },
    });

    await expect(loadCaptureDraftState("u1")).resolves.toEqual({
      lastMode: "ocr",
      drafts: {
        memo: { body: "memo draft", topic: "", conclusion: "", ocrReviewApproved: false },
        ocr: { body: "ocr text", topic: "", conclusion: "", ocrReviewApproved: true },
        journal: { body: "journal body", topic: "journal topic", conclusion: "done", ocrReviewApproved: false },
      },
    });
  });

  test("clearing one mode preserves the other mode drafts", async () => {
    saveCaptureDraftState("u1", {
      lastMode: "linkclip",
      drafts: {
        memo: { body: "memo draft", topic: "" },
        linkclip: { body: "https://example.com", topic: "" },
      },
    });

    clearCaptureDraft("u1", "memo");

    await expect(loadCaptureDraftState("u1")).resolves.toEqual({
      lastMode: "linkclip",
      drafts: {
        linkclip: { body: "https://example.com", topic: "", conclusion: "", ocrReviewApproved: false },
      },
    });
  });

  test("empty drafts are dropped instead of shadowing future restores", async () => {
    saveCaptureDraft("u1", { body: "something", topic: "" });
    saveCaptureDraft("u1", { body: "   ", topic: "" });
    expect(await loadCaptureDraft("u1")).toBeNull();
  });

  test("corrupt state and legacy storage values restore safely", async () => {
    localStorage.setItem("capture.drafts.v2.u1", "{not json");
    expect(await loadCaptureDraftState("u1")).toEqual({ drafts: {}, lastMode: "journal" });

    localStorage.clear();
    localStorage.setItem("capture.journalDraft.v1.u1", JSON.stringify({ body: "legacy body", topic: "legacy" }));
    expect(await loadCaptureDraft("u1")).toEqual({
      body: "legacy body",
      topic: "legacy",
      conclusion: "",
      ocrReviewApproved: false,
    });

    localStorage.clear();
    localStorage.setItem("capture.journalDraft.v1.u1", JSON.stringify({ topic: "no body" }));
    expect(await loadCaptureDraft("u1")).toBeNull();
  });
});

describe("journal 초안의 domainIntent 영속 (별 담기 P3)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("journal 초안과 함께 왕복하고, 다른 모드에선 실리지 않는다", async () => {
    saveCaptureDraftState("u1", {
      lastMode: "journal",
      drafts: {
        journal: { body: "별에서 시작한 글", topic: "", domainIntent: "growth" },
        memo: { body: "memo body", topic: "", domainIntent: "growth" },
      },
    });

    const state = await loadCaptureDraftState("u1");
    expect(state.drafts.journal?.domainIntent).toBe("growth");
    // journal 밖의 intent 는 정규화가 걷는다 — 별 담기는 records 저장에만 의미가 있다.
    expect(state.drafts.memo?.domainIntent).toBeUndefined();
  });

  test("저장돼 있던 무효 intent 는 로드에서 걸러진다 (스토리지는 위조 가능한 표면)", async () => {
    localStorage.setItem(
      "capture.drafts.v2.u1",
      JSON.stringify({
        lastMode: "journal",
        drafts: { journal: { body: "본문", topic: "", domainIntent: "hacker" } },
      }),
    );
    const state = await loadCaptureDraftState("u1");
    expect(state.drafts.journal?.body).toBe("본문");
    expect(state.drafts.journal?.domainIntent).toBeUndefined();
  });

  test("본문 없는 초안은 intent 만으로 살아남지 않는다", async () => {
    saveCaptureDraftState("u1", {
      lastMode: "journal",
      drafts: { journal: { body: "   ", topic: "", domainIntent: "growth" } },
    });
    expect((await loadCaptureDraftState("u1")).drafts.journal).toBeUndefined();
  });
});

describe("planCaptureParamConsumption — 딥링크 소비 계획 (렌더 없는 상태 전이)", () => {
  // capture.tsx 집행부(chip 처리)의 거울 — 계획의 칩 연산을 배열에 적용한다.
  function applyChips(prev: string[], plan: CaptureParamPlan): string[] {
    const base = plan.stripDomainChips
      ? prev.filter((x) => !x.toLowerCase().startsWith("domain:"))
      : prev;
    if (plan.appendChip === null) return base;
    return base.includes(plan.appendChip) ? base : [...base, plan.appendChip];
  }

  test("유효 별 배달: sources 모드(memo)면 journal 로 전환을 지시한다 (P1)", () => {
    const plan = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "memo",
      consumedKey: null,
    });
    expect(plan.targetMode).toBe("journal");
    expect(plan.intent).toBe("growth");
    expect(applyChips([], plan)).toEqual(["domain:growth"]);
  });

  test("records 모드(voice)에서는 전환 없이 intent 만 설정한다", () => {
    const plan = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:health",
      currentMode: "voice",
      consumedKey: null,
    });
    expect(plan.targetMode).toBeNull();
    expect(plan.intent).toBe("health");
  });

  test("mode 전용 파라미터도 전환 계약을 탄다 — intent 는 preserve", () => {
    const plan = planCaptureParamConsumption({
      modeParam: "voice",
      tagParam: undefined,
      currentMode: "journal",
      consumedKey: null,
    });
    expect(plan.targetMode).toBe("voice");
    expect(plan.showAdvanced).toBe(true);
    expect(plan.intent).toBe("preserve");
    expect(plan.stripDomainChips).toBe(false);
    expect(applyChips(["domain:growth", "mine"], plan)).toEqual(["domain:growth", "mine"]);
  });

  test("latch: 같은 key 는 재소비하지 않고, 파라미터 공백이 latch 를 푼 뒤엔 같은 tag 도 새 배달로 소비한다", () => {
    const first = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(first.consumeKey).toBe(":domain:growth");

    // 같은 key 가 아직 latch 에 있으면 noop.
    const repeat = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: first.consumeKey,
    });
    expect(repeat.consumeKey).toBeNull();
    expect(repeat.releaseLatch).toBe(false);

    // setParams 가 파라미터를 비우면 latch 해제.
    const emptied = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: undefined,
      currentMode: "journal",
      consumedKey: first.consumeKey,
    });
    expect(emptied.releaseLatch).toBe(true);
    expect(emptied.consumeKey).toBeNull();

    // reset·칩 제거 뒤 같은 별 담기가 다시 와도(같은 mount) 새 배달로 소비.
    const redelivered = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(redelivered.consumeKey).toBe(":domain:growth");
    expect(redelivered.intent).toBe("growth");
  });

  test("유효 별 → 일반 tag 전이: intent 해제 + domain 칩 제거, 일반 칩만 남는다 (P2 clear)", () => {
    const star = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    const chips = applyChips([], star);
    const ordinary = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "meeting-notes",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(ordinary.intent).toBeNull();
    // downstream tags(enqueueAutoReasoningRecord 등)에 stale domain 이 없다.
    expect(applyChips(chips, ordinary)).toEqual(["meeting-notes"]);
  });

  test("유효 별 → 무효 reserved 전이: intent 해제, 오해를 부르는 칩도 남기지 않는다", () => {
    const star = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    const chips = applyChips([], star);
    const invalid = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:hacker",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(invalid.intent).toBeNull();
    expect(invalid.appendChip).toBeNull();
    expect(applyChips(chips, invalid)).toEqual([]);
  });

  test("reserved 판정은 대소문자를 무시하고, 유효 별 칩은 정본 표기로 단다", () => {
    // insert 의 stripDomainTags 와 같은 규약 — 표기가 달라도 같은 운명이어야 한다.
    const upper = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "DOMAIN:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(upper.intent).toBe("growth");
    expect(upper.appendChip).toBe("domain:growth");

    const upperInvalid = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "DOMAIN:hacker",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(upperInvalid.intent).toBeNull();
    expect(upperInvalid.appendChip).toBeNull();
    expect(upperInvalid.stripDomainChips).toBe(true);
  });

  test("일반 tag 단독 배달의 칩 추가 UX 는 기존 그대로다", () => {
    const plan = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "mine",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(plan.targetMode).toBeNull();
    expect(applyChips(["keep"], plan)).toEqual(["keep", "mine"]);
    expect(applyChips(["keep", "mine"], plan)).toEqual(["keep", "mine"]);
  });
});
