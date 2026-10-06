// 장면은 답의 개수가 아니라 인정된 진전으로 끝난다 (QA 261005 R2F-09).
//
// 2차 점검(wf8-round2 R2F-drilldown, 하네스 시나리오 I): `nextMove` 의 장면 경로에
// `answers.length >= 8` 이 있었다. 인정 여부와 상관없이 답을 세서, 두 층에서 막혔다
// 회복한 사람은 8번째 답에서 끝났고 울림(L5)은 한 번도 묻지 않았다.
//
// 이 파일이 지키는 것:
//   1. 인정되지 않은 답이 여럿 쌓여도 장면이 개수로 끝나지 않는다 (8답 상한 없음).
//   2. 그래도 장면은 유한하다 -- 다섯 층이 모두 인정되거나, 원래 있던 규칙(거절 · 발판 소진 ·
//      한 층에서 세 번 인정 못 받음)이 끝낸다. 판정을 받는 호출은 한 층에서 세 번, 한 장면에서
//      열다섯 번을 넘지 않는다.
//   3. 마지막 층도 인정돼야 끝난다 (게이트 LAST-01). 판정 전 답을 미리 세어 울림 칸이 빈 채 저장
//      화면으로 가지 않는다. 오류로 판정을 못 받은 답은 진전으로 세지 않는다.
//   4. "사실만"의 4답 상한은 인정된 답만 센다 (게이트 LAST-02). 오류 세 번 뒤 네 번째 입력이 모델
//      판정 없이 끝나지 않는다.
//
// 화면(`src/app/interview.tsx` 의 send · ask)을 그대로 옮긴 시뮬레이터로 돈다. 판정은 가짜지만
// 층 고르기 · 칸 판정 · 발판 판정은 실제 순수 함수다. 옮긴 줄이 화면에 그대로 있는지는 맨 아래
// 소스 계약이 확인한다 -- 화면이 바뀌면 이 시뮬레이터도 바뀌어야 한다.

import { readFileSync } from "fs";
import { join } from "path";
import * as ts from "typescript";
import { canCreditAnswer, confirmedAnswer, currentScene } from "../continuity";
import {
  DRILL_LAYERS,
  emptyCoverage,
  incrementCoverage,
  nextMove,
  seedQuestion,
  type Coverage,
  type DrillLayer,
  type InterviewTurn,
  type LifePeriod,
} from "../probe";
import { isNonAnswer, MAX_SCAFFOLDS_PER_LAYER, scaffoldQuestion, shouldScaffold } from "../stuck";

type Locale = "en" | "ko";
/** 모델 판정: 그 층에 닿음 · none · 다른 층 · 판정 없음(응답이 깨짐). */
type Verdict = "credit" | "none" | "other" | "silent";
/** 사용자가 하는 일: "모르겠어요"(화면이 받음) · 답(모델이 판정) · 요청 오류(판정 없음, catch) ·
 *  위험 신호 출력(판정 없음, 핫라인을 띄우고 돌아온다). */
type Step = { kind: "block" } | { kind: "answer"; verdict: Verdict } | { kind: "error" } | { kind: "red" };
/** 대화가 끝난 길. complete = 인정된 진전(장면 완료 · "사실만" 4답), missed = 한 층에서 세 번
 *  인정 못 받음, local = 판정 없이 끝냄(발판 소진 · 전부 포기). */
type EndedBy = "complete" | "missed" | "local";

const PERIOD: LifePeriod = "work";
const NOW = new Date("2026-10-06T00:00:00Z");
const ANSWER: Record<Locale, string> = {
  ko: "그날 회의에서 팀장님이 제 발표를 중간에 끊었어요",
  en: "My manager cut me off halfway through the Monday meeting",
};
const DONT_KNOW: Record<Locale, string> = { ko: "모르겠어요", en: "I don't know" };

interface Run {
  done: boolean;
  endedBy: EndedBy | null;
  answers: number;
  /** 판정을 받은 `nextProbe` 호출(직전 답에 겨냥 층이 있었다). 층별로도 센다. */
  judged: number;
  judgedPerLayer: Record<DrillLayer, number>;
  /** 판정을 못 받은 호출(오류 · 위험 신호) 과 그 뒤 겨냥 층 없이 나간 호출. */
  unjudged: number;
  /** 인정되어 칸이 오른 층(순서대로). */
  credited: DrillLayer[];
  /** 모델 질문이 겨냥한 층(순서대로). 울림까지 물었는지 본다. */
  asked: DrillLayer[];
  /** 멈춘 시점의 대화와, 다음 답이 겨냥할 층(화면의 pendingLayer). */
  turns: InterviewTurn[];
  pending: DrillLayer | null;
}

/**
 * 화면의 send() · ask() 를 옮긴 것. `next()` 가 null 을 주면(또는 대화가 끝나면) 멈춘다.
 * `answers` 가 `maxAnswers` 를 넘으면 끝나지 않은 것으로 돌려준다(무한 반복 감지용).
 * `concreteOnly` 는 화면의 changeAngle("concrete") 를 누른 뒤의 상태로 시작한다.
 */
function simulate(
  locale: Locale,
  next: (run: Run) => Step | null,
  opts: { maxAnswers?: number; concreteOnly?: boolean } = {},
): Run {
  const maxAnswers = opts.maxAnswers ?? 200;
  const concreteOnly = opts.concreteOnly === true;
  let turns: InterviewTurn[] = [
    { role: "interviewer", text: seedQuestion(PERIOD, locale), layer: "fact", period: PERIOD, sceneStart: true },
  ];
  // interview.tsx `changeAngle("concrete")`: 같은 장면에 구체 질문을 붙이고 사실 층만 묻는다.
  if (concreteOnly) turns = [...turns, { role: "interviewer", text: "concrete-q", layer: "fact", period: PERIOD }];
  let pending: DrillLayer | null = "fact";
  let stuckStreak = 0;
  let abandoned: DrillLayer[] = [];
  let coverage: Coverage = emptyCoverage();
  const run: Run = {
    done: false, endedBy: null, answers: 0, judged: 0, unjudged: 0, credited: [], asked: [], turns, pending,
    judgedPerLayer: { fact: 0, feeling: 0, meaning: 0, belief: 0, echo: 0 },
  };
  const end = (by: EndedBy): void => {
    run.done = true;
    run.endedBy = by;
  };

  const otherThan = (layer: DrillLayer): DrillLayer => (layer === "fact" ? "feeling" : "fact");

  // interview.tsx `ask`
  const ask = (
    history: InterviewTurn[], cov: Coverage,
    stuck: { layer: DrillLayer; streak: number } | null, giveUp: DrillLayer[],
    credited: DrillLayer | null, step: Step,
  ): void => {
    const move = nextMove(cov, PERIOD, [], NOW, stuck, giveUp, { history, locale, concreteOnly });
    if (move.kind === "finish" && !credited) {
      turns = history;
      end("local");
      return;
    }
    if (move.kind === "loopCheck") throw new Error("the scene path never loop-checks");
    if (move.kind === "scaffold") {
      turns = [...history, {
        role: "interviewer", text: scaffoldQuestion(move.layer, locale, stuck?.streak ?? 1), layer: move.layer, period: PERIOD,
      }];
      pending = move.layer;
      return;
    }
    const layer = move.kind === "finish" ? (credited as DrillLayer) : move.layer;
    if (step.kind === "error") {
      // catch: 판정 없음. 답을 unsettled 로 표시하고 겨냥하던 층을 되돌린다(LAST-02).
      run.unjudged += 1;
      turns = history.map((turn, index) => index === history.length - 1 && turn.role === "user"
        ? { ...turn, unsettled: true }
        : turn);
      pending = credited;
      return;
    }
    if (step.kind === "red") {
      // 위험 신호 출력: 핫라인을 띄우고 돌아온다. 판정 없음, 겨냥 층은 send() 가 비운 그대로.
      run.unjudged += 1;
      turns = history;
      return;
    }
    if (credited === null) {
      // 겨냥 층이 없던 답(위험 신호 뒤). 모델은 불리지만 판정은 쓰이지 않는다.
      run.unjudged += 1;
    } else {
      run.judged += 1;
      run.judgedPerLayer[credited] += 1;
    }
    const verdict = step.kind === "answer" ? step.verdict : "silent";
    const answeredLayer = credited === null ? undefined
      : verdict === "credit" ? credited
      : verdict === "none" ? null
      : verdict === "other" ? otherThan(credited)
      : undefined;
    const lastAnswer = history[history.length - 1];
    const confirmed = credited && lastAnswer
      ? confirmedAnswer(lastAnswer.text, credited, locale, answeredLayer)
      : false;
    const assessed = history.map((turn, index) => index === history.length - 1 && turn.role === "user"
      ? { ...turn, answered: Boolean(confirmed) }
      : turn);
    if (credited && confirmed) {
      coverage = incrementCoverage(cov, PERIOD, credited);
      run.credited.push(credited);
    }
    if (move.kind === "finish" && confirmed) {
      turns = assessed;
      end("complete");
      return;
    }
    if (credited && !confirmed) {
      const streak = currentScene(history).filter((turn) => turn.role === "user"
        && turn.layer === credited && turn.answered === false).length + 1;
      stuckStreak = streak;
      if (shouldScaffold(streak)) {
        turns = [...assessed, {
          role: "interviewer", text: scaffoldQuestion(credited, locale, streak), layer: credited, period: PERIOD,
        }];
        pending = credited;
        return;
      }
      turns = assessed;
      end("missed");
      return;
    }
    run.asked.push(layer);
    turns = [...assessed, { role: "interviewer", text: `q-${layer}-${run.answers}`, layer, period: PERIOD }];
    pending = layer;
  };

  // interview.tsx `send`
  while (!run.done && run.answers < maxAnswers) {
    const step = next(run);
    if (step === null) break;
    const text = step.kind === "block" ? DONT_KNOW[locale] : `${ANSWER[locale]} ${run.answers + 1}`;
    run.answers += 1;
    const answered: InterviewTurn = { role: "user", text, layer: pending ?? undefined, period: PERIOD };
    const nextTurns = [...turns, answered];
    const blocked = pending != null && (isNonAnswer(text, locale) || !canCreditAnswer(text, pending, locale));
    const nextStreak = blocked ? stuckStreak + 1 : 0;
    const stuck = blocked && pending ? { layer: pending, streak: nextStreak } : null;
    const nextAbandoned = pending && nextStreak > MAX_SCAFFOLDS_PER_LAYER && !abandoned.includes(pending)
      ? [...abandoned, pending]
      : abandoned;
    turns = nextTurns;
    stuckStreak = nextAbandoned !== abandoned ? 0 : nextStreak;
    abandoned = nextAbandoned;
    const credited = blocked ? null : pending;
    pending = null;
    ask(nextTurns, coverage, stuck, nextAbandoned, credited, step);
  }
  run.turns = turns;
  run.pending = pending;
  return run;
}

/** 정해 둔 순서대로 한 걸음씩. 다 쓰면 null. */
const script = (steps: readonly Step[]) => {
  let i = 0;
  return () => steps[i++] ?? null;
};
const B: Step = { kind: "block" };
const C: Step = { kind: "answer", verdict: "credit" };
const N: Step = { kind: "answer", verdict: "none" };
const O: Step = { kind: "answer", verdict: "other" };
const S: Step = { kind: "answer", verdict: "silent" };
const E: Step = { kind: "error" };
const R: Step = { kind: "red" };
/** 네 층(사실 · 감정 · 의미 · 믿음)을 한 번씩 인정받는다. 다음 답은 울림을 겨냥한다. */
const FOUR: readonly Step[] = [C, C, C, C];

/** 장면 완료는 다섯 층이 모두 인정됐을 때만이다 (LAST-01 의 불변식). */
function expectCompleteOnlyWithAllLayers(run: Run): void {
  expect({ endedBy: run.endedBy, allLayers: run.credited.length === DRILL_LAYERS.length })
    .toEqual({ endedBy: run.endedBy, allLayers: run.endedBy === "complete" });
}

describe("1. 8답에서 끝나지 않는다 (R2F-09)", () => {
  it.each(["ko", "en"] as const)("%s: 두 층에서 막혔다 회복해도 울림까지 묻고, 다섯 층이 인정되면 끝난다 (시나리오 I)", (locale) => {
    // 사실 · 감정에서 각각 두 번 인정 못 받고(none · 다른 층) 세 번째에 인정. 나머지 셋은 한 번에.
    const run = simulate(locale, script([N, O, C, O, N, C, C, C, C]));
    expect(run.answers).toBe(9);
    expect(run.asked).toContain("echo");
    expect(run.credited).toEqual(["fact", "feeling", "meaning", "belief", "echo"]);
    expect(run.done).toBe(true);
    expect(run.endedBy).toBe("complete");
  });

  it("\"모르겠어요\" 발판으로 막혔다 회복한 경우도 같다", () => {
    const run = simulate("ko", script([B, B, C, B, B, C, C, C, C]));
    expect(run.answers).toBe(9);
    expect(run.judged).toBe(5);
    expect(run.credited).toEqual([...DRILL_LAYERS]);
    expect(run.done).toBe(true);
  });

  it("인정 못 받은 답이 여덟 개를 넘어도 장면 규칙은 다음 층을 고른다", () => {
    // 네 층에서 두 번씩 인정 못 받고 세 번째에 인정 = 12답. 다음 수는 울림이다.
    const history: InterviewTurn[] = [{ role: "interviewer", text: "q", layer: "fact", sceneStart: true }];
    for (const layer of ["fact", "feeling", "meaning", "belief"] as const) {
      history.push(
        { role: "user", text: `${ANSWER.ko} ${layer}1`, layer, answered: false },
        { role: "interviewer", text: "s", layer },
        { role: "user", text: `${ANSWER.ko} ${layer}2`, layer, answered: false },
        { role: "interviewer", text: "s", layer },
        { role: "user", text: `${ANSWER.ko} ${layer}3`, layer, answered: true },
        { role: "interviewer", text: "q", layer },
      );
    }
    expect(history.filter((t) => t.role === "user")).toHaveLength(12);
    expect(nextMove(emptyCoverage(), PERIOD, [], NOW, null, [], { history, locale: "ko" }))
      .toEqual({ kind: "drill", layer: "echo" });
  });
});

describe("2. 장면은 유한하다 -- 판정 호출은 층마다 3, 장면마다 15 이하", () => {
  it("모델 판정만으로 된 모든 순서(인정 · none)를 다 돌려도 끝나고 상한을 지킨다", () => {
    // 인정 못 받음 셋(none · 다른 층 · 판정 없음)은 화면에서 같은 길이라(실패 하나로 센다) none 으로
    // 대표하고, 나머지 둘은 아래 최대 경로 · 무작위 섞기에서 섞는다.
    const verdicts: Verdict[] = ["credit", "none"];
    let leaves = 0;
    let completes = 0;
    let maxJudged = 0;
    const walk = (prefix: Verdict[]): void => {
      if (prefix.length > 40) throw new Error(`scene did not finish within 40 judged calls: ${prefix.join(",")}`);
      let i = 0;
      let needMore = false;
      const run = simulate("ko", () => {
        if (i < prefix.length) return { kind: "answer", verdict: prefix[i++]! };
        needMore = true;
        return null;
      });
      if (needMore && !run.done) {
        for (const v of verdicts) walk([...prefix, v]);
        return;
      }
      leaves += 1;
      expect(run.done).toBe(true);
      expect(run.judged).toBeLessThanOrEqual(15);
      for (const layer of DRILL_LAYERS) expect(run.judgedPerLayer[layer]).toBeLessThanOrEqual(3);
      expectCompleteOnlyWithAllLayers(run);
      if (run.endedBy === "complete") completes += 1;
      maxJudged = Math.max(maxJudged, run.judged);
    };
    walk([]);
    // 층마다 "인정 · 못 받고 인정 · 두 번 못 받고 인정"(계속) 셋과 "세 번 못 받음"(끝) 하나.
    // 마지막 층도 같다(LAST-01): k 번째 층에서 세 번 못 받고 끝나는 순서 3^(k-1) 을 다섯 층 더해
    // 1+3+9+27+81 = 121, 다섯 층을 모두 인정받는 순서 3^5 = 243. 합 364.
    expect(completes).toBe(243);
    expect(leaves).toBe(364);
    // 예전(8답 상한)의 최대는 8 이었다. 이제 15: 다섯 층 x (못 받음 둘 + 인정).
    expect(maxJudged).toBe(15);
  });

  it("최대 경로: 다섯 층 모두 두 번씩 못 받고 세 번째에 인정된다 (판정 15회)", () => {
    const run = simulate("ko", script([N, N, C, O, S, C, N, O, C, S, N, C, N, O, C]));
    expect(run.judged).toBe(15);
    expect(run.judgedPerLayer).toEqual({ fact: 3, feeling: 3, meaning: 3, belief: 3, echo: 3 });
    expect(run.credited).toEqual([...DRILL_LAYERS]);
    expect(run.done).toBe(true);
    expect(run.endedBy).toBe("complete");
  });

  it("세 번째로 인정 못 받으면 원래대로 대화가 끝난다 (이번에 바꾸지 않은 규칙)", () => {
    const run = simulate("ko", script([C, O, N, S, C]));
    expect(run.done).toBe(true);
    expect(run.endedBy).toBe("missed");
    expect(run.answers).toBe(4);
    expect(run.judgedPerLayer.feeling).toBe(3);
  });

  it("발판 · 다른 층 · 판정 없음을 무작위로 섞어도 끝나고 상한을 지킨다 (고정 씨앗 3000회)", () => {
    let seed = 20261006;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = (): Step => {
      const r = rand();
      return r < 0.25 ? B : r < 0.55 ? C : r < 0.7 ? N : r < 0.85 ? O : S;
    };
    let maxAnswers = 0;
    let maxJudged = 0;
    for (let k = 0; k < 3000; k += 1) {
      const run = simulate(k % 2 === 0 ? "ko" : "en", () => pick(), { maxAnswers: 100 });
      expect(run.done).toBe(true);
      expect(run.judged).toBeLessThanOrEqual(15);
      for (const layer of DRILL_LAYERS) expect(run.judgedPerLayer[layer]).toBeLessThanOrEqual(3);
      expectCompleteOnlyWithAllLayers(run);
      maxAnswers = Math.max(maxAnswers, run.answers);
      maxJudged = Math.max(maxJudged, run.judged);
    }
    // 발판(모델 없음)이 섞이면 답은 판정 상한 15개를 넘을 수 있다 -- 그래도 끝난다.
    expect(maxAnswers).toBeGreaterThan(maxJudged);
    expect(maxAnswers).toBeLessThan(100);
  });

  it("오류로 판정을 못 받은 호출은 판정 셈 밖이다 -- 끝내지도, 진전으로 세지도, 상한을 깨지도 않는다", () => {
    // 오류가 이어지면 장면 규칙은 끝내지 않는다(예전에는 8답 상한이 함께 끊었다). 이 길은
    // 사용자가 다시 보낼 때만 한 번씩 부르고, 서버의 목적별 하루 몫이 끊는다(session-end.ts).
    const run = simulate("ko", script([C, E, E, E, E, E, E, E, E, E, C, C, C, C]));
    expect(run.unjudged).toBe(9);
    expect(run.judged).toBe(5);
    expect(run.judgedPerLayer).toEqual({ fact: 1, feeling: 1, meaning: 1, belief: 1, echo: 1 });
    expect(run.credited).toEqual([...DRILL_LAYERS]);
    expect(run.endedBy).toBe("complete");
    const cycle: readonly Step[] = [E, C, N, E, O, S, B, E, C, N, R];
    let i = 0;
    const mixed = simulate("ko", () => cycle[i++ % cycle.length] ?? null, { maxAnswers: 120 });
    expect(mixed.judged).toBeLessThanOrEqual(15);
    for (const layer of DRILL_LAYERS) expect(mixed.judgedPerLayer[layer]).toBeLessThanOrEqual(3);
    expectCompleteOnlyWithAllLayers(mixed);
  });

  it("위험 신호로 멈춘 답도 진전으로 세지 않는다 -- 그 층은 다음 답에서 다시 판정받는다", () => {
    // 감정 답이 위험 신호 출력으로 멈췄다. 다음 답은 겨냥 층 없이 나가고(화면이 비운 그대로),
    // 감정은 건너뛰지 않고 다시 묻는다.
    const run = simulate("ko", script([C, R, C, C, C, C, C]));
    expect(run.unjudged).toBe(2);
    // 예전에는 멈춘 감정 답을 진전으로 세어 다음 질문이 의미로 갔다(감정 칸은 빈 채).
    expect(run.asked.slice(0, 2)).toEqual(["feeling", "feeling"]);
    expect(run.credited).toEqual([...DRILL_LAYERS]);
    expect(run.endedBy).toBe("complete");
  });
});

describe("3. 마지막 층도 인정돼야 끝난다 (게이트 LAST-01)", () => {
  it.each(["ko", "en"] as const)("%s: 울림이 none 이면 저장 화면이 아니라 울림 발판이다", (locale) => {
    const run = simulate(locale, script([...FOUR, N]));
    expect(run.done).toBe(false);
    expect(run.endedBy).toBeNull();
    expect(run.credited).toEqual(["fact", "feeling", "meaning", "belief"]);
    expect(run.judgedPerLayer.echo).toBe(1);
    expect(run.pending).toBe("echo");
    expect(run.turns[run.turns.length - 1]).toEqual({
      role: "interviewer", text: scaffoldQuestion("echo", locale, 1), layer: "echo", period: PERIOD,
    });
  });

  it.each([["다른 층", O], ["판정 없음", S]] as const)("울림 답이 %s 이어도 같은 발판이다", (_label, step) => {
    const run = simulate("ko", script([...FOUR, step]));
    expect(run.done).toBe(false);
    expect(run.pending).toBe("echo");
    expect(run.credited).not.toContain("echo");
  });

  it.each(["ko", "en"] as const)("%s: 울림 none 두 번 뒤 인정되면 그때 끝난다", (locale) => {
    const run = simulate(locale, script([...FOUR, N, N, C]));
    expect(run.done).toBe(true);
    expect(run.endedBy).toBe("complete");
    expect(run.credited).toEqual([...DRILL_LAYERS]);
    expect(run.judgedPerLayer.echo).toBe(3);
  });

  it.each(["ko", "en"] as const)("%s: 울림 none 세 번이면 인정 완료가 아니라 실패 사유로 끝난다", (locale) => {
    const run = simulate(locale, script([...FOUR, N, N, N]));
    expect(run.done).toBe(true);
    expect(run.endedBy).toBe("missed");
    expect(run.credited).not.toContain("echo");
    expect(run.judgedPerLayer.echo).toBe(3);
    expect(run.answers).toBe(7);
  });

  it("울림 답이 오류로 판정을 못 받으면 끝나지 않고, 다시 보낸 답이 울림에서 판정받는다", () => {
    const failed = simulate("ko", script([...FOUR, E]));
    expect(failed.done).toBe(false);
    expect(failed.pending).toBe("echo");
    const last = failed.turns[failed.turns.length - 1];
    expect([last?.role, last?.layer, last?.unsettled, last?.answered]).toEqual(["user", "echo", true, undefined]);
    const retried = simulate("ko", script([...FOUR, E, C]));
    expect(retried.endedBy).toBe("complete");
    expect(retried.judgedPerLayer.echo).toBe(1);
    const missed = simulate("ko", script([...FOUR, E, N]));
    expect(missed.done).toBe(false);
    expect(missed.pending).toBe("echo");
  });

  describe("nextMove 는 판정을 기다리는 답 하나만 미리 센다", () => {
    const fourCredited = (): InterviewTurn[] => {
      const history: InterviewTurn[] = [{ role: "interviewer", text: "q", layer: "fact", sceneStart: true }];
      for (const layer of ["fact", "feeling", "meaning", "belief"] as const) {
        history.push(
          { role: "user", text: `${ANSWER.ko} ${layer}`, layer, answered: true },
          { role: "interviewer", text: "q", layer: layer === "belief" ? "echo" : layer },
        );
      }
      return history;
    };
    const move = (history: InterviewTurn[]) =>
      nextMove(emptyCoverage(), PERIOD, [], NOW, null, [], { history, locale: "ko" });
    const echo: InterviewTurn = { role: "user", text: `${ANSWER.ko} echo`, layer: "echo" };

    it("맨 끝의 판정 전 울림 답은 미리 세어 finish 를 낸다 -- 화면이 판정을 보고 따른다", () => {
      expect(move([...fourCredited(), echo])).toEqual({ kind: "finish" });
    });

    it("오류로 unsettled 가 된 울림 답은 세지 않는다", () => {
      expect(move([...fourCredited(), { ...echo, unsettled: true }])).toEqual({ kind: "drill", layer: "echo" });
    });

    it("맨 끝이 아닌 판정 없는 답(위험 신호로 멈춘 답)도 세지 않는다", () => {
      expect(move([...fourCredited(), echo, { role: "interviewer", text: "q", layer: "echo" }]))
        .toEqual({ kind: "drill", layer: "echo" });
    });

    it("인정 못 받은 답(answered false)은 세지 않는다", () => {
      expect(move([...fourCredited(), { ...echo, answered: false }])).toEqual({ kind: "drill", layer: "echo" });
    });
  });
});

describe("4. \"사실만\"은 인정된 답만 센다 (게이트 LAST-02)", () => {
  const concrete = (steps: readonly Step[], locale: Locale = "ko") =>
    simulate(locale, script(steps), { concreteOnly: true });

  it.each(["ko", "en"] as const)("%s: 인정된 답 넷이면 끝난다", (locale) => {
    const run = concrete([C, C, C, C], locale);
    expect(run.done).toBe(true);
    expect(run.endedBy).toBe("complete");
    expect(run.judged).toBe(4);
    expect(run.credited).toEqual(["fact", "fact", "fact", "fact"]);
  });

  it.each(["ko", "en"] as const)("%s: 오류 세 번 뒤 네 번째 입력은 모델 판정을 받고, 끝나지 않는다", (locale) => {
    const run = concrete([E, E, E, C], locale);
    expect(run.done).toBe(false);
    expect(run.unjudged).toBe(3);
    expect(run.judged).toBe(1);
    expect(run.pending).toBe("fact");
    const unsettled = run.turns.filter((turn) => turn.role === "user" && turn.unsettled === true);
    expect(unsettled).toHaveLength(3);
    // 오류 답마다 겨냥 층이 되돌아와 다시 보낸 답도 사실 층에서 판정받는다.
    expect(unsettled.map((turn) => turn.layer)).toEqual(["fact", "fact", "fact"]);
    const finished = concrete([E, E, E, C, C, C, C], locale);
    expect(finished.endedBy).toBe("complete");
    expect(finished.judged).toBe(4);
    expect(finished.answers).toBe(7);
  });

  it("네 번째 호출이 오류면 끝나지 않고, 다시 보낸 답이 판정받아 끝난다", () => {
    const failed = concrete([C, C, C, E]);
    expect(failed.done).toBe(false);
    expect(failed.judged).toBe(3);
    expect(failed.pending).toBe("fact");
    const retried = concrete([C, C, C, E, C]);
    expect(retried.endedBy).toBe("complete");
    expect(retried.judged).toBe(4);
  });

  it("네 번째 답이 인정 못 받으면 발판이고, 인정 못 받음 세 번이면 실패 사유로 끝난다", () => {
    const scaffolded = concrete([C, C, C, N]);
    expect(scaffolded.done).toBe(false);
    expect(scaffolded.pending).toBe("fact");
    expect(concrete([C, C, C, N, C]).endedBy).toBe("complete");
    const missed = concrete([C, N, N, N]);
    expect(missed.endedBy).toBe("missed");
    expect(missed.judged).toBe(4);
  });

  it("인정 · none 의 모든 순서를 다 돌려도 끝나고, 판정 호출은 6회를 넘지 않는다", () => {
    // 예전의 상한(답 4개)은 판정과 무관한 개수였다. 이제는 판정으로 끝나므로 유한성을 따로 잰다:
    // 인정 넷이면 완료, 인정 못 받음 셋(사실 층에 쌓인다)이면 실패. 최대 = 인정 셋 + 못 받음 둘 + 하나.
    let leaves = 0;
    let completes = 0;
    let maxJudged = 0;
    const walk = (prefix: Verdict[]): void => {
      if (prefix.length > 20) throw new Error(`concrete path did not finish: ${prefix.join(",")}`);
      let i = 0;
      let needMore = false;
      const run = simulate("ko", () => {
        if (i < prefix.length) return { kind: "answer", verdict: prefix[i++]! };
        needMore = true;
        return null;
      }, { concreteOnly: true });
      if (needMore && !run.done) {
        for (const v of ["credit", "none"] as const) walk([...prefix, v]);
        return;
      }
      leaves += 1;
      expect(run.done).toBe(true);
      expect({ endedBy: run.endedBy, four: run.credited.length === 4 })
        .toEqual({ endedBy: run.endedBy, four: run.endedBy === "complete" });
      if (run.endedBy === "complete") completes += 1;
      maxJudged = Math.max(maxJudged, run.judged);
    };
    walk([]);
    // 완료: 마지막이 인정이고 그 앞에 인정 셋 · 못 받음 0~2 = 1+4+10 = 15.
    // 실패: 마지막이 세 번째 못 받음이고 그 앞에 못 받음 둘 · 인정 0~3 = 1+3+6+10 = 20.
    expect(completes).toBe(15);
    expect(leaves).toBe(35);
    expect(maxJudged).toBe(6);
  });
});

describe("5. 소스 계약 -- 위 시뮬레이터가 옮긴 줄이 화면 · 엔진에 그대로 있다", () => {
  const ROOT = join(__dirname, "..", "..", "..", "..");
  /** 주석을 빼고 공백을 하나로 접은 코드. 주석 속 문자열로는 통과하지 않는다. */
  const code = (rel: string): string => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return ts.createPrinter({ removeComments: true }).printFile(sf).replace(/\s+/g, " ");
  };
  const between = (src: string, from: string, to: string): string => {
    const a = src.indexOf(from);
    const b = a < 0 ? -1 : src.indexOf(to, a + from.length);
    return a < 0 || b < 0 ? "" : src.slice(a, b);
  };
  const inOrder = (src: string, lines: readonly string[]): void => {
    let at = -1;
    for (const line of lines) {
      const found = src.indexOf(line, at + 1);
      expect([line, found > at]).toEqual([line, true]);
      at = found;
    }
  };

  it("화면의 ask() 판정 갈래", () => {
    const screen = code("src/app/interview.tsx");
    const ask = between(screen, "const ask = useCallback(", "async function send(");
    inOrder(ask, [
      'if (move.kind === "finish" && !credited) { finish(); return; }',
      'move.kind === "finish" ? credited : move.layer',
      "const confirmed = credited && lastAnswer ? confirmedAnswer(lastAnswer.text, credited, locale, probe.answeredLayer) : false;",
      "if (credited && confirmed) setCoverage(incrementCoverage(cov, period, credited));",
      'if (move.kind === "finish" && confirmed) { setTurns(assessed); finish(); return; }',
      'const streak = currentScene(history).filter((turn) => turn.role === "user" && turn.layer === credited && turn.answered === false).length + 1;',
      "setStuckStreak(streak); if (shouldScaffold(streak)) {",
      "setPendingLayer(probe.layer);",
    ]);
  });

  it("화면의 ask() 오류 갈래: 답을 unsettled 로 표시하고 겨냥 층을 되돌린다", () => {
    const screen = code("src/app/interview.tsx");
    const ask = between(screen, "const ask = useCallback(", "async function send(");
    const handler = between(ask, "catch (error)", "finally");
    inOrder(handler, [
      "readDayLimitRefusal(error, INTERVIEW_PURPOSE)",
      "if (!ended.current) { setTurns(history.map((turn, index) => index === history.length - 1 && turn.role === \"user\" ? { ...turn, unsettled: true } : turn)); setPendingLayer(credited); }",
      'setNotice(t("drill.failed"));',
    ]);
  });

  it("화면의 send() 막힘 셈", () => {
    const screen = code("src/app/interview.tsx");
    const send = between(screen, "async function send(", "function changeAngle(");
    for (const line of [
      "const blocked = isLocalNonAnswer(text, pendingLayer);",
      "const nextStreak = blocked ? stuckStreak + 1 : 0;",
      "const stuck = blocked && pendingLayer ? { layer: pendingLayer, streak: nextStreak } : null;",
      "setStuckStreak(nextAbandoned !== abandoned ? 0 : nextStreak);",
      "await ask(nextTurns, nextCoverage, stuck, nextAbandoned, blocked ? null : pendingLayer);",
    ]) expect([line, send.includes(line)]).toEqual([line, true]);
    expect(screen).toContain("layer != null && (isBlockedAnswer(text) || !canCreditAnswer(text, layer, locale))");
  });

  it("엔진의 장면 경로는 답의 개수를 세지 않는다 -- 인정된 진전과 판정을 기다리는 답 하나만 센다", () => {
    const probe = code("src/lib/interview/probe.ts");
    const scene = between(probe, "if (thread) {", "const loops = detectLoops(");
    expect(scene.length).toBeGreaterThan(0);
    expect(scene).not.toMatch(/answers\.length\s*>=/);
    inOrder(scene, [
      "index === scene.length - 1 && turn.answered === undefined && !turn.unsettled",
      "(turn.answered === true || awaiting(turn, index))",
      "canCreditAnswer(turn.text, turn.layer, thread.locale)",
      "if (thread.concreteOnly) return progress.length >= 4",
      "for (const turn of progress) sceneCoverage[period][turn.layer] += 1;",
      'if (isPeriodComplete(sceneCoverage, period)) return { kind: "finish" };',
    ]);
    // 시뮬레이터는 모델 질문의 층을 `move.layer` 로 둔다 -- nextProbe 가 넘겨받은 층을 그대로 쓰기 때문이다.
    expect(probe).toContain("const layer = forceLayer ?? nextLayerSuggestion(coverage, period);");
  });
});
