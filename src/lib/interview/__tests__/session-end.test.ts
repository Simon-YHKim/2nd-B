// 인터뷰가 끝나는 길 (Simon 결정 2026-10-05: Q-261004-24 + 12턴 상한 해제).
//
// 셋을 지킨다:
//   1. 하드 종료 없음 -- 답의 개수로 대화를 끊지 않는다.
//   2. 로컬 안전장치 유지 -- 모델을 안 부르는 건너뛰기는 답 없이 연달아 12개까지.
//      "모르겠어요"처럼 화면이 발판으로 받은 답은 답으로 세지 않는다(F2049-02).
//   3. 하루 몫 거절은 끝맺음 -- "다시 시도" 오류가 아니라 "여기까지 · 나중에 이어서".
//      재개 시각도, 받은 질문 수도 말하지 않는다(F2049-03).
//
// 판정은 순수 함수(`session-end.ts`)로 뽑아 값으로 본다. 화면 렌더 테스트는 이
// 저장소에서 막혀 있어서(RN 0.85) 화면은 **주석을 뺀 코드**로 본다 -- 주석에 옛
// 상수 이름이 남아 있다고 실패하거나, 주석만 남기고 코드를 지웠는데 통과하면 안 된다.

const mockInvoke = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: "test-key",
    SENTRY_DSN: undefined,
  }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { FunctionsHttpError } from "@supabase/supabase-js";

import {
  INTERVIEW_PURPOSE,
  MAX_UNANSWERED_PROMPTS,
  isDayLimitRefusal,
  localPromptsExhausted,
  readDayLimitRefusal,
  unansweredPromptRun,
} from "../session-end";
import { emptyCoverage, nextMove, nextProbe, seedQuestion, type DrillLayer, type InterviewTurn } from "../probe";
import { isNonAnswer, scaffoldQuestion } from "../stuck";
import { answerDisposition, canCreditAnswer } from "../continuity";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

/** 주석을 뺀 코드. 판정은 코드에서 하고, 주석은 설명일 뿐이다. */
function codeOnly(rel: string): string {
  const sf = ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ts.createPrinter({ removeComments: true }).printFile(sf);
}

/** `from` 부터 `to` 직전까지. 둘 중 하나라도 없으면 빈 문자열이라 아래 단언이 실패한다. */
function between(src: string, from: string, to: string, start = 0): string {
  const a = src.indexOf(from, start);
  if (a < 0) return "";
  const b = src.indexOf(to, a + from.length);
  return b < 0 ? "" : src.slice(a, b);
}

const I = (text = "q"): InterviewTurn => ({ role: "interviewer", text });
const U = (text = "a"): InterviewTurn => ({ role: "user", text });
/** 일반 배열용 판정: 텍스트가 DK 인 사용자 턴만 "발판으로 받은 답"이다.
 *  화면의 실제 판정으로 도는 교대 시뮬레이션은 "2-1" 절에 따로 있다. */
const DK = "dk";
const isDk = (turn: InterviewTurn) => turn.text === DK;

function refusal(status: number, body: unknown): FunctionsHttpError {
  return new FunctionsHttpError(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("1. 하드 종료 없음", () => {
  it("화면 코드에 턴 상한이 없다", () => {
    expect(codeOnly("src/app/interview.tsx")).not.toMatch(/\bMAX_TURNS\b/);
  });

  it("답을 보낼 때 대화를 끝내는 길은 사용자의 거절 하나뿐이다", () => {
    const code = codeOnly("src/app/interview.tsx");
    const send = between(code, "async function send(", "function changeAngle(");
    expect(send.length).toBeGreaterThan(0);
    const finishes = send.match(/\bfinish\(\)/g) ?? [];
    expect(finishes).toHaveLength(1);
    expect(send.indexOf('disposition === "stop"')).toBeGreaterThan(-1);
    expect(send.indexOf('disposition === "stop"')).toBeLessThan(send.indexOf("finish()"));
    // 사용자 답의 개수를 세는 코드 자체가 없어야 한다.
    expect(send).not.toMatch(/role\s*===\s*"user"\)\.length/);
  });

  it("아주 긴 대화도 로컬 안전장치에 걸리지 않는다 (답이 계속 오는 한)", () => {
    const turns: InterviewTurn[] = [];
    for (let i = 0; i < 200; i += 1) turns.push(I(), U());
    turns.push(I());
    expect(turns.filter((t) => t.role === "interviewer").length).toBeGreaterThan(MAX_UNANSWERED_PROMPTS);
    expect(localPromptsExhausted(turns, isDk)).toBe(false);
    // 답 직후 건너뛰기를 한계 바로 아래까지 눌러도 그대로다.
    for (let i = 1; i < MAX_UNANSWERED_PROMPTS - 1; i += 1) turns.push(I());
    expect(unansweredPromptRun(turns, isDk)).toBe(MAX_UNANSWERED_PROMPTS - 1);
    expect(localPromptsExhausted(turns, isDk)).toBe(false);
  });
});

describe("2. 로컬 안전장치 (모델을 안 부르는 건너뛰기)", () => {
  it("한계는 예전 값 12 그대로다. 바뀐 것은 세는 대상이다", () => {
    expect(MAX_UNANSWERED_PROMPTS).toBe(12);
  });

  it("마지막 답 뒤로 연달아 붙은 질문만 센다", () => {
    expect(unansweredPromptRun([], isDk)).toBe(0);
    expect(unansweredPromptRun([I()], isDk)).toBe(1);
    expect(unansweredPromptRun([I(), U()], isDk)).toBe(0);
    expect(unansweredPromptRun([I(), U(), I(), I(), I()], isDk)).toBe(3);
  });

  it("발판으로 받은 답은 셈을 0 으로 돌리지도, 질문으로 더해지지도 않는다", () => {
    expect(unansweredPromptRun([I(), U(DK)], isDk)).toBe(1);
    expect(unansweredPromptRun([I(), U(DK), I(), I()], isDk)).toBe(3);
    expect(unansweredPromptRun([I(), U(DK), I(), U(DK), I()], isDk)).toBe(3);
    // 실질 답은 그대로 0 으로 돌린다. 그 앞의 발판 답은 볼 필요가 없다.
    expect(unansweredPromptRun([I(), U(DK), I(), U(), I()], isDk)).toBe(1);
    expect(unansweredPromptRun([I(), U(), I(), U(DK), I()], isDk)).toBe(2);
  });

  it("씨앗 질문 + 건너뛰기 열한 번이면 더 붙이지 않는다", () => {
    const seedOnly = [I("seed")];
    const eleven = [...seedOnly, ...Array.from({ length: 10 }, () => I("another"))];
    expect(localPromptsExhausted(eleven, isDk)).toBe(false);
    const twelve = [...eleven, I("another")];
    expect(localPromptsExhausted(twelve, isDk)).toBe(true);
    // 답을 하나 하면 다시 처음부터 센다.
    expect(localPromptsExhausted([...twelve, U(), I()], isDk)).toBe(false);
    // "모르겠어요"는 답이 아니라 다시 세지 않는다.
    expect(localPromptsExhausted([...twelve, U(DK), I()], isDk)).toBe(true);
  });

  it("화면의 건너뛰기 · 사실만은 질문을 붙이기 전에 이 검사를 거친다", () => {
    const code = codeOnly("src/app/interview.tsx");
    const angle = between(code, "function changeAngle(", "async function keepIt(");
    expect(angle.length).toBeGreaterThan(0);
    const call = "localPromptsExhausted(turns, (turn) => isLocalNonAnswer(turn.text, turn.layer))";
    const guard = angle.indexOf(call);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(angle.indexOf("setTurns("));
    expect(between(angle, call, "setTurns(")).toContain("finish()");
    // 대화 전체의 질문 수를 세면 12턴 상한이 이름만 바꿔 남는다.
    expect(angle).not.toMatch(/role\s*===\s*"interviewer"\)\.length/);
  });

  it("send() 의 막힘 판정과 건너뛰기 가드가 같은 함수다 (갈라지면 교대 반복이 다시 열린다)", () => {
    const code = codeOnly("src/app/interview.tsx");
    const def = between(code, "const isLocalNonAnswer = useCallback(", "const entriesOf = useCallback(");
    expect(def).toContain("layer != null && (isBlockedAnswer(text) || !canCreditAnswer(text, layer, locale))");
    const send = between(code, "async function send(", "function changeAngle(");
    expect(send).toContain("const blocked = isLocalNonAnswer(text, pendingLayer);");
    // 막힘을 따로 다시 계산하는 사본이 없어야 한다.
    expect(send).not.toMatch(/canCreditAnswer\(/);
    expect(send).toContain("layer: pendingLayer ?? undefined");
  });
});

describe("2-1. 모르겠어요 -> 건너뛰기 교대 (게이트 F2049-02)", () => {
  // 화면이 실제로 하는 일을 순서대로 다시 밟는다. 판정은 화면과 같은 함수들이다:
  //   모르겠어요 칩 -> send(): 사용자 턴 + 막힘 -> nextMove 가 발판(모델 안 부름)
  //   건너뛰기 칩  -> changeAngle("skip"): 가드 -> 새 장면 질문 · 막힘 횟수 · 포기 목록 초기화
  // 사용자 턴을 무엇이든 답으로 세던 가드에서는 이 교대가 끝나지 않았다.
  type Locale = "en" | "ko";
  const drillOf = (loc: Locale) =>
    JSON.parse(read(`locales/${loc}/interview.json`)).drill as Record<string, string>;

  /** 화면의 `isLocalNonAnswer` 와 같은 판정(정의는 위 배선 검사가 고정한다). */
  const screenJudge = (loc: Locale) => {
    const dontKnow = drillOf(loc).dontKnow;
    return (text: string, layer: DrillLayer | null | undefined): boolean =>
      layer != null && (text === dontKnow || isNonAnswer(text, loc) || !canCreditAnswer(text, layer, loc));
  };

  const realJudge = (loc: Locale) => {
    const isLocal = screenJudge(loc);
    return (turn: InterviewTurn) => isLocal(turn.text, turn.layer);
  };

  /** 교대를 최대 `cycles` 번 밟고, 가드가 끝낸 회차를 돌려준다(안 끝나면 null). */
  function alternate(loc: Locale, reply: string, judge: (turn: InterviewTurn) => boolean, cycles = 50) {
    const period = "school" as const;
    const anotherScene = drillOf(loc).anotherScene;
    const isLocal = screenJudge(loc);
    let turns: InterviewTurn[] = [
      { role: "interviewer", text: seedQuestion(period, loc), layer: "fact", period, sceneStart: true },
    ];
    let pending: DrillLayer = "fact";
    let streak = 0;
    let abandoned: DrillLayer[] = [];
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      // 모르겠어요 (또는 너무 짧은 답) -- 거절 · 건너뛰기로 읽히지 않고 send() 의 막힘 길로 간다.
      expect(["stop", "skip"]).not.toContain(answerDisposition(reply, loc));
      const user: InterviewTurn = { role: "user", text: reply, layer: pending, period };
      expect(isLocal(user.text, user.layer)).toBe(true);
      const history = [...turns, user];
      const nextStreak = streak + 1;
      const move = nextMove(emptyCoverage(), period, [], new Date(), { layer: pending, streak: nextStreak },
        abandoned, { history, locale: loc });
      // 발판이다 -- 모델을 부르지 않으니 서버의 하루 몫이 이 반복을 끊지 못한다.
      expect(move.kind).toBe("scaffold");
      if (move.kind !== "scaffold") return null;
      turns = [
        ...history,
        { role: "interviewer", text: scaffoldQuestion(move.layer, loc, nextStreak), layer: move.layer, period },
      ];
      pending = move.layer;
      streak = nextStreak;
      // 건너뛰기
      if (localPromptsExhausted(turns, judge)) return { cycle, turns: turns.length };
      turns = [...turns, { role: "interviewer", text: anotherScene, layer: "fact", period, sceneStart: true }];
      pending = "fact";
      streak = 0;
      abandoned = [];
    }
    return null;
  }

  it.each(["ko", "en"] as const)("%s 모르겠어요 칩: 여섯 번째 교대에서 끝난다", (loc) => {
    // 씨앗 1 + (발판 1 + 새 장면 1) x 5 + 발판 1 = 질문 12, 사용자 턴 6 -> 배열 18
    expect(alternate(loc, drillOf(loc).dontKnow, realJudge(loc))).toEqual({ cycle: 6, turns: 18 });
  });

  it.each([
    ["ko", "응"],
    ["en", "ok"],
  ] as const)("%s 너무 짧은 답 %p 도 같은 길이라 같이 막힌다", (loc, reply) => {
    expect(alternate(loc, reply, realJudge(loc))).toEqual({ cycle: 6, turns: 18 });
  });

  it("사용자 턴을 무엇이든 답으로 세면 쉰 번을 돌아도 안 끝난다 (고친 결함의 재현)", () => {
    expect(alternate("ko", drillOf("ko").dontKnow, () => false)).toBeNull();
  });
});

describe("3. 하루 몫 거절은 끝맺음이다", () => {
  describe("순수 판정 isDayLimitRefusal", () => {
    it.each([
      ["공용 하루 지출 한도", 429, { error: "daily_limit_exceeded" }, true],
      ["이 목적의 하루 몫", 429, { error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }, true],
      ["다른 목적의 하루 몫", 429, { error: "purpose_limit_exceeded", feature: "secondb_chat" }, false],
      ["목적을 안 밝힌 목적별 몫", 429, { error: "purpose_limit_exceeded" }, false],
      ["전역 처리량 (잠시 뒤 풀린다)", 429, { error: "llm_capacity_exceeded" }, false],
      ["같은 코드라도 429 가 아니면", 503, { error: "daily_limit_exceeded" }, false],
      ["지출 검사 장애", 503, { error: "spend_check_unavailable" }, false],
      ["권한 거절", 403, { error: "entitlement_required", feature: INTERVIEW_PURPOSE }, false],
      ["본문이 null", 429, null, false],
      ["본문이 문자열", 429, "daily_limit_exceeded", false],
      ["본문이 배열", 429, ["daily_limit_exceeded"], false],
    ])("%s", (_name, status, body, expected) => {
      expect(isDayLimitRefusal(status, body, INTERVIEW_PURPOSE)).toBe(expected);
    });
  });

  describe("오류에서 읽기 readDayLimitRefusal", () => {
    it("functions-js 의 FunctionsHttpError 를 읽고, 본문을 다른 처리를 위해 남긴다", async () => {
      const error = refusal(429, { error: "daily_limit_exceeded" });
      await expect(readDayLimitRefusal(error, INTERVIEW_PURPOSE)).resolves.toBe(true);
      const response = error.context as Response;
      expect(response.bodyUsed).toBe(false);
      await expect(response.json()).resolves.toEqual({ error: "daily_limit_exceeded" });
    });

    it("캡처 세션 경로의 오류(열거 안 되는 context)도 읽는다", async () => {
      const error = new Error("captured_session_request_failed");
      Object.defineProperty(error, "context", {
        enumerable: false,
        value: new Response(
          JSON.stringify({ error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }),
          { status: 429 },
        ),
      });
      await expect(readDayLimitRefusal(error, INTERVIEW_PURPOSE)).resolves.toBe(true);
    });

    it("본문을 못 읽는 429 는 근거가 없으니 오류로 남긴다", async () => {
      const error = new FunctionsHttpError(new Response("<html>busy</html>", { status: 429 }));
      await expect(readDayLimitRefusal(error, INTERVIEW_PURPOSE)).resolves.toBe(false);
    });

    it("429 가 아니면 본문을 건드리지 않는다", async () => {
      const error = refusal(503, { error: "daily_limit_exceeded" });
      await expect(readDayLimitRefusal(error, INTERVIEW_PURPOSE)).resolves.toBe(false);
      expect((error.context as Response).bodyUsed).toBe(false);
    });

    it.each([null, undefined, "daily_limit_exceeded", new Error("network"), { context: null }])(
      "응답이 없는 실패는 하루 몫이 아니다 (%p)",
      async (error) => {
        await expect(readDayLimitRefusal(error, INTERVIEW_PURPOSE)).resolves.toBe(false);
      },
    );
  });

  describe("경계 모듈을 지나서도 읽힌다 (nextProbe -> callLlm -> 프록시 429)", () => {
    const turns: InterviewTurn[] = [
      { role: "interviewer", text: "What do you remember?", layer: "fact", period: "school" },
      { role: "user", text: "I walked to school with my brother every morning.", layer: "fact", period: "school" },
    ];
    const savedFailover = process.env.EXPO_PUBLIC_FAILOVER_VENDOR;
    let warnSpy: jest.SpyInstance | null = null;

    beforeEach(() => mockInvoke.mockReset());
    afterEach(() => {
      warnSpy?.mockRestore();
      warnSpy = null;
      if (savedFailover === undefined) delete process.env.EXPO_PUBLIC_FAILOVER_VENDOR;
      else process.env.EXPO_PUBLIC_FAILOVER_VENDOR = savedFailover;
    });

    async function thrownBy(): Promise<unknown> {
      try {
        await nextProbe("u1", "en", "school", turns, emptyCoverage(), false);
      } catch (error) {
        return error;
      }
      throw new Error("nextProbe resolved; expected the proxy refusal to be thrown");
    }

    it.each([
      [{ error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }, true],
      [{ error: "daily_limit_exceeded" }, true],
      [{ error: "llm_capacity_exceeded" }, false],
    ])("%p -> 끝맺음 %p", async (body, expected) => {
      mockInvoke.mockResolvedValue({ data: null, error: refusal(429, body) });
      const error = await thrownBy();
      // 화면이 넘기는 목적 이름과 실제로 프록시에 실린 목적이 같아야 feature 대조가 맞는다.
      expect(mockInvoke.mock.calls[0]?.[1]?.body?.purpose).toBe(INTERVIEW_PURPOSE);
      await expect(readDayLimitRefusal(error, INTERVIEW_PURPOSE)).resolves.toBe(expected);
    });

    it("장애 대비 재시도가 켜져 있어도 같은 카운터라 두 번째 거절이 그대로 읽힌다", async () => {
      warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
      mockInvoke.mockImplementation(async () => ({
        data: null,
        error: refusal(429, { error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }),
      }));
      const error = await thrownBy();
      // 재시도가 실제로 일어났는지부터 본다. 한 번만 불렸다면 이 검사는 위와 같은 것을 본다.
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(mockInvoke.mock.calls[0]?.[0]).not.toBe(mockInvoke.mock.calls[1]?.[0]);
      await expect(readDayLimitRefusal(error, INTERVIEW_PURPOSE)).resolves.toBe(true);
    });
  });

  it("프록시 넷이 그 모양으로 거절한다 (서버와 판정이 갈라지지 않게)", () => {
    for (const fn of ["openai-proxy", "claude-proxy", "gemini-proxy", "xai-proxy"]) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect({ fn, daily: src.includes("{ error: 'daily_limit_exceeded' }, 429") }).toEqual({ fn, daily: true });
      expect({ fn, purpose: src.includes("{ error: 'purpose_limit_exceeded', feature: purpose }, 429") }).toEqual({
        fn,
        purpose: true,
      });
    }
  });

  it("화면은 그 거절을 오류 안내보다 먼저 끝맺음으로 받는다", () => {
    const code = codeOnly("src/app/interview.tsx");
    const ask = between(code, "const ask = useCallback(", "const started = useRef(");
    const handler = between(ask, "catch (error)", "finally");
    expect(handler.length).toBeGreaterThan(0);
    const limit = handler.indexOf("readDayLimitRefusal(error, INTERVIEW_PURPOSE)");
    const failed = handler.indexOf('setNotice(t("drill.failed"))');
    expect(limit).toBeGreaterThan(-1);
    expect(failed).toBeGreaterThan(limit);
    const branch = handler.slice(limit, failed);
    expect(branch).toContain("setDayLimited(true)");
    expect(branch).toContain("finish()");
    expect(branch).toMatch(/return;/);
  });

  it("끝 화면은 안내 한 줄만 바꾸고, 지금까지의 대화를 담는 버튼은 그대로다", () => {
    const code = codeOnly("src/app/interview.tsx");
    expect(code).toContain('dayLimited ? t("drill.dayLimit") : t("drill.closing")');
    const doneBranch = /\{done \?[\s\S]*?\) : \(/.exec(read("src/app/interview.tsx"))?.[0] ?? "";
    expect(doneBranch).toContain('t("drill.dayLimit")');
    expect(doneBranch).toContain("onPress={() => void keepIt()}");
    expect(doneBranch).toContain("disabled={busy || userTurns === 0}");
    expect(doneBranch).not.toContain("dayLimited &&");
  });

  it("다섯 로케일이 안내 문구를 갖고, 오류 문구와 다르다", () => {
    for (const loc of ["en", "ko", "es", "pt", "id"]) {
      const drill = JSON.parse(read(`locales/${loc}/interview.json`)).drill as Record<string, string>;
      expect({ loc, has: typeof drill.dayLimit === "string" && drill.dayLimit.trim().length > 0 }).toEqual({
        loc,
        has: true,
      });
      expect({ loc, same: drill.dayLimit === drill.failed }).toEqual({ loc, same: false });
      expect({ loc, emDash: drill.dayLimit.includes("—") }).toEqual({ loc, emDash: false });
    }
    // B안: 사실 · 안내는 ~습니다, 제안은 해요체.
    const ko = JSON.parse(read("locales/ko/interview.json")).drill.dayLimit as string;
    expect(ko).toContain("습니다.");
    expect(ko).toMatch(/해요\.$/);
  });

  // F2049-03: 두 카운터가 하루를 다르게 끊고(목적별 몫 KST 자정 · 지출 한도 UTC 자정),
  // 목적별 몫은 실패한 요청도 쓴다. 그래서 안내는 재개 시각도, 받은 질문 수도 단정하지 않는다.
  it.each([
    ["en", /\btomorrow\b|\btoday's questions\b|\bused up\b/i],
    ["ko", /내일|모두 받았|받을 수 있는 질문/],
    ["es", /mañana|no quedan preguntas/i],
    ["pt", /amanhã|perguntas de hoje/i],
    ["id", /besok|pertanyaan untuk hari ini/i],
  ])("%s 안내는 재개 시각이나 받은 질문을 단정하지 않는다", (loc, claim) => {
    const drill = JSON.parse(read(`locales/${loc}/interview.json`)).drill as Record<string, string>;
    expect(drill.dayLimit).not.toMatch(claim);
  });
});
