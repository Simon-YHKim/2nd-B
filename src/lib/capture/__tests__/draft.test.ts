import {
  loadCaptureDraft,
  loadCaptureDraftState,
  planCaptureParamConsumption,
  planSharedConsumption,
  saveCaptureDraft,
  saveCaptureDraftState,
  sharedDeliveryKey,
  clearCaptureDraft,
  type CaptureParamPlan,
} from "../draft";
import { composeFourWBody, fourWHasContent } from "../fourw";

const mockNativeBacking = new Map<string, string>();
const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => mockNativeBacking.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockNativeBacking.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockNativeBacking.delete(key);
  }),
};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

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

async function withMockNativeStorage(run: () => Promise<void>): Promise<void> {
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  delete (globalThis as { localStorage?: unknown }).localStorage;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { product: "ReactNative" },
  });
  mockNativeBacking.clear();
  mockAsyncStorage.getItem.mockReset().mockImplementation(
    async (key: string) => mockNativeBacking.get(key) ?? null,
  );
  mockAsyncStorage.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
    mockNativeBacking.set(key, value);
  });
  mockAsyncStorage.removeItem.mockReset().mockImplementation(async (key: string) => {
    mockNativeBacking.delete(key);
  });
  try {
    await run();
  } finally {
    if (localDescriptor) Object.defineProperty(globalThis, "localStorage", localDescriptor);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
}

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

    await expect(clearCaptureDraft("u1", "memo")).resolves.toBe(true);

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

  test("voice/todo/4W1H typed drafts round-trip without flattening structure", async () => {
    const linkclip = { body: "https://kept.example", topic: "clip" };
    await saveCaptureDraftState("u1", {
      lastMode: "fourw",
      drafts: { linkclip },
      transientDrafts: {
        voice: { mode: "voice", body: "voice words", tags: ["mine"], domainIntent: "growth" },
        todo: { mode: "todo", body: "ship it", todoDone: true, domainIntent: "career" },
        fourw: {
          mode: "fourw",
          fourw: { who: "나", when: "오늘", where: "집", what: "회고", how: "글로" },
          tags: ["weekly"],
          domainIntent: "health",
        },
      },
    });

    await expect(loadCaptureDraftState("u1")).resolves.toEqual({
      lastMode: "fourw",
      drafts: {
        linkclip: {
          body: "https://kept.example",
          topic: "clip",
          conclusion: "",
          ocrReviewApproved: false,
        },
      },
      transientDrafts: {
        voice: { mode: "voice", body: "voice words", tags: ["mine"], domainIntent: "growth" },
        todo: { mode: "todo", body: "ship it", todoDone: true, domainIntent: "career" },
        fourw: {
          mode: "fourw",
          fourw: { who: "나", when: "오늘", where: "집", what: "회고", how: "글로" },
          tags: ["weekly"],
          domainIntent: "health",
        },
      },
    });
  });

  test("tampered transient drafts are normalized and an orphan transient lastMode falls back", async () => {
    localStorage.setItem(
      "capture.drafts.v2.u1",
      JSON.stringify({
        lastMode: "todo",
        drafts: {},
        transientDrafts: {
          voice: { mode: "todo", body: "wrong discriminant" },
          todo: { mode: "todo", body: "   ", todoDone: "yes" },
          fourw: {
            mode: "fourw",
            fourw: { who: 7, when: "오늘", where: null, what: "검증", how: false },
            tags: ["keep", "keep", "domain:growth", 9],
            domainIntent: "hacker",
          },
        },
      }),
    );

    await expect(loadCaptureDraftState("u1")).resolves.toEqual({
      lastMode: "journal",
      drafts: {},
      transientDrafts: {
        fourw: {
          mode: "fourw",
          fourw: { who: "", when: "오늘", where: "", what: "검증", how: "" },
          tags: ["keep"],
        },
      },
    });
  });

  test("4W1H은 필수 What을 나중에 쓰더라도 먼저 채운 다른 칸을 초안으로 지킨다", async () => {
    await saveCaptureDraftState("u1", {
      lastMode: "fourw",
      drafts: {},
      transientDrafts: {
        fourw: {
          mode: "fourw",
          fourw: { who: "동료", when: "", where: "", what: "", how: "" },
        },
      },
    });
    await expect(loadCaptureDraftState("u1")).resolves.toEqual({
      lastMode: "fourw",
      drafts: {},
      transientDrafts: {
        fourw: {
          mode: "fourw",
          fourw: { who: "동료", when: "", where: "", what: "", how: "" },
        },
      },
    });
  });

  test("adding and clearing a transient draft never repurposes or rewrites linkclip", async () => {
    const linkclip = { body: "# Original\n\nhttps://kept.example", topic: "keep", tags: ["source"] };
    await saveCaptureDraftState("u1", {
      lastMode: "voice",
      drafts: { linkclip },
      transientDrafts: { voice: { mode: "voice", body: "temporary voice" } },
    });
    const withVoice = await loadCaptureDraftState("u1");
    expect(withVoice.drafts.linkclip).toEqual({
      ...linkclip,
      conclusion: "",
      ocrReviewApproved: false,
    });

    await saveCaptureDraftState("u1", {
      drafts: withVoice.drafts,
      transientDrafts: {},
      lastMode: "journal",
    });
    const cleared = await loadCaptureDraftState("u1");
    expect(cleared.drafts.linkclip).toEqual(withVoice.drafts.linkclip);
    expect(cleared.transientDrafts).toBeUndefined();
  });
});

describe("native AsyncStorage queue and durable acknowledgement", () => {
  test("a transient hydration read failure rejects instead of authorizing an empty overwrite", async () => {
    await withMockNativeStorage(async () => {
      const userId = "hydrate-retry";
      mockNativeBacking.set(`capture.drafts.v2.${userId}`, JSON.stringify({
        drafts: { memo: { body: "must survive", topic: "" } },
        lastMode: "memo",
      }));
      mockAsyncStorage.getItem
        .mockRejectedValueOnce(new Error("temporary read failure"))
        .mockImplementation(async (key: string) => mockNativeBacking.get(key) ?? null);

      await expect(loadCaptureDraftState(userId)).rejects.toThrow("temporary read failure");
      await expect(loadCaptureDraftState(userId)).resolves.toEqual({
        drafts: {
          memo: {
            body: "must survive",
            topic: "",
            conclusion: "",
            ocrReviewApproved: false,
          },
        },
        lastMode: "memo",
      });
    });
  });

  test("slow clear cannot land after a newer full-state save for the same user", async () => {
    await withMockNativeStorage(async () => {
      const userId = "queue-clear";
      const key = `capture.drafts.v2.${userId}`;
      mockNativeBacking.set(key, JSON.stringify({
        lastMode: "memo",
        drafts: { memo: { body: "old memo", topic: "" } },
      }));

      let releaseFirst!: () => void;
      let markFirstStarted!: () => void;
      const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
      const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
      mockAsyncStorage.setItem
        .mockImplementationOnce(async (writeKey: string, value: string) => {
          markFirstStarted();
          await firstGate;
          mockNativeBacking.set(writeKey, value);
        })
        .mockImplementation(async (writeKey: string, value: string) => {
          mockNativeBacking.set(writeKey, value);
        });

      const clear = clearCaptureDraft(userId, "memo");
      await firstStarted;
      const save = saveCaptureDraftState(userId, {
        drafts: {},
        transientDrafts: { voice: { mode: "voice", body: "new voice" } },
        lastMode: "voice",
      });
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
      releaseFirst();
      await expect(clear).resolves.toBe(true);
      await expect(save).resolves.toBe(true);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(2);
      await expect(loadCaptureDraftState(userId)).resolves.toEqual({
        drafts: {},
        transientDrafts: { voice: { mode: "voice", body: "new voice" } },
        lastMode: "voice",
      });
    });
  });

  test("a failed write reports false and does not poison the next queued save", async () => {
    await withMockNativeStorage(async () => {
      const userId = "queue-failure";
      mockAsyncStorage.setItem
        .mockRejectedValueOnce(new Error("disk full"))
        .mockImplementation(async (key: string, value: string) => {
          mockNativeBacking.set(key, value);
        });
      const failed = saveCaptureDraftState(userId, {
        drafts: { memo: { body: "A", topic: "" } },
        lastMode: "memo",
      });
      const recovered = saveCaptureDraftState(userId, {
        drafts: { memo: { body: "B", topic: "" } },
        lastMode: "memo",
      });
      await expect(failed).resolves.toBe(false);
      await expect(recovered).resolves.toBe(true);
      expect((await loadCaptureDraftState(userId)).drafts.memo?.body).toBe("B");
    });
  });

  test("a failed clear reports false and does not poison the next queued clear", async () => {
    await withMockNativeStorage(async () => {
      const userId = "queue-clear-failure";
      mockNativeBacking.set(`capture.drafts.v2.${userId}`, JSON.stringify({
        drafts: {
          memo: { body: "old", topic: "" },
          file: { body: "keep", topic: "" },
        },
        lastMode: "file",
      }));
      mockAsyncStorage.setItem
        .mockRejectedValueOnce(new Error("disk full"))
        .mockImplementation(async (key: string, value: string) => {
          mockNativeBacking.set(key, value);
        });

      await expect(clearCaptureDraft(userId, "memo")).resolves.toBe(false);
      await expect(clearCaptureDraft(userId, "memo")).resolves.toBe(true);
      const state = await loadCaptureDraftState(userId);
      expect(state.drafts.memo).toBeUndefined();
      expect(state.drafts.file?.body).toBe("keep");
    });
  });

  test("a blocked user queue does not block another user's draft", async () => {
    await withMockNativeStorage(async () => {
      let releaseUserOne!: () => void;
      let markUserOneStarted!: () => void;
      const userOneGate = new Promise<void>((resolve) => { releaseUserOne = resolve; });
      const userOneStarted = new Promise<void>((resolve) => { markUserOneStarted = resolve; });
      mockAsyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
        if (key.endsWith("user-one")) {
          markUserOneStarted();
          await userOneGate;
        }
        mockNativeBacking.set(key, value);
      });
      const userOne = saveCaptureDraftState("user-one", {
        drafts: { memo: { body: "one", topic: "" } },
        lastMode: "memo",
      });
      await userOneStarted;
      await expect(saveCaptureDraftState("user-two", {
        drafts: { memo: { body: "two", topic: "" } },
        lastMode: "memo",
      })).resolves.toBe(true);
      releaseUserOne();
      await expect(userOne).resolves.toBe(true);
    });
  });

  test("clearing a non-journal mode migrates and preserves a legacy journal", async () => {
    await withMockNativeStorage(async () => {
      const userId = "legacy-native";
      mockNativeBacking.set(
        `capture.journalDraft.v1.${userId}`,
        JSON.stringify({ body: "legacy journal", topic: "kept" }),
      );
      await clearCaptureDraft(userId, "memo");
      expect((await loadCaptureDraftState(userId)).drafts.journal?.body).toBe("legacy journal");
    });
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

  test("일반 칩(tags)도 초안과 왕복한다 — 라우트 tag 가 재마운트에서 살아남는 길", async () => {
    saveCaptureDraftState("u1", {
      lastMode: "journal",
      drafts: { journal: { body: "본문", topic: "", tags: ["rising-interest", "mine"] } },
    });
    const state = await loadCaptureDraftState("u1");
    expect(state.drafts.journal?.tags).toEqual(["rising-interest", "mine"]);
  });

  test("저장된 칩은 정화된다: 비문자열·공백·domain:*·중복 제거, 10개 상한", async () => {
    localStorage.setItem(
      "capture.drafts.v2.u1",
      JSON.stringify({
        lastMode: "journal",
        drafts: {
          journal: {
            body: "본문",
            topic: "",
            tags: [
              "keep", "keep", "  ", 7, "domain:finance", "DOMAIN:growth",
              "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10",
            ],
          },
        },
      }),
    );
    const state = await loadCaptureDraftState("u1");
    // domain 칩은 저장 표면에서 걷힌다 — domainIntent 만이 별의 단일 원천이다.
    // 상한 10개는 addTagFromInput 의 상한과 같다.
    expect(state.drafts.journal?.tags).toEqual([
      "keep", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9",
    ]);
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

  test("일반 tag 10개가 찬 초안은 route의 11번째 칩을 저장하지 않는다", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag-${i + 1}`);
    const journal = planCaptureParamConsumption({
      modeParam: "journal",
      tagParam: "overflow",
      currentMode: "journal",
      consumedKey: null,
      currentDraft: { body: "본문", topic: "", tags },
    });
    expect(journal.durableDraftUpdate?.draft.tags).toEqual(tags);

    const voiceDraft = { mode: "voice" as const, body: "본문", tags };
    const voice = planCaptureParamConsumption({
      modeParam: "voice",
      tagParam: "overflow",
      currentMode: "voice",
      consumedKey: null,
      currentTransient: voiceDraft,
    });
    expect(voice.durableTransientUpdate?.draft.tags).toEqual(tags);
  });

  test.each([
    ["domain:health", "health"],
    ["meeting-notes", null],
    ["domain:hacker", null],
  ] as const)(
    "분류된 journal 초안은 다른/일반/무효 tag(%s)로 재분류되지 않는다",
    (tagParam, incoming) => {
      const currentDraft = {
        body: "finance draft",
        topic: "",
        conclusion: "",
        domainIntent: "finance" as const,
        tags: ["keep"],
      };
      const plan = planCaptureParamConsumption({
        modeParam: "journal",
        tagParam,
        currentMode: "journal",
        consumedKey: null,
        drafts: { journal: currentDraft },
        currentDraft,
      });
      expect(plan.targetMode).toBeNull();
      expect(plan.intent).toEqual({ kind: "preserve" });
      expect(plan.journalConflict).toEqual({ existing: "finance", incoming });
      expect(plan.durableDraftUpdate).toBeNull();
      expect(plan.appendChip).toBeNull();
    },
  );

  test("같은 별 param은 기존 journal 본문·칩을 보존한 durable snapshot을 만든다", () => {
    const currentDraft = {
      body: "finance draft",
      topic: "topic",
      conclusion: "done",
      domainIntent: "finance" as const,
      tags: ["keep"],
    };
    const plan = planCaptureParamConsumption({
      modeParam: "journal",
      tagParam: "domain:finance",
      currentMode: "journal",
      consumedKey: null,
      drafts: { journal: currentDraft },
      currentDraft,
    });
    expect(plan.journalConflict).toBeNull();
    expect(plan.durableDraftUpdate).toEqual({ mode: "journal", draft: currentDraft });
  });

  test("transient 초안도 별 충돌은 보존하고 같은 별은 durable update한다", () => {
    const voice = {
      mode: "voice" as const,
      body: "live voice",
      tags: ["keep"],
      domainIntent: "growth" as const,
    };
    const conflict = planCaptureParamConsumption({
      modeParam: "voice",
      tagParam: "domain:health",
      currentMode: "voice",
      consumedKey: null,
      transientDrafts: { voice },
      currentTransient: voice,
    });
    expect(conflict.journalConflict).toEqual({ existing: "growth", incoming: "health" });
    expect(conflict.durableTransientUpdate).toBeNull();

    const same = planCaptureParamConsumption({
      modeParam: "voice",
      tagParam: "domain:growth",
      currentMode: "voice",
      consumedKey: null,
      transientDrafts: { voice },
      currentTransient: voice,
    });
    expect(same.journalConflict).toBeNull();
    expect(same.durableTransientUpdate).toEqual({ mode: "voice", draft: voice });
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
        currentMode: "journal",
        liveFourw: null,
        restoreSkipped: true,
      content: "공유된 OCR 캡션",
      modeParam: "ocr",
      tagParam: undefined,
    });
    expect(plan.drafts.journal).toEqual(JOURNAL_DRAFT);
    expect(plan.mode).toBe("ocr");
    expect(plan.liveBody).toBe("공유된 OCR 캡션");
    expect(plan.drafts.ocr?.body).toBe("공유된 OCR 캡션");
    expect(plan.drafts.ocr?.ocrReviewApproved).toBe(false);
    expect(plan.persistMode).toBe("ocr");
    expect(plan.consumedModeParam).toBe("ocr");
  });

  test("text+voice: composer와 typed voice 초안이 같고 linkclip·journal은 무접촉", () => {
    const plan = planSharedConsumption({
      drafts: { journal: JOURNAL_DRAFT },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "음성 메모 텍스트",
      modeParam: "voice",
      tagParam: undefined,
    });
    expect(plan.mode).toBe("voice");
    expect(plan.liveBody).toBe("음성 메모 텍스트");
    expect(plan.liveFourw).toBeNull();
    expect(plan.transientDrafts.voice).toEqual({ mode: "voice", body: "음성 메모 텍스트" });
    expect(plan.drafts.linkclip).toBeUndefined();
    expect(plan.drafts.journal).toEqual(JOURNAL_DRAFT);
    expect(plan.persistMode).toBe("voice");
    expect(plan.consumedModeParam).toBe("voice");
  });

  test("text+fourw: payload 가 필수 칸(무엇을)에 실려 보이고 저장 가능하다", () => {
    // 4W1H composer/submit 은 body 가 아니라 다섯 칸 state 만 읽는다 — body 에만
    // 실으면 화면에도 저장에도 안 나타난다 (P2 회귀).
    const plan = planSharedConsumption({
      drafts: {},
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "공유된 4W1H 재료",
      modeParam: "fourw",
      tagParam: undefined,
    });
    expect(plan.mode).toBe("fourw");
    expect(plan.liveFourw).toEqual({ who: "", when: "", where: "", what: "공유된 4W1H 재료", how: "" });
    expect(fourWHasContent(plan.liveFourw!)).toBe(true);
    expect(composeFourWBody(plan.liveFourw!, "ko")).toContain("공유된 4W1H 재료");
    expect(plan.transientDrafts.fourw).toEqual({
      mode: "fourw",
      fourw: { who: "", when: "", where: "", what: "공유된 4W1H 재료", how: "" },
    });
    expect(plan.drafts.linkclip).toBeUndefined();
    expect(plan.persistMode).toBe("fourw");
  });

  test("mode 없음/무효면 오늘의 linkclip 폴드 그대로다", () => {
    for (const modeParam of [undefined, "not-a-mode"]) {
      const plan = planSharedConsumption({
        drafts: { linkclip: { body: "이전 클립", topic: "" } },
        liveDraft: EMPTY_LIVE,
        liveMode: "journal",
        currentMode: "journal",
        liveFourw: null,
        restoreSkipped: true,
        content: "새 공유",
        modeParam,
        tagParam: undefined,
      });
      expect(plan.mode).toBe("linkclip");
      expect(plan.liveBody).toBe("이전 클립\n\n새 공유");
      expect(plan.consumedModeParam).toBe(modeParam ?? null);
    }
  });

  test("restoreSkipped=false 면 떠나는 모드의 live 를 기억한다 (기존 폴드 의미)", () => {
    const plan = planSharedConsumption({
      drafts: {},
      liveDraft: { body: "쓰던 메모", topic: "" },
      liveMode: "memo",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: false,
      content: "공유 텍스트",
      modeParam: "ocr",
      tagParam: undefined,
    });
    expect(plan.drafts.memo?.body).toBe("쓰던 메모");
    expect(plan.drafts.ocr?.body).toBe("공유 텍스트");
  });

  test("journal 로의 공유는 기존 초안 아래에 덧붙이고 topic·별 intent 를 파괴하지 않는다", () => {
    const plan = planSharedConsumption({
      drafts: { journal: JOURNAL_DRAFT },
      liveDraft: JOURNAL_DRAFT,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: false,
      content: "공유 문장",
      modeParam: "journal",
      tagParam: undefined,
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
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "추가 텍스트",
      modeParam: "ocr",
      tagParam: undefined,
    });
    expect(plan.drafts.ocr?.body).toBe("승인된 텍스트\n\n추가 텍스트");
    expect(plan.drafts.ocr?.ocrReviewApproved).toBe(false);
  });

  // ── tag 동반 통합 회귀 (P1: 이중 전환으로 공유 텍스트가 사라지던 경로) ──
  // 유효 별 intent 는 최종 모드를 바꾸므로 planner 가 미리 반영해야 한다 —
  // sources 에 폴드한 뒤 param effect 가 journal 로 끌고 가면 텍스트가 화면에서
  // 사라지고, 복원된 기존 journal 초안이 별 아래 잘못 제출될 수 있다.

  test("text+ocr+유효 별: effective target 은 journal — content 가 보이고 journal 초안에 병합된다", () => {
    const plan = planSharedConsumption({
      drafts: { journal: JOURNAL_DRAFT },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "공유 X",
      modeParam: "ocr",
      tagParam: "domain:growth",
    });
    expect(plan.mode).toBe("journal");
    expect(plan.liveBody).toBe("소중한 일기\n\n공유 X");
    expect(plan.drafts.journal?.body).toBe("소중한 일기\n\n공유 X");
    // atomic intent: 같은 별이면 폴드와 같은 계획에 도장이 실려 즉시 영속된다.
    expect(plan.drafts.journal?.domainIntent).toBe("growth");
    expect(plan.starConflict).toBeNull();
    expect(plan.consumedTagParam).toBe("domain:growth");
    expect(plan.liveDomainIntent).toBe("growth");
    expect(plan.liveTags).toContain("domain:growth");
    expect(plan.drafts.ocr).toBeUndefined();
    // mode 파라미터는 소비됐다 (latch) — target 이 덮어써져도 URL 은 걷는다.
    expect(plan.consumedModeParam).toBe("ocr");
  });

  test("별 충돌(P1): 기존 journal 의 다른 별은 병합·재분류하지 않는다 — payload 는 요청 모드로, tag 는 소비", () => {
    // persisted journal {finance} + ?text&mode=ocr&tag=domain:health — 합치면
    // 기존 재정 초안까지 health 로 오분류된다. 절대 병합 금지.
    const financeDraft = { body: "세금 정리", topic: "", conclusion: "", domainIntent: "finance" as const };
    const plan = planSharedConsumption({
      drafts: { journal: financeDraft },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "운동 메모",
      modeParam: "ocr",
      tagParam: "domain:health",
    });
    // 기존 초안은 한 글자도 안 바뀐다.
    expect(plan.drafts.journal).toEqual(financeDraft);
    // payload 는 요청 sources 모드로 간다.
    expect(plan.mode).toBe("ocr");
    expect(plan.drafts.ocr?.body).toBe("운동 메모");
    // star tag 는 여기서 소비돼 param effect 의 journal 재전환·재분류를 막는다.
    expect(plan.consumedTagParam).toBe("domain:health");
    expect(plan.starConflict).toEqual({ existing: "finance", incoming: "health" });
  });

  test("별 충돌 (무 mode): payload 는 linkclip 으로 폴백한다", () => {
    const financeDraft = { body: "세금 정리", topic: "", conclusion: "", domainIntent: "finance" as const };
    const plan = planSharedConsumption({
      drafts: { journal: financeDraft },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "운동 메모",
      modeParam: undefined,
      tagParam: "domain:health",
    });
    expect(plan.drafts.journal).toEqual(financeDraft);
    expect(plan.mode).toBe("linkclip");
    expect(plan.drafts.linkclip?.body).toBe("운동 메모");
    expect(plan.consumedTagParam).toBe("domain:health");
    expect(plan.starConflict).toEqual({ existing: "finance", incoming: "health" });
  });

  test("별 충돌 (명시 journal): journal 로 되돌아가지 않고 linkclip 으로 피한다", () => {
    const financeDraft = { body: "세금 정리", topic: "", conclusion: "", domainIntent: "finance" as const };
    const plan = planSharedConsumption({
      drafts: { journal: financeDraft },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "운동 메모",
      modeParam: "journal",
      tagParam: "domain:health",
    });
    expect(plan.drafts.journal).toEqual(financeDraft);
    expect(plan.mode).toBe("linkclip");
    expect(plan.drafts.linkclip?.body).toBe("운동 메모");
  });

  test("별 충돌: intent 없는 persisted journal 본문도 새 별로 통째로 재분류하지 않는다", () => {
    const unclassified = { body: "아직 분류하지 않은 생각", topic: "", conclusion: "" };
    const plan = planSharedConsumption({
      drafts: { journal: unclassified },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "건강 메모",
      modeParam: undefined,
      tagParam: "domain:health",
    });
    expect(plan.drafts.journal).toEqual(unclassified);
    expect(plan.mode).toBe("linkclip");
    expect(plan.starConflict).toEqual({ existing: null, incoming: "health" });
  });

  test("별 충돌: debounce 전 live journal 이 persisted 사본보다 우선한다", () => {
    const liveJournal = { body: "방금 쓰기 시작한 무분류 문장", topic: "", conclusion: "" };
    const plan = planSharedConsumption({
      drafts: {},
      liveDraft: liveJournal,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: false,
      content: "건강 메모",
      modeParam: "ocr",
      tagParam: "domain:health",
    });
    expect(plan.drafts.journal).toEqual(liveJournal);
    expect(plan.mode).toBe("ocr");
    expect(plan.starConflict).toEqual({ existing: null, incoming: "health" });
  });

  test("fourw 재배달(P2): 같은 모드에서 채워 둔 다섯 칸을 지우지 않고 what 에만 덧붙인다", () => {
    const filled = { who: "동료", when: "어제", where: "회의실", what: "회고", how: "대화로" };
    const input = {
      drafts: {},
      liveDraft: EMPTY_LIVE,
      liveMode: "journal" as const,
      currentMode: "fourw" as const,
      liveFourw: filled,
      liveTags: ["keep", "domain:finance"],
      liveDomainIntent: "finance" as const,
      restoreSkipped: false,
      content: "추가 공유",
      modeParam: "fourw",
      tagParam: undefined,
    };
    const plan = planSharedConsumption(input);
    expect(plan.liveFourw).toEqual({ ...filled, what: "회고\n\n추가 공유" });
    expect(plan.liveTags).toEqual(["keep", "domain:finance"]);
    expect(plan.liveDomainIntent).toBe("finance");
    // immutability: 입력 스냅샷은 변형되지 않는다.
    expect(filled.what).toBe("회고");
    // 중복 배달은 그대로 (body 병합과 같은 규칙).
    const dup = planSharedConsumption({ ...input, liveFourw: { ...filled, what: "회고\n\n추가 공유" } });
    expect(dup.liveFourw?.what).toBe("회고\n\n추가 공유");
  });

  test("같은 voice로 A→B를 공유하면 live A와 B를 합치고 기존 linkclip은 그대로 둔다", () => {
    const linkclip = { body: "https://original.example", topic: "keep" };
    const plan = planSharedConsumption({
      drafts: { linkclip },
      transientDrafts: {},
      liveDraft: EMPTY_LIVE,
      liveMode: "linkclip",
      currentMode: "voice",
      liveBody: "A voice",
      liveTodoDone: false,
      liveFourw: null,
      liveTags: ["keep"],
      liveDomainIntent: "growth",
      restoreSkipped: false,
      content: "B voice",
      modeParam: "voice",
      tagParam: undefined,
    });
    expect(plan.liveBody).toBe("A voice\n\nB voice");
    expect(plan.transientDrafts.voice).toEqual({
      mode: "voice",
      body: "A voice\n\nB voice",
      tags: ["keep"],
      domainIntent: "growth",
    });
    expect(plan.drafts.linkclip).toEqual(linkclip);
  });

  test("todo에 새 payload가 붙을 때만 done을 해제하고 정확한 중복이면 유지한다", () => {
    const appended = planSharedConsumption({
      drafts: {},
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "todo",
      liveBody: "A todo",
      liveTodoDone: true,
      liveFourw: null,
      restoreSkipped: false,
      content: "B todo",
      modeParam: "todo",
      tagParam: undefined,
    });
    expect(appended.liveBody).toBe("A todo\n\nB todo");
    expect(appended.liveTodoDone).toBe(false);
    expect(appended.transientDrafts.todo).toEqual({
      mode: "todo",
      body: "A todo\n\nB todo",
      todoDone: false,
    });

    const duplicate = planSharedConsumption({
      drafts: {},
      transientDrafts: { todo: { mode: "todo", body: "A todo", todoDone: true } },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "A todo",
      modeParam: "todo",
      tagParam: undefined,
    });
    expect(duplicate.liveBody).toBe("A todo");
    expect(duplicate.liveTodoDone).toBe(true);
  });

  test("transient map은 다른 모드 초안을 보존한 채 목표 모드만 추가한다", () => {
    const voice = { mode: "voice" as const, body: "voice kept" };
    const todo = { mode: "todo" as const, body: "todo kept", todoDone: true };
    const plan = planSharedConsumption({
      drafts: {},
      transientDrafts: { voice, todo },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "new fourw",
      modeParam: "fourw",
      tagParam: undefined,
    });
    expect(plan.transientDrafts.voice).toEqual(voice);
    expect(plan.transientDrafts.todo).toEqual(todo);
    expect(plan.transientDrafts.fourw?.mode).toBe("fourw");
  });

  test("중복 판정은 문단 전체만 본다 — substring은 새 조각으로 덧붙인다", () => {
    const journal = planSharedConsumption({
      drafts: { journal: { body: "alphabet soup", topic: "" } },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "alpha",
      modeParam: "journal",
      tagParam: undefined,
    });
    expect(journal.liveBody).toBe("alphabet soup\n\nalpha");

    const exact = planSharedConsumption({
      drafts: { journal: { body: "before\n\nalpha\n\nafter", topic: "" } },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "alpha",
      modeParam: "journal",
      tagParam: undefined,
    });
    expect(exact.liveBody).toBe("before\n\nalpha\n\nafter");

    const fourw = planSharedConsumption({
      drafts: {},
      transientDrafts: {
        fourw: {
          mode: "fourw",
          fourw: { who: "", when: "", where: "", what: "alphabet soup", how: "" },
        },
      },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "alpha",
      modeParam: "fourw",
      tagParam: undefined,
    });
    expect(fourw.liveFourw?.what).toBe("alphabet soup\n\nalpha");
  });

  test.each(["meeting-notes", "domain:hacker"])(
    "분류된 journal에 명시 journal+%s 공유가 와도 원본을 지키고 linkclip으로 피한다",
    (tagParam) => {
      const financeDraft = { ...JOURNAL_DRAFT, domainIntent: "finance" as const };
      const plan = planSharedConsumption({
        drafts: { journal: financeDraft },
        liveDraft: EMPTY_LIVE,
        liveMode: "journal",
        currentMode: "journal",
        liveFourw: null,
        restoreSkipped: true,
        content: "new material",
        modeParam: "journal",
        tagParam,
      });
      expect(plan.drafts.journal).toEqual(financeDraft);
      expect(plan.mode).toBe("linkclip");
      expect(plan.drafts.linkclip?.body).toBe("new material");
      expect(plan.starConflict).toEqual({ existing: "finance", incoming: null });
    },
  );

  test("분류된 todo 초안에 다른 별 공유가 오면 todo를 그대로 두고 linkclip으로 피한다", () => {
    const todo = {
      mode: "todo" as const,
      body: "세금 내기",
      todoDone: true,
      tags: ["urgent"],
      domainIntent: "finance" as const,
    };
    const linkclip = { body: "기존 클립", topic: "" };
    const plan = planSharedConsumption({
      drafts: { linkclip },
      transientDrafts: { todo },
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "운동 예약",
      modeParam: "todo",
      tagParam: "domain:health",
    });
    expect(plan.starConflict).toEqual({ existing: "finance", incoming: "health" });
    expect(plan.mode).toBe("linkclip");
    expect(plan.persistMode).toBe("linkclip");
    expect(plan.transientDrafts.todo).toEqual(todo);
    expect(plan.drafts.linkclip?.body).toBe("기존 클립\n\n운동 예약");
    expect(plan.liveDomainIntent).toBeNull();
    expect(plan.liveTodoDone).toBe(false);
    expect(plan.consumedTagParam).toBe("domain:health");
  });

  test("text+유효 별(무 mode): linkclip 이 아니라 journal 로 간다", () => {
    const plan = planSharedConsumption({
      drafts: {},
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "별 공유",
      modeParam: undefined,
      tagParam: "domain:growth",
    });
    expect(plan.mode).toBe("journal");
    expect(plan.drafts.journal?.body).toBe("별 공유");
    // 빈 journal(기존 별 없음)에는 배달된 별이 atomic 하게 도장된다.
    expect(plan.drafts.journal?.domainIntent).toBe("growth");
    expect(plan.starConflict).toBeNull();
    expect(plan.drafts.linkclip).toBeUndefined();
    expect(plan.consumedModeParam).toBeNull();
    expect(plan.consumedTagParam).toBe("domain:growth");
    expect(plan.liveTags).toContain("domain:growth");
  });

  test("sharedDeliveryKey: 같은 content 라도 mode/tag 가 다르면 다른 배달이다 (A→B 무공백 재배달)", () => {
    const a = sharedDeliveryKey("k1", "ocr", "domain:growth");
    const b = sharedDeliveryKey("k1", "voice", "domain:growth");
    const c = sharedDeliveryKey("k1", "ocr", "domain:health");
    const same = sharedDeliveryKey("k1", "ocr", "domain:growth");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(same);
    // 파라미터 부재는 빈 슬롯으로 안정적으로 직렬화된다.
    expect(sharedDeliveryKey("k1", undefined, undefined)).toBe(sharedDeliveryKey("k1", undefined, undefined));
  });

  test("text+ocr+일반 tag: 모드는 그대로 ocr — 일반/무효 tag 는 모드에 영향이 없다", () => {
    const plan = planSharedConsumption({
      drafts: {},
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "OCR 공유",
      modeParam: "ocr",
      tagParam: "meeting-notes",
    });
    expect(plan.mode).toBe("ocr");
    expect(plan.drafts.ocr?.body).toBe("OCR 공유");
    expect(plan.drafts.ocr?.tags).toEqual(["meeting-notes"]);
    expect(plan.liveTags).toEqual(["meeting-notes"]);
    expect(plan.liveDomainIntent).toBeNull();
    expect(plan.consumedTagParam).toBe("meeting-notes");
  });

  test("text+fourw+유효 별: records 계열 요청은 유지 — fourw 시드가 그대로 실린다", () => {
    const plan = planSharedConsumption({
      drafts: {},
      liveDraft: EMPTY_LIVE,
      liveMode: "journal",
      currentMode: "journal",
      liveFourw: null,
      restoreSkipped: true,
      content: "4W1H 공유",
      modeParam: "fourw",
      tagParam: "domain:growth",
    });
    expect(plan.mode).toBe("fourw");
    expect(plan.liveFourw?.what).toBe("4W1H 공유");
    expect(plan.transientDrafts.fourw).toEqual({
      mode: "fourw",
      fourw: { who: "", when: "", where: "", what: "4W1H 공유", how: "" },
      domainIntent: "growth",
    });
    expect(plan.drafts.linkclip).toBeUndefined();
    expect(plan.liveDomainIntent).toBe("growth");
    expect(plan.liveTags).toContain("domain:growth");
    expect(plan.consumedTagParam).toBe("domain:growth");
  });
});
