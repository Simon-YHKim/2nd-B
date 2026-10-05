import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { BFI_ITEMS, scoreBfi, type BfiResponses } from "../lib/persona/bfi";
import {
  BFI_PAGE_COUNT,
  BFI_PAGE_SIZE,
  BFI_SCALE,
  BfiOwnerRequestGuard,
  BfiOwnerSubmitLock,
  OneShotGate,
  bfiPageIndices,
  bfiReadOwner,
  bfiSurveyCopy,
  buildBfiRecordArgs,
  completeBfiForOwner,
  loadBfiLensWithTimeout,
  mapLatestBfiToTraits,
  refreshBfiProfileForOwner,
  saveBfiForOwner,
  visibleBfiLensSnapshot,
} from "../lib/persona/big-five-screen";

const ROOT = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const normalize = (source: string) => source.replace(/\r\n/g, "\n");
const normalizedHash = (source: string) =>
  createHash("sha256").update(normalize(source)).digest("hex");

const APP = normalize(read("app/big-five.tsx"));
const SCREEN = normalize(read("screens/deepspace/dds-big-five-screen.tsx"));
const HELPER = normalize(read("lib/persona/big-five-screen.ts"));
const PIXEL_RULES = read("../scripts/check-pixel-rules.ts");

function completeResponses(value = 3): BfiResponses {
  return Object.fromEntries(BFI_ITEMS.map((item) => [item.id, value])) as BfiResponses;
}

describe("big-five owner-safe state contracts", () => {
  test("auth and profile gates fail closed before any BFI read owner is returned", () => {
    expect(bfiReadOwner({ loading: true, userId: "owner-a", hasProfile: true, profileProbeFailed: false })).toBeNull();
    expect(bfiReadOwner({ loading: false, userId: null, hasProfile: true, profileProbeFailed: false })).toBeNull();
    expect(bfiReadOwner({ loading: false, userId: "owner-a", hasProfile: null, profileProbeFailed: false })).toBeNull();
    expect(bfiReadOwner({ loading: false, userId: "owner-a", hasProfile: false, profileProbeFailed: false })).toBeNull();
    expect(bfiReadOwner({ loading: false, userId: "owner-a", hasProfile: true, profileProbeFailed: true })).toBeNull();
    expect(bfiReadOwner({ loading: false, userId: "owner-a", hasProfile: true, profileProbeFailed: false })).toBe("owner-a");
  });

  test("a late owner A read cannot publish into owner B or signed-out state", () => {
    const guard = new BfiOwnerRequestGuard();
    const ownerA = guard.begin("owner-a");
    const ownerB = guard.begin("owner-b");

    expect(guard.settle(ownerA, "owner-b")).toBe(false);
    expect(guard.settle(ownerA, null)).toBe(false);
    expect(guard.settle(ownerB, "owner-b")).toBe(true);
  });

  test("a mismatched ready snapshot fails closed to loading on the new owner first paint", () => {
    const ownerATraits = mapLatestBfiToTraits({
      openness: 5,
      conscientiousness: 4,
      extraversion: 3,
      agreeableness: 2,
      neuroticism: 1,
    });

    expect(
      visibleBfiLensSnapshot(
        { status: "ready", ownerId: "owner-a", traits: ownerATraits },
        "owner-b",
      ),
    ).toEqual({ status: "loading", ownerId: "owner-b" });
    expect(visibleBfiLensSnapshot({ status: "empty", ownerId: "owner-a" }, null)).toEqual({
      status: "idle",
      ownerId: null,
    });
  });

  test("read result distinguishes ready, empty, returned error and timeout without exposing errors", async () => {
    await expect(
      loadBfiLensWithTimeout(
        async () => ({ openness: 5, conscientiousness: 4, extraversion: 3, agreeableness: 2, neuroticism: 1 }),
        50,
      ),
    ).resolves.toEqual({
      status: "ready",
      traits: { openness: 100, conscientiousness: 75, extraversion: 50, agreeableness: 25, neuroticism: 0 },
    });
    await expect(loadBfiLensWithTimeout(async () => null, 50)).resolves.toEqual({ status: "empty" });
    await expect(
      loadBfiLensWithTimeout(async () => {
        throw new Error("private database detail");
      }, 50),
    ).resolves.toEqual({ status: "error" });
    await expect(loadBfiLensWithTimeout(() => new Promise(() => undefined), 1)).resolves.toEqual({ status: "timeout" });
  });

  test("two same-frame submits write once, check owner+ticket before saved, and keep the success lock", async () => {
    const lock = new BfiOwnerSubmitLock();
    const active = { current: "owner-a" as string | null };
    const events: string[] = [];
    let finishWrite!: () => void;
    const write = jest.fn(
      () => new Promise<void>((resolve) => {
        events.push("write");
        finishWrite = resolve;
      }),
    );
    const realIsCurrent = lock.isCurrent.bind(lock);
    jest.spyOn(lock, "isCurrent").mockImplementation((ticket, ownerId) => {
      events.push("owner-ticket-check");
      return realIsCurrent(ticket, ownerId);
    });
    const args = {
      ownerId: "owner-a",
      locale: "en" as const,
      responses: completeResponses(),
      lock,
      getActiveOwnerId: () => active.current,
      onAcquired: () => events.push("acquired"),
      write,
    };

    const first = saveBfiForOwner(args);
    const second = saveBfiForOwner(args);
    expect(write).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBe("locked");

    finishWrite();
    await expect(first).resolves.toBe("saved");
    events.push("set-saved");
    expect(events).toEqual(["acquired", "write", "owner-ticket-check", "set-saved"]);
    expect(lock.acquire("owner-a")).toBeNull();
  });

  test("failure releases for retry without deleting responses; stale settlement publishes no UI", async () => {
    const responses = completeResponses(4);
    const before = { ...responses };
    const failedLock = new BfiOwnerSubmitLock();
    const release = jest.spyOn(failedLock, "release");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      saveBfiForOwner({
        ownerId: "owner-a",
        locale: "en",
        responses,
        lock: failedLock,
        getActiveOwnerId: () => "owner-a",
        onAcquired: () => undefined,
        write: async () => {
          throw new Error("raw record owner detail");
        },
      }),
    ).resolves.toBe("failed");
    expect(release).toHaveBeenCalledTimes(1);
    expect(responses).toEqual(before);
    expect(failedLock.acquire("owner-a")).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    const staleLock = new BfiOwnerSubmitLock();
    const active = { current: "owner-a" as string | null };
    let finishWrite!: () => void;
    const staleSave = saveBfiForOwner({
      ownerId: "owner-a",
      locale: "en",
      responses,
      lock: staleLock,
      getActiveOwnerId: () => active.current,
      onAcquired: () => undefined,
      write: () => new Promise<void>((resolve) => { finishWrite = resolve; }),
    });
    active.current = "owner-b";
    finishWrite();
    const outcome = await staleSave;
    const setSaved = jest.fn();
    const setError = jest.fn();
    if (outcome === "saved") setSaved();
    if (outcome === "failed") setError();
    expect(outcome).toBe("stale");
    expect(setSaved).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  test("completion checks current owner before one-shot and calls each terminal effect at most once", () => {
    const active = { current: "owner-b" as string | null };
    const gate = new OneShotGate();
    const consume = jest.fn(() => false);
    const nudgeRoute = jest.fn();
    const complete = jest.fn();
    const args = {
      ownerId: "owner-a",
      getActiveOwnerId: () => active.current,
      gate,
      consumeNudge: consume,
      onNudge: nudgeRoute,
      onComplete: complete,
    };

    expect(completeBfiForOwner(args)).toBe("stale");
    expect(consume).not.toHaveBeenCalled();
    active.current = "owner-a";
    expect(completeBfiForOwner(args)).toBe("completed");
    expect(completeBfiForOwner(args)).toBe("duplicate");
    expect(consume).toHaveBeenCalledTimes(1);
    expect(nudgeRoute).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);

    const nudgeGate = new OneShotGate();
    const nudgeConsume = jest.fn(() => true);
    const nudge = jest.fn();
    const lensComplete = jest.fn();
    const nudgeArgs = { ...args, gate: nudgeGate, consumeNudge: nudgeConsume, onNudge: nudge, onComplete: lensComplete };
    expect(completeBfiForOwner(nudgeArgs)).toBe("nudged");
    expect(completeBfiForOwner(nudgeArgs)).toBe("duplicate");
    expect(nudgeConsume).toHaveBeenCalledTimes(1);
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(lensComplete).not.toHaveBeenCalled();
  });

  test("nudge persistence failure falls through to lens completion without raw logging", () => {
    const complete = jest.fn();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      completeBfiForOwner({
        ownerId: "owner-a",
        getActiveOwnerId: () => "owner-a",
        gate: new OneShotGate(),
        consumeNudge: () => { throw new Error("private storage detail"); },
        onNudge: jest.fn(),
        onComplete: complete,
      }),
    ).toBe("completed");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("profile retry is same-frame locked, catches rejection, and releases for retry", async () => {
    const lock = new BfiOwnerSubmitLock();
    let finish!: () => void;
    const refresh = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const args = {
      ownerId: "owner-a",
      lock,
      getActiveOwnerId: () => "owner-a",
      onAcquired: jest.fn(),
      refresh,
    };
    const first = refreshBfiProfileForOwner(args);
    const second = refreshBfiProfileForOwner(args);
    expect(refresh).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBe("locked");
    finish();
    await expect(first).resolves.toBe("complete");

    await expect(
      refreshBfiProfileForOwner({ ...args, refresh: async () => { throw new Error("raw probe error"); } }),
    ).resolves.toBe("complete");
  });
});

describe("exact BFI-44 and createRecord contract", () => {
  test("legacy survey copy stays exact after moving into the shared authority", () => {
    expect(bfiSurveyCopy("en")).toEqual({
      intro:
        'A validated self-report measure of the five main personality dimensions. Rate each "I see myself as someone who…" statement from 1 (strongly disagree) to 5 (strongly agree). No right answers. Split across 9 pages, 5 items each.',
      citation: "John, Donahue, & Kentle (1991) · public domain",
      instruction: 'How well does each statement describe you? "I see myself as someone who…"',
      failure: "Couldn't save. Your answers are still here; please try again.",
      exit: "Are you sure you want to exit? Your progress will not be saved.",
    });
    expect(bfiSurveyCopy("ko")).toEqual({
      intro:
        '성격의 5가지 큰 축을 재는 검증된 자기보고 도구입니다. "이런 사람이다" 라는 문장에 1(전혀 아니다) ~ 5(매우 그렇다)로 답해 주세요. 정답은 없습니다. 한 페이지에 5문항씩, 9페이지로 나눠집니다.',
      citation: "John, Donahue, & Kentle (1991) · public domain",
      instruction: "다음 문장이 당신과 얼마나 맞는지 골라주세요. 「나는 …」",
      failure: "저장하지 못했습니다. 답변은 그대로 남아 있으니 다시 시도해 주세요.",
      exit: "정말 성격 검사를 종료하시겠습니까? 작성 중이던 답변이 저장되지 않고 사라집니다.",
    });
  });

  test("keeps 44 items, five choices, and actual page slices of 5×8 + 4", () => {
    expect(BFI_ITEMS).toHaveLength(44);
    expect(BFI_SCALE.map((choice) => choice.value)).toEqual([1, 2, 3, 4, 5]);
    expect(BFI_PAGE_SIZE).toBe(5);
    expect(BFI_PAGE_COUNT).toBe(9);
    const pages = Array.from({ length: BFI_PAGE_COUNT }, (_, page) => bfiPageIndices(page));
    expect(pages.map((indices) => indices.length)).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 4]);
    expect(pages.flat()).toEqual(Array.from({ length: 44 }, (_, index) => index));

    const incomplete: BfiResponses = {};
    for (const item of BFI_ITEMS.slice(0, 43)) incomplete[item.id] = 3;
    expect(scoreBfi(incomplete)).toMatchObject({ answered: 43, complete: false });
    expect(buildBfiRecordArgs("owner-a", "en", incomplete)).toBeNull();
  });

  test("terminal payload preserves the existing exact note shape and reverse-scored results", () => {
    const responses = completeResponses();
    responses[6] = 5;
    const expected = scoreBfi(responses);
    const payload = buildBfiRecordArgs("owner-a", "en", responses);

    expect(payload).toEqual({
      userId: "owner-a",
      locale: "en",
      kind: "note",
      body: JSON.stringify({ bfi_responses: responses, scores: expected.byTrait }),
      topic: "Big Five (BFI-44) assessment",
      summary: expected.scores
        .map((score) => {
          const labels = {
            extraversion: "Extraversion",
            agreeableness: "Agreeableness",
            conscientiousness: "Conscientiousness",
            neuroticism: "Neuroticism",
            openness: "Openness to Experience",
          };
          return `${labels[score.trait]}: ${score.score.toFixed(1)}/5`;
        })
        .join("  ·  "),
      conclusion: "Highest score today: Agreeableness (3.0/5)",
      tags: ["big_five", "bfi", "assessment"],
      withFollowup: false,
    });
    expect(expected.byTrait.extraversion).toBeCloseTo(2.75, 5);
  });
});

describe("big-five PIXEL-CLAY route discipline", () => {
  test("the route renders only the isolated DDS renderer and has no dead deep renderer", () => {
    expect(APP).toContain('import { DeepSpaceBigFiveScreen } from "@/screens/deepspace/dds-big-five-screen";');
    // 2026-10-05: 스킨 분기(`if (isDeepSpaceUI()) return …`) 뒤에 레거시 설문이 있었다.
    // 롤백 레버 제거(Simon 결정 Q-261004-11 C)로 라우트는 래퍼가 됐다.
    expect(APP).toMatch(/export default function BigFive\(\) \{\s*return <DeepSpaceBigFiveScreen \/>;\s*\}/);
    expect(APP).not.toContain("BigFiveLegacy");
    expect(APP).not.toContain("function BigFiveDeepSpace");
    expect(SCREEN.match(/loadLatestBfi\(getSupabaseClient\(\), ownerId\)/g)).toHaveLength(1);
  });

  test("gates precede the read, and helper outcomes drive every explicit lens state", () => {
    const gatedRead = SCREEN.match(/const ownerId = bfiReadOwner\([\s\S]*?loadBfiLensWithTimeout\([\s\S]*?loadLatestBfi/)?.[0];
    expect(gatedRead).toBeDefined();
    expect(gatedRead).toContain("if (ownerId === null)");
    for (const status of ["ready", "empty", "error", "timeout"]) expect(HELPER).toContain(`status: "${status}"`);
    expect(SCREEN).toContain("visibleBfiLensSnapshot(snapshot, userId)");
    const loadingGate = SCREEN.indexOf("if (loading) return <GateLoading />");
    const signedOutGate = SCREEN.indexOf("if (!userId) return <SignedOutGate />");
    const failedProbeGate = SCREEN.indexOf("if (profileProbeFailed) {");
    const unresolvedProfileGate = SCREEN.indexOf("if (hasProfile === null) return <GateLoading />");
    expect([loadingGate, signedOutGate, failedProbeGate, unresolvedProfileGate].every((index) => index >= 0)).toBe(true);
    expect([loadingGate, signedOutGate, failedProbeGate, unresolvedProfileGate]).toEqual(
      [...[loadingGate, signedOutGate, failedProbeGate, unresolvedProfileGate]].sort((a, b) => a - b),
    );
  });

  test("DDS draft state remounts by auth owner and reads the parent active-owner ref", () => {
    // 2026-10-05: 레거시 설문(BigFiveSurvey · BigFiveSurveyOwner)의 같은 단언 다섯은 그
    // 설문이 롤백 레버와 함께 빠지며(Q-261004-11 C) 은퇴했다. 배송 설문의 단언은 그대로다.
    expect(SCREEN).toMatch(/<PixelBigFiveSurvey\s+key=\{userId\}[\s\S]*?activeOwnerIdRef=\{activeOwnerIdRef\}/);
    expect(SCREEN).toContain("getActiveOwnerId: () => (mountedRef.current ? activeOwnerIdRef.current : null)");
    expect(SCREEN).toContain("setSurveyOwnerId(null)");
  });

  test("the submit handler uses the shared controller and publishes success only from its saved outcome", () => {
    // 2026-10-05: 제출 핸들러가 둘(레거시 · DDS)이던 때의 레거시 쪽 단언 둘은 은퇴했다.
    // 대신 라우트가 저장을 직접 부르지 않는다는 것을 본다 - 저장 경로는 배송 화면 하나다.
    expect(APP).not.toContain("saveBfiForOwner(");
    expect(SCREEN.match(/saveBfiForOwner\(/g)).toHaveLength(1);
    expect(SCREEN).toMatch(/const outcome = await saveBfiForOwner\([\s\S]*?if \(outcome === "saved"\)[\s\S]*?setPhase\("saved"\)/);
    const controller = HELPER.match(/export async function saveBfiForOwner\([\s\S]*?(?=\nexport type BfiOwnerCompletionOutcome)/)?.[0];
    expect(controller).toBeDefined();
    expect(controller!.indexOf("await write(payload)")).toBeLessThan(controller!.indexOf("lock.isCurrent(ticket"));
    expect(controller!.indexOf("lock.isCurrent(ticket")).toBeLessThan(controller!.indexOf('return "saved"'));
    expect(controller).not.toContain("responses =");
  });

  test("saved CTA, header Back, and Android Back converge on current-owner one-shot completion", () => {
    // Android Back is registered through useHardwareBack (src/lib/nav/phone-embed.tsx)
    // so the dashboard phone can host this screen: the same focused BackHandler
    // listener standalone, the phone's claim stack inside the phone.
    const requestBack = SCREEN.match(/const requestBack = useCallback\([\s\S]*?(?=\n\n(?: {2}\/\/[^\n]*\n)* {2}useHardwareBack\(useCallback\(\(\) => \{\n {4}if \(phase)/)?.[0];
    expect(requestBack).toContain('phase === "saved"');
    expect(requestBack).toContain("handleSavedDone()");
    expect(SCREEN).toMatch(/useHardwareBack\(useCallback\(\(\) => \{[\s\S]*?phase === "saved"\) handleSavedDone\(\)/);
    expect(SCREEN).toContain("<SavedState onDone={handleSavedDone} />");
    expect(SCREEN).toContain("if (submitting) return true;");
    expect(SCREEN).toContain('visible={exitOpen && phase === "questions" && !submitting}');
  });

  test("save status is visible, busy-announced and contains no raw payload", () => {
    expect(SCREEN).toMatch(/\{submitting \? \([\s\S]*?<PixelSurface variant="inset"[\s\S]*?home:ds\.capture\.saving/);
    expect(SCREEN).toContain('accessibilityLiveRegion="polite"');
    expect(SCREEN).toContain("accessibilityState={{ busy: true }}");
    expect(SCREEN).toContain("busy={submitting}");
    const accessibilityLines = SCREEN.split("\n").filter((line) => line.includes("accessibility"));
    expect(accessibilityLines.join("\n")).not.toMatch(/responses|userId|ownerId|recordId|bfi_responses|\.message/);
  });

  test("raw responses, IDs and errors never enter logs or snapshots", () => {
    const logs = `${APP}\n${SCREEN}`.match(/console\.(?:warn|error|log)\([^\n]+/g) ?? [];
    // 2026-10-05: 2 -> 1. 두 번째 줄은 레거시 설문의 같은 로그였다(롤백 레버와 함께 빠짐).
    expect(logs).toEqual(['console.warn("[big-five] save failed");']);
    expect(logs.join("\n")).not.toMatch(/response|userId|ownerId|recordId|\.message|Error/);
    expect(`${APP}\n${SCREEN}`).not.toMatch(/toMatchSnapshot|toThrowErrorMatchingSnapshot|JSON\.stringify\(responses\).*console/);
  });

  test("uses Pixel/Fabric controls, 44dp reflow, reduced motion and cleaned Android timers", () => {
    for (const primitive of ["PixelSurface", "PixelPressable", "PixelGlyph"]) expect(SCREEN).toContain(primitive);
    expect(SCREEN).toContain("minWidth: 44");
    expect(SCREEN).toContain("minHeight: 44");
    expect(SCREEN).toContain('flexWrap: "wrap"');
    expect(SCREEN).toContain("prefersReducedMotion");
    expect(SCREEN).toContain("clearTimeout");
    // Android Back through useHardwareBack: the hook owns the listener and removes
    // it on blur and unmount (src/lib/nav/phone-embed.tsx).
    expect(SCREEN).toContain("useHardwareBack(useCallback(");
    expect(normalize(read("lib/nav/phone-embed.tsx"))).toContain("return () => sub.remove();");
    expect(SCREEN).not.toMatch(/DUMMY|fixture|heuristic|sample trait/i);
  });

  test("shared quant defaults remain byte-stable", () => {
    // 2026-10-05: BigFiveLegacy 바이트 핀(857985b2…)은 은퇴했다. 그 레거시 렌더러가 롤백
    // 레버와 함께 E:/Legacy/2ndB 로 나갔다(Simon 결정 Q-261004-11 C, MANIFEST batch
    // qa261004-lever). 공용 quant 기본값 핀은 그대로다.
    // 2026-10-04 (QA 261004 S-02/S-03): the three quant digests below were re-pinned
    // because one unused import name left each file (`radii` from QuantIntroModal and
    // QuantPager, `semantic` from QuantSaveCelebration) so `npm run lint` can refuse
    // warnings. Nothing else in those files changed.
    // 2026-10-05 (QA R2C-14): QuantIntroModal · LikertChoiceGroup 재고정. 옛 값 fc7872cd · ba5250e5
    // 는 바로 앞 본문이다. 바뀐 것은 각 파일 한 줄뿐이다 - 체크박스 · 라디오 Pressable 에
    // accessibilityState 와 같은 값의 aria-checked 를 더했다(react-native-web 은 accessibilityState 를
    // DOM 으로 옮기지 않아 웹 스크린리더가 선택 상태를 못 읽었다. web-aria-state.test.ts).
    expect(normalizedHash(read("components/quant/QuantIntroModal.tsx"))).toBe("62b64dfbab604ac298049d921b0a24eb07192afc5b67ea0dba79e41cee3c1cf3");
    expect(normalizedHash(read("components/quant/LikertChoiceGroup.tsx"))).toBe("1aefd87336e184f430887fdfbef947e9bba507b0745e8a858931f8b85d3c55bd");
    // 이 래칫은 "바뀌면 누군가 알아채라"는 것이지 "절대 손대지 말라"가 아니다.
    // 이번에 QuantPager 의 accessibilityValue 를 a11yValue() 로 옮겼다 - 객체
    // 형태는 React Native Web 이 읽지 않아 진행바가 웹에서 값 없이 announce
    // 됐다. 그래서 해시를 의도적으로 갱신한다.
    expect(normalizedHash(read("components/quant/QuantPager.tsx"))).toBe("9aacc8d5cd23b24fc11ee8aed4a267b8a02f823eac83af7b3c80e860e3c7ed37");
    // 2026-10-05 (Simon 결정 Q-261004-15 A): QuantSaveCelebration 재고정. 옛 값 006c0c39 는
    // 바로 앞 본문이다. 바뀐 것은 저장 순간의 옛 캐릭터 '모모' 몸 그림을 뺀 것뿐이다 -
    // MOMENT 가 { companion, state, cue } 에서 { cue } 로 줄었고 머리 주석 두 곳이 그에
    // 맞춰 고쳐졌다. 모달 · 문구 · 타이머 · 표정은 그대로다.
    expect(normalizedHash(read("components/quant/QuantSaveCelebration.tsx"))).toBe("8ca3205cc9c97bb53ec19939131fe4cc0f3fdf897b5e4c46cfbacbbfb30c53de");
  });

  test("the exact pixel ratchet covers the isolated renderer", () => {
    expect(PIXEL_RULES).toContain('"src/screens/deepspace/dds-big-five-screen.tsx"');
  });
});
