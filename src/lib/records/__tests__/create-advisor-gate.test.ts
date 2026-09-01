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
    // planner 가 tag 를 알아야 유효 별 동반 시 이중 전환이 없다 (fourw 스냅샷도).
    expect(src).toMatch(/planSharedConsumption\(\{[\s\S]*?tagParam,[\s\S]*?liveFourw: mode === "fourw" \? fourw : null,/);
    // 별 충돌 폴백: tag 소비 latch + 사용자 알림.
    expect(src).toContain("plan.consumedTagParam !== null");
    expect(src).toContain("plan.starConflict !== null");
    // linkclip 하드코딩 폴드로 되돌아가면 mode 동반 share 텍스트가 화면에서 사라진다.
    expect(src).not.toContain("consumeSharedIntoDrafts");
  });

  test("배달 identity 는 content+mode+tag 조합이다 (A→B 무공백 재배달 차단 방지)", () => {
    expect(src).toContain("sharedDeliveryKey(shared.key, modeParam, tagParam)");
    expect(src).toContain("sharedConsumedRef.current !== sharedDelivery");
  });

  test("stale-completion fence: 저장 완주 정리가 이후의 변경(B)을 덮지 않는다", () => {
    // 모든 저장 경로가 해당 모드의 내용 epoch를 쓴다. 단순 모드 전환은
    // epoch를 올리지 않으므로 이미 저장된 A를 지우되, 같은 모드의 B는 지킨다.
    expect(src).toContain("const storageMutationEpochRef = useRef<Record<CaptureDraftMode, number>>");
    expect(src).toContain("const startModeEpoch = storageMutationEpochRef.current.journal");
    expect(src).toContain("const startModeEpoch = storageMutationEpochRef.current[submittedMode]");
    expect(src).toContain("await clearSubmittedStorageDraft(\"journal\", startModeEpoch)");
    expect(src).toContain("await clearSubmittedStorageDraft(submittedMode, startModeEpoch)");
    expect(src).toContain("const startModeEpoch = transientMutationEpochRef.current[noteMode]");
    expect(src).toContain("await clearSubmittedTransientDraft(noteMode, startModeEpoch)");
    // 완주 판정은 두 갈래다(lib/capture/save-finalize.ts, 순서 회귀는 그쪽 테스트):
    // 내구 초안 삭제는 포커스를 요구하지 않고, 완주 UI 만 요구한다. 한 조건으로
    // 묶으면 blur 한 번에 이미 저장된 글이 초안으로 되살아난다(#1551 회귀).
    for (const mode of ['"journal"', "noteMode", "submittedMode"]) {
      expect(src).toContain(`captureMayFinalizeSave(${mode}, startModeEpoch)`);
      expect(src).toContain(`captureMayApplyCompletionUi(${mode}, startModeEpoch)`);
    }
    expect(src).toContain("function captureMayFinalizeSave(submittedMode: Mode, startEpoch: number): boolean {");
    expect(src).toContain("mayFinalizeDurableCleanup(saveFinalizeSnapshot(submittedMode, startEpoch))");
    expect(src).toContain("mayApplyCompletionUi(saveFinalizeSnapshot(submittedMode, startEpoch))");
    // 스냅샷은 "포커스 중인가" 가 아니라 "남이 넘겨받았는가" 를 싣는다.
    expect(src).toContain("focusedOwnerId: (userId ? focusedCaptureOwners.get(userId)?.id : undefined) ?? null,");
    // 그리고 blur 로 지워지지 않는 "마지막 발행자" 도 함께 싣는다. 초안 저장이
    // 부분 삭제가 아니라 전체 스냅샷 발행이라, 이게 없으면 다른 화면이 쓰고
    // 떠난 뒤 낡은 인스턴스가 그 내용을 덮어쓴다(자체 감사 P0).
    expect(src).toContain("const lastCaptureDraftWriters = new Map<string, number>();");
    expect(src).toContain("lastWriterId: (userId ? lastCaptureDraftWriters.get(userId) : undefined) ?? null,");
    // 장부는 **모든** 발행 지점에서 적혀야 한다. 한 곳이라도 빠지면 그 쓰기가
    // 안 남아 낡은 인스턴스가 자기를 마지막 writer 로 알고 덮어쓴다 — blur
    // freeze 가 persistDrafts 를 우회해 직접 발행하는 것이 실제 그 구멍이었다.
    const publishSites = (src.match(/saveCaptureDraftState\(userId, snapshot\)/g) ?? []).length;
    const writerStamps = (src.match(/lastCaptureDraftWriters\.set\(userId, captureInstanceId\);/g) ?? []).length;
    expect(publishSites).toBe(2); // persistDrafts + blur freeze
    expect(writerStamps).toBe(publishSites);
    expect(src).toMatch(/function persistDrafts[\s\S]*?lastCaptureDraftWriters\.set\(userId, captureInstanceId\);/);
    expect(src).toMatch(/lastCaptureDraftWriters\.set\(userId, captureInstanceId\);[\s\S]{0,200}?write: \(\) => saveCaptureDraftState\(userId, snapshot\)/);
    expect(src).not.toContain('clearModeDraft("linkclip")');
    // Focus/mode changes never abort an accepted save; only UI cleanup ownership changes.
    expect(src).not.toContain("submitAbortRef.current?.abort()");
    expect(src).toContain("const submitBusyRef = useRef(false)");
    expect(src).toContain("captureRevisionRef.current += 1;");
    expect(src).toContain("function changeBody(text: string): void {");
    expect(src).toMatch(/function changeBody[\s\S]*?commitComposerMutation\(\);[\s\S]*?setBody\(text\);/);
    const mutationFn = src.split("function commitComposerMutation")[1]?.split("function markStorageMutation")[0] ?? "";
    expect(mutationFn).toContain("storageMutationEpochRef");
    expect(mutationFn).toContain("transientMutationEpochRef");
    expect(mutationFn).toContain("advanceCaptureRevision();");
    expect(src).not.toMatch(/useEffect\(\(\) => \{\s*captureRevisionRef\.current \+= 1;/);
    expect((src.match(/stale (?:journal|note-like|source) save failed/g) ?? []).length).toBe(3);

    const blocks = [
      src.split("async function handleJournalSubmit")[1]?.split("async function handleNoteLikeSubmit")[0] ?? "",
      src.split("async function handleSubmit")[1]?.split("async function runPropose")[0] ?? "",
    ];
    for (const block of blocks) {
      const clear = block.indexOf("await clearSubmittedStorageDraft");
      const reset = block.indexOf("reset();", clear);
      expect(clear).toBeGreaterThan(0);
      expect(reset).toBeGreaterThan(clear);
      expect(block.slice(reset)).toContain("setSavedTitle(");
    }
    const noteBlock = src.split("async function handleNoteLikeSubmit")[1]?.split("async function handleStartRecording")[0] ?? "";
    const clear = noteBlock.indexOf("await clearSubmittedTransientDraft(noteMode, startModeEpoch)");
    const reset = noteBlock.indexOf("reset();", clear);
    expect(clear).toBeGreaterThan(0);
    expect(reset).toBeGreaterThan(clear);
  });

  test("durable ACK만 URL을 지우고 이전 배달·이전 session ACK는 무시한다", () => {
    expect(src).toContain("sharedAckGenerationRef.current !== ackGeneration");
    expect(src).toContain("paramAckGenerationRef.current !== ackGeneration");
    expect(src).toContain("!sessionActiveRef.current");
    expect(src).toContain("sharedConsumedRef.current !== sharedDelivery");
    expect(src).toContain("modeParamConsumedRef.current !== consumeKey");
    expect(src).toContain("durableWrite.then((durable) =>");
    expect(src).not.toContain("durableWrite.finally(");
    expect(src).toContain("sharedAckGenerationRef.current += 1;");
    expect(src).toContain("paramAckGenerationRef.current += 1;");
    // Promise completion publishes evidence only. The focused, latest-render
    // effects own the only two router mutations (shared + param).
    expect(src).toContain("setSharedDurableAck({");
    expect(src).toContain("setParamDurableAck({");
    expect(src).toContain("sharedDelivery !== sharedDurableAck.delivery");
    expect(src).toContain("paramDeliveryIdentity !== paramDurableAck.identity");
    expect(src).toContain("!captureFocusedRef.current");
    expect((src.match(/router\.setParams\(/g) ?? []).length).toBe(2);
  });

  test("share write 대기 중 편집도 최신 snapshot으로 다시 저장된다", () => {
    const debounce = src.split("let hasDurableComposerSnapshot = false;")[1]?.split("// Load recent record dates")[0] ?? "";
    expect(debounce).not.toContain("if (pendingSharedRef.current) return;");
    expect(debounce).toContain("storeDraftForMode(mode, draft)");
    expect(debounce).toContain("storeTransientDraftForMode(mode, draft)");
    expect(debounce).toContain("persistDrafts(mode).then((durable)");
    expect(debounce).toContain("sharedAckGenerationRef.current === sharedAck.generation");
    // Hydration skipped restore on the share-consume commit; its stale empty
    // closure must not fold over the planner's loaded draft map.
    expect(debounce).toContain("shareRestoreSkipped");
    expect(src).toContain("setShareRestoreSkipped(true)");
    // Any share/tag planner can update refs before its state setters commit.
    // The old render's later debounce/focus flush must not fold stale fields.
    expect(src).toContain("routeApplyPendingCommitRef.current ||");
    expect(src).toContain("setRouteCommitGeneration((generation) => generation + 1)");
  });

  test("hydration 전 빈 composer는 상호작용할 수 없어 기존 초안을 덮지 않는다", () => {
    expect(src).not.toContain("preHydrationDirtyRef");
    expect(src).toContain("if (!draftHydrated) {");
    expect(src).toContain('<PremiumLoadingState message={t("loading")} />');
    expect(src).toContain('return <CaptureLegacySession key={userId ?? "signed-out"} />');
    expect(src).toContain("setDraftHydrationError(true)");
    expect(src).toContain("setDraftHydrationRetry((attempt) => attempt + 1)");
    expect(src).toContain("draftHydratedRef.current = false;");
  });

  test("OCR·picker 비동기 완료는 최신 composer/mode만 갱신한다", () => {
    expect(src).toContain("function beginAsyncProducer()");
    expect(src).toContain("function asyncProducerIsCurrent(");
    expect(src).toMatch(/function switchCaptureMode[\s\S]*?asyncProducerGenerationRef\.current \+= 1;/);
    expect(src).toMatch(/async function pasteCopiedContent[\s\S]*?beginAsyncProducer\(\)[\s\S]*?asyncProducerIsCurrent\(ticket, "linkclip", false\)/);
    expect(src).toMatch(/function beginAsyncProducer[\s\S]*?setExtracting\(false\)/);
    expect(src).toContain("const stopVoiceCaptureForModeExit");
    expect(src).toContain("voicePhaseRef.current");
    expect((src.match(/asyncProducerIsCurrent\(ticket, "ocr"\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((src.match(/asyncProducerIsCurrent\(ticket, "file"/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const ocrBlock = src.split("async function runExtract")[1]?.split("async function transcribePickedAudio")[0] ?? "";
    expect(ocrBlock.indexOf('asyncProducerIsCurrent(ticket, "ocr")')).toBeLessThan(ocrBlock.indexOf("setBody(md)"));
  });

  test("capture instance 전환은 이전 초안을 먼저 flush하고 이후 stale timer/clear를 막는다", () => {
    const clearHelper = src.split("async function clearSubmittedStorageDraft")[1]
      ?.split("function showDraftCleanupFailure")[0] ?? "";
    // 인계 보호는 그대로다 — 다른 인스턴스가 초안을 넘겨받았으면 지우지 않는다.
    // 달라진 것은 blur 뿐이다: 화면 이탈은 인계가 아니므로 삭제를 막지 않는다.
    expect(clearHelper).toContain("if (!captureMayFinalizeSave(targetMode, startModeEpoch)) return false");
    expect(clearHelper).toMatch(/captureMayFinalizeSave\([\s\S]*?draftsRef\.current\[targetMode\]/);
    expect(clearHelper).not.toContain("captureOwnsFocusedSession()");
    expect(src).toMatch(
      /function captureOwnsFocusedSession[\s\S]*?sessionActiveRef\.current[\s\S]*?focusedCaptureOwners\.get\(userId\)\?\.id === captureInstanceId/,
    );
    const debounce = src.split("let hasDurableComposerSnapshot = false;")[1]
      ?.split("// Durable writes publish ACK evidence")[0] ?? "";
    expect(debounce).toContain("if (!captureOwnsFocusedSession()) return;");
    expect(debounce).toContain("captureFocused");
    expect(src).toContain("const focusedCaptureOwners = new Map<string, FocusedCaptureOwner>()");
    expect(src).toContain("startCaptureDraftHandoff(userId, previous)");
    expect(src).toContain("startCaptureDraftHandoff(userId, owner)");
    expect(src).toContain("freezeDraftOnBlurRef.current = () =>");
    expect(src).toContain("type FrozenCaptureDraft = { generation: number; write: () => Promise<boolean> }");
    expect(src).toContain("const draftWriteGenerationRef = useRef(0)");
    expect(src).toContain("existing.generation > generation");
    expect(src).toContain("return registerCaptureDraftHandoff(");
    expect(src).toMatch(/function clearModeDraft[\s\S]*?return persistDrafts\(lastMode\);/);
    expect(src).toContain("settleCaptureDraftHandoffs(userId)");
    expect(src).toContain("draftLoadedUserRef.current = userId");
    expect(src).toContain("focusDraftHydratedRef.current = !!userId");
    expect(src).toContain("invalidateAllDraftMutationEpochs()");
    expect(src).toContain("modeParamConsumedRef.current = null");
    expect(src).toContain("pendingSharedRef.current = sharedDeliveryRef.current !== null");
    expect(src).toContain('previousState === "active" && nextState !== "active"');
  });

  test("format proposal 비동기 응답은 reset된 다른 composer에 되살아나지 않는다", () => {
    expect(src).toContain("const proposalGenerationRef = useRef(0)");
    expect(src).toContain("proposalGenerationRef.current += 1;");
    expect(src).toContain("proposalGenerationRef.current !== generation");
    expect(src).toContain("const proposalToSave = proposal");
  });

  test("딥스페이스에서도 Web Share Target 이 도달한다 (manifest → 소비 배선)", () => {
    // manifest 의 share_target 은 /capture 로 온다. 딥스페이스 기본 화면
    // (CaptureView)은 share 를 소비하지 않으므로, 유효 share 는 legacy 소비
    // 배선으로 라우팅되고 그 결정은 mount 동안 state latch 된다. mode/tag 단독
    // 진입과 onboarding entry도 같은 full intake를 타야 한다.
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public", "manifest.webmanifest"), "utf8"),
    ) as { share_target?: { action?: string } };
    expect(manifest.share_target?.action?.endsWith("/capture")).toBe(true);
    const wrapper = src.split("export function CaptureLegacy")[0] ?? "";
    expect(wrapper).toContain("const hasFullCaptureParams =");
    expect(wrapper).toContain("(CAPTURE_MODES as readonly string[]).includes(captureParams.mode)");
    expect(wrapper).toContain("captureParams.tag.trim().length > 0");
    expect(wrapper).toContain('captureParams.entry === "firstRun"');
    expect(wrapper).toContain("useState(hasFullCaptureParams)");
    expect(wrapper).toContain("hasFullCaptureParams || fullCaptureActive");
    expect(wrapper).toContain("<CaptureLegacy />");
    expect(wrapper).toContain("<CaptureView />");
    expect(wrapper).not.toContain("sharedEverRef.current =");
  });

  test("일반 칩도 초안과 함께 영속·복원된다 (라우트 tag 의 재마운트 생존)", () => {
    expect(src).toContain("tags: tagsEditable.filter((x) => !isDomainTag(x))");
    expect(src).toContain("const base = draft?.tags ?? [];");
    expect(src).toContain("prev.filter((x) => !isDomainTag(x)).slice(0, 10)");
    expect(src).toContain("base.includes(chip) || base.length >= 10 ? base : [...base, chip]");
    const debounce = src.split("let hasDurableComposerSnapshot = false;")[1]?.split("// Load recent record dates")[0] ?? "";
    expect(debounce).toContain("ocrReviewApproved");
    expect(debounce).toContain("domainIntent");
    expect(debounce).toContain("tagsEditable");
  });

  test("별 intent 는 journal 초안과 함께 영속되고 복원 시 칩과 같이 돌아온다", () => {
    expect(src).toContain('...(targetMode === "journal" && domainIntent !== null ? { domainIntent } : {})');
    expect(src).toContain("draft?.domainIntent");
    // 본문 변경 없이 intent·칩만 바뀌어도 디바운스 저장이 따라간다.
    const debounce = src.split("let hasDurableComposerSnapshot = false;")[1]?.split("// Load recent record dates")[0] ?? "";
    expect(debounce).toContain("domainIntent");
    expect(debounce).toContain("tagsEditable");
    // 복원은 초안이 정본이다: 이전 화면 칩을 물려받지 않고, intent 있으면 정본
    // domain 칩 하나가 초안 칩 뒤에 붙는다.
    expect(src).toContain(
      "return restoredIntent === null ? [...base] : [...base, domainTagFor(restoredIntent)];",
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

  test("일반 tag 의 칩 추가 UX 는 dedupe·10개 상한을 화면과 저장에 같이 적용한다", () => {
    expect(src).toContain("base.includes(chip) || base.length >= 10 ? base : [...base, chip]");
    const addTag = src.split("function addTagFromInput")[1]?.split("function updateOcrBody")[0] ?? "";
    expect(addTag).toContain("isDomainTag(norm)");
    expect(addTag).toContain("ordinaryTags.length >= 10");
    expect(addTag).toContain("...prev.filter((tag) => isDomainTag(tag)).slice(0, 1)");
  });
});
