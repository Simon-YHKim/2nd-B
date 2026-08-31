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
        '성격의 5가지 큰 축을 재는 검증된 자기보고 도구입니다. "이런 사람이다" 라는 문장에 1(전혀 아니다) ~ 5(매우 그렇다)로 답해 주세요. 정답은 없어요. 한 페이지에 5문항씩, 9페이지로 나눠집니다.',
      citation: "John, Donahue, & Kentle (1991) · public domain",
      instruction: "다음 문장이 당신과 얼마나 맞는지 골라주세요. 「나는 …」",
      failure: "저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요.",
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
  test("deep-space routes directly to the isolated DDS renderer and has no dead deep renderer", () => {
    expect(APP).toContain('import { DeepSpaceBigFiveScreen } from "@/screens/deepspace/dds-big-five-screen";');
    expect(APP).toMatch(/if \(isDeepSpaceUI\(\)\) return <DeepSpaceBigFiveScreen \/>/);
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

  test("legacy and DDS draft state remount by auth owner and read the parent active-owner ref", () => {
    const legacyWrapper = APP.match(/function BigFiveSurvey\([\s\S]*?(?=\nfunction BigFiveSurveyOwner)/)?.[0];
    const legacyOwner = APP.match(/function BigFiveSurveyOwner\([\s\S]*?(?=\nconst styles)/)?.[0];
    expect(legacyWrapper).toMatch(/<BigFiveSurveyOwner\s+key=\{userId\}/);
    expect(legacyWrapper).not.toContain("useState<BfiResponses>");
    expect(legacyOwner).toContain("useState<BfiResponses>({})");
    expect(legacyOwner).toContain("activeOwnerIdRef.current");
    expect(SCREEN).toMatch(/<PixelBigFiveSurvey\s+key=\{userId\}[\s\S]*?activeOwnerIdRef=\{activeOwnerIdRef\}/);
    expect(SCREEN).toContain("getActiveOwnerId: () => (mountedRef.current ? activeOwnerIdRef.current : null)");
    expect(SCREEN).toContain("setSurveyOwnerId(null)");
  });

  test("both submit handlers use the shared controller and publish success only from its saved outcome", () => {
    expect(APP.match(/saveBfiForOwner\(/g)).toHaveLength(1);
    expect(SCREEN.match(/saveBfiForOwner\(/g)).toHaveLength(1);
    expect(APP).toMatch(/const outcome = await saveBfiForOwner\([\s\S]*?if \(outcome === "saved"\)[\s\S]*?setSaved\(true\)/);
    expect(SCREEN).toMatch(/const outcome = await saveBfiForOwner\([\s\S]*?if \(outcome === "saved"\)[\s\S]*?setPhase\("saved"\)/);
    const controller = HELPER.match(/export async function saveBfiForOwner\([\s\S]*?(?=\nexport type BfiOwnerCompletionOutcome)/)?.[0];
    expect(controller).toBeDefined();
    expect(controller!.indexOf("await write(payload)")).toBeLessThan(controller!.indexOf("lock.isCurrent(ticket"));
    expect(controller!.indexOf("lock.isCurrent(ticket")).toBeLessThan(controller!.indexOf('return "saved"'));
    expect(controller).not.toContain("responses =");
  });

  test("saved CTA, header Back, and Android Back converge on current-owner one-shot completion", () => {
    const requestBack = SCREEN.match(/const requestBack = useCallback\([\s\S]*?(?=\n\n  useEffect\(\(\) => \{\n    if \(phase)/)?.[0];
    expect(requestBack).toContain('phase === "saved"');
    expect(requestBack).toContain("handleSavedDone()");
    expect(SCREEN).toMatch(/BackHandler\.addEventListener\("hardwareBackPress"[\s\S]*?phase === "saved"\) handleSavedDone\(\)/);
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
    expect(logs).toEqual([
      'console.warn("[big-five] save failed");',
      'console.warn("[big-five] save failed");',
    ]);
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
    expect(SCREEN).toContain("BackHandler.addEventListener");
    expect(SCREEN).toContain("subscription.remove()");
    expect(SCREEN).not.toMatch(/DUMMY|fixture|heuristic|sample trait/i);
  });

  test("legacy JSX and shared quant defaults remain byte-stable", () => {
    const legacy = APP.match(/function BigFiveLegacy\(\)[\s\S]*?(?=\n\nexport default function)/)?.[0];
    expect(legacy).toBeDefined();
    expect(normalizedHash(legacy!)).toBe("857985b204144f7c4fc7fc7f52af128bed4ab6da0becc018f8f1cf1357e115e9");
    expect(normalizedHash(read("components/quant/QuantIntroModal.tsx"))).toBe("7e11ed07fa6c463d2359005f3c6b5a0ef700874a6bee12148e72253c07792ba3");
    expect(normalizedHash(read("components/quant/LikertChoiceGroup.tsx"))).toBe("ba5250e529357bf9f23e90491ebb1666b27e7dfa781dbc5d085b156ec6d51a66");
    expect(normalizedHash(read("components/quant/QuantPager.tsx"))).toBe("b91bfbdf0861753aca1cd43dead1f0e4280c7c5b2778cc05d46377ac5da8c3a1");
    expect(normalizedHash(read("components/quant/QuantSaveCelebration.tsx"))).toBe("a4cde70d67b7e77e343909ebd81355b4a1d6cf3c5289a7a96785fc4559a8a634");
  });

  test("the exact pixel ratchet covers the isolated renderer", () => {
    expect(PIXEL_RULES).toContain('"src/screens/deepspace/dds-big-five-screen.tsx"');
  });
});
