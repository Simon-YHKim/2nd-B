import {
  loadCaptureDraft,
  loadCaptureDraftState,
  planCaptureParamConsumption,
  planSharedConsumption,
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
  // capture.tsx 집행부(chip 처리)의 거울 — set/clear 에서만 domain 칩을 전부
  // 걷어내고 appendChip 을 더한다. preserve/defer 는 칩을 만지지 않는다.
  function applyChips(prev: string[], plan: CaptureParamPlan): string[] {
    if (plan.intent.kind !== "set" && plan.intent.kind !== "clear") return prev;
    const base = prev.filter((x) => !x.toLowerCase().startsWith("domain:"));
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
    expect(plan.intent).toEqual({ kind: "set", domain: "growth" });
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
    expect(plan.intent).toEqual({ kind: "set", domain: "health" });
  });

  test("mode 전용 전환: intent 는 defer-to-draft — 전환의 reset·초안 복원이 수명을 소유한다", () => {
    const plan = planCaptureParamConsumption({
      modeParam: "voice",
      tagParam: undefined,
      currentMode: "journal",
      consumedKey: null,
    });
    expect(plan.targetMode).toBe("voice");
    expect(plan.showAdvanced).toBe(true);
    expect(plan.intent).toEqual({ kind: "defer-to-draft" });
    expect(plan.appendChip).toBeNull();
    // 집행부는 칩도 만지지 않는다 (reset 이 비우고 복원이 되살린다).
    expect(applyChips(["domain:growth", "mine"], plan)).toEqual(["domain:growth", "mine"]);
  });

  test("현재 모드와 같은 mode 파라미터: 전환 없음 — intent preserve", () => {
    const plan = planCaptureParamConsumption({
      modeParam: "journal",
      tagParam: undefined,
      currentMode: "journal",
      consumedKey: null,
    });
    expect(plan.targetMode).toBeNull();
    expect(plan.intent).toEqual({ kind: "preserve" });
  });

  test("latch: 같은 key 는 재소비하지 않고, 파라미터 공백이 latch 를 푼 뒤엔 같은 tag 도 새 배달로 소비한다", () => {
    const first = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(first.consumeKey).toBe(":domain:growth");

    const repeat = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: first.consumeKey,
    });
    expect(repeat.consumeKey).toBeNull();
    expect(repeat.releaseLatch).toBe(false);

    const emptied = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: undefined,
      currentMode: "journal",
      consumedKey: first.consumeKey,
    });
    expect(emptied.releaseLatch).toBe(true);
    expect(emptied.consumeKey).toBeNull();

    const redelivered = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "domain:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(redelivered.consumeKey).toBe(":domain:growth");
    expect(redelivered.intent).toEqual({ kind: "set", domain: "growth" });
  });

  test("유효 별 → 일반 tag 전이: clear — intent 해제 + domain 칩 제거, 일반 칩만 남는다", () => {
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
    expect(ordinary.intent).toEqual({ kind: "clear" });
    // downstream tags(enqueueAutoReasoningRecord 등)에 stale domain 이 없다.
    expect(applyChips(chips, ordinary)).toEqual(["meeting-notes"]);
  });

  test("유효 별 → 무효 reserved 전이: clear, 오해를 부르는 칩도 남기지 않는다", () => {
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
    expect(invalid.intent).toEqual({ kind: "clear" });
    expect(invalid.appendChip).toBeNull();
    expect(applyChips(chips, invalid)).toEqual([]);
  });

  test("mode+일반 tag 동시 배달: clear 는 전환을 가로질러 집행된다 (초안의 별도 대체)", () => {
    // 회귀(P2): memo → ?mode=journal&tag=meeting-notes, 저장된 journal 초안에
    // domainIntent=finance. 전환의 초안 복원이 finance pair 를 되살려도, 명시적
    // tag 배달의 clear 가 그 위에서 집행돼야 한다 — defer 와 뭉개면 못 지운다.
    const plan = planCaptureParamConsumption({
      modeParam: "journal",
      tagParam: "meeting-notes",
      currentMode: "memo",
      consumedKey: null,
    });
    expect(plan.targetMode).toBe("journal");
    expect(plan.intent).toEqual({ kind: "clear" });
    expect(plan.appendChip).toBe("meeting-notes");
    // 복원이 되살린 finance 칩 위에 clear 집행 → domain 칩 0 + 일반 칩만.
    expect(applyChips(["domain:finance"], plan)).toEqual(["meeting-notes"]);
  });

  test("mode+무효 reserved 동시 배달: clear, 칩 없음", () => {
    const plan = planCaptureParamConsumption({
      modeParam: "journal",
      tagParam: "domain:hacker",
      currentMode: "memo",
      consumedKey: null,
    });
    expect(plan.targetMode).toBe("journal");
    expect(plan.intent).toEqual({ kind: "clear" });
    expect(plan.appendChip).toBeNull();
    expect(applyChips(["domain:finance"], plan)).toEqual([]);
  });

  test("reserved 판정은 대소문자를 무시하고, 유효 별 칩은 정본 표기로 단다", () => {
    // insert 의 stripDomainTags 와 같은 규약 — 표기가 달라도 같은 운명이어야 한다.
    const upper = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "DOMAIN:growth",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(upper.intent).toEqual({ kind: "set", domain: "growth" });
    expect(upper.appendChip).toBe("domain:growth");

    const upperInvalid = planCaptureParamConsumption({
      modeParam: undefined,
      tagParam: "DOMAIN:hacker",
      currentMode: "journal",
      consumedKey: null,
    });
    expect(upperInvalid.intent).toEqual({ kind: "clear" });
    expect(upperInvalid.appendChip).toBeNull();
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

describe("planSharedConsumption — shared + mode 원자 소비 (데이터 소실 방지)", () => {
  const JOURNAL_DRAFT = {
    body: "소중한 일기",
    topic: "지킬 것",
    conclusion: "",
    domainIntent: "growth" as const,
  };
  const EMPTY_LIVE = { body: "", topic: "", conclusion: "" };

  test("콜드 스타트 회귀: 기존 journal 초안 + text+ocr — journal 초안이 살아남고 요청 composer 가 텍스트를 받는다", () => {
    // hydration 복원이 share 때문에 건너뛰어졌다(restoreSkipped): live 는 빈
    // 껍데기다. 이걸 폴드하면 journal 초안이 지워진다 — 계획은 폴드하지 않는다.
    const plan = planSharedConsumption({
      drafts: { journal: JOURNAL_DRAFT },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      restoreSkipped: true,
      content: "공유된 OCR 캡션",
      modeParam: "ocr",
    });
    expect(plan.drafts.journal).toEqual(JOURNAL_DRAFT);
    expect(plan.mode).toBe("ocr");
    expect(plan.liveBody).toBe("공유된 OCR 캡션");
    expect(plan.drafts.ocr?.body).toBe("공유된 OCR 캡션");
    expect(plan.drafts.ocr?.ocrReviewApproved).toBe(false);
    expect(plan.persistMode).toBe("ocr");
    expect(plan.consumedModeParam).toBe("ocr");
  });

  test("text+voice: composer 는 voice, 내구 사본은 linkclip — journal 초안 무접촉", () => {
    const plan = planSharedConsumption({
      drafts: { journal: JOURNAL_DRAFT },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      restoreSkipped: true,
      content: "음성 메모 텍스트",
      modeParam: "voice",
    });
    expect(plan.mode).toBe("voice");
    expect(plan.liveBody).toBe("음성 메모 텍스트");
    expect(plan.drafts.linkclip?.body).toBe("음성 메모 텍스트");
    expect(plan.drafts.journal).toEqual(JOURNAL_DRAFT);
    expect(plan.persistMode).toBe("linkclip");
    expect(plan.consumedModeParam).toBe("voice");
  });

  test("mode 없음/무효면 오늘의 linkclip 폴드 그대로다", () => {
    for (const modeParam of [undefined, "not-a-mode"]) {
      const plan = planSharedConsumption({
        drafts: { linkclip: { body: "이전 클립", topic: "" } },
        liveDraft: EMPTY_LIVE,
        liveMode: "journal",
        restoreSkipped: true,
        content: "새 공유",
        modeParam,
      });
      expect(plan.mode).toBe("linkclip");
      expect(plan.liveBody).toBe("이전 클립\n\n새 공유");
      expect(plan.consumedModeParam).toBeNull();
    }
  });

  test("restoreSkipped=false 면 떠나는 모드의 live 를 기억한다 (기존 폴드 의미)", () => {
    const plan = planSharedConsumption({
      drafts: {},
      liveDraft: { body: "쓰던 메모", topic: "" },
      liveMode: "memo",
      restoreSkipped: false,
      content: "공유 텍스트",
      modeParam: "ocr",
    });
    expect(plan.drafts.memo?.body).toBe("쓰던 메모");
    expect(plan.drafts.ocr?.body).toBe("공유 텍스트");
  });

  test("journal 로의 공유는 기존 초안 아래에 덧붙이고 topic·별 intent 를 파괴하지 않는다", () => {
    const plan = planSharedConsumption({
      drafts: { journal: JOURNAL_DRAFT },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      restoreSkipped: true,
      content: "공유 문장",
      modeParam: "journal",
    });
    expect(plan.drafts.journal?.body).toBe("소중한 일기\n\n공유 문장");
    expect(plan.drafts.journal?.topic).toBe("지킬 것");
    expect(plan.drafts.journal?.domainIntent).toBe("growth");
  });

  test("ocr 초안에 본문이 합쳐지면 기존 승인은 무효가 된다", () => {
    const plan = planSharedConsumption({
      drafts: { ocr: { body: "승인된 텍스트", topic: "", ocrReviewApproved: true } },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      restoreSkipped: true,
      content: "추가 텍스트",
      modeParam: "ocr",
    });
    expect(plan.drafts.ocr?.body).toBe("승인된 텍스트\n\n추가 텍스트");
    expect(plan.drafts.ocr?.ocrReviewApproved).toBe(false);
  });
});
