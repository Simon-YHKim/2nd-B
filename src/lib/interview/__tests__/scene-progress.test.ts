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
//      열세 번을 넘지 않는다.
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
/** 사용자가 하는 일: "모르겠어요"(화면이 받음) · 답(모델이 판정) · 판정을 못 받는 호출(오류 · 위험 신호). */
type Step = { kind: "block" } | { kind: "answer"; verdict: Verdict } | { kind: "unjudged" };

const PERIOD: LifePeriod = "work";
const NOW = new Date("2026-10-06T00:00:00Z");
const ANSWER: Record<Locale, string> = {
  ko: "그날 회의에서 팀장님이 제 발표를 중간에 끊었어요",
  en: "My manager cut me off halfway through the Monday meeting",
};
const DONT_KNOW: Record<Locale, string> = { ko: "모르겠어요", en: "I don't know" };

interface Run {
  done: boolean;
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
}

/**
 * 화면의 send() · ask() 를 옮긴 것. `next()` 가 null 을 주면(또는 대화가 끝나면) 멈춘다.
 * `answers` 가 `maxAnswers` 를 넘으면 끝나지 않은 것으로 돌려준다(무한 반복 감지용).
 */
function simulate(locale: Locale, next: (run: Run) => Step | null, maxAnswers = 200): Run {
  let turns: InterviewTurn[] = [
    { role: "interviewer", text: seedQuestion(PERIOD, locale), layer: "fact", period: PERIOD, sceneStart: true },
  ];
  let pending: DrillLayer | null = "fact";
  let stuckStreak = 0;
  let abandoned: DrillLayer[] = [];
  let coverage: Coverage = emptyCoverage();
  const run: Run = {
    done: false, answers: 0, judged: 0, unjudged: 0, credited: [], asked: [],
    judgedPerLayer: { fact: 0, feeling: 0, meaning: 0, belief: 0, echo: 0 },
  };

  const otherThan = (layer: DrillLayer): DrillLayer => (layer === "fact" ? "feeling" : "fact");

  // interview.tsx `ask`
  const ask = (
    history: InterviewTurn[], cov: Coverage,
    stuck: { layer: DrillLayer; streak: number } | null, giveUp: DrillLayer[],
    credited: DrillLayer | null, step: Step,
  ): void => {
    const move = nextMove(cov, PERIOD, [], NOW, stuck, giveUp, { history, locale, concreteOnly: false });
    if (move.kind === "finish" && !credited) {
      turns = history;
      run.done = true;
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
    if (step.kind === "unjudged") {
      // 오류: 안내만 띄우고 그대로 둔다. 위험 신호: 안내를 띄우고 돌아온다. 둘 다 판정 없음.
      run.unjudged += 1;
      turns = history;
      return;
    }
    if (credited === null) {
      // 겨냥 층이 없던 답(오류 · 위험 신호 뒤). 모델은 불리지만 판정은 쓰이지 않는다.
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
    if (move.kind === "finish") {
      turns = assessed;
      run.done = true;
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
      run.done = true;
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
const X: Step = { kind: "unjudged" };

describe("1. 8답에서 끝나지 않는다 (R2F-09)", () => {
  it.each(["ko", "en"] as const)("%s: 두 층에서 막혔다 회복해도 울림까지 묻고, 다섯 층이 인정되면 끝난다 (시나리오 I)", (locale) => {
    // 사실 · 감정에서 각각 두 번 인정 못 받고(none · 다른 층) 세 번째에 인정. 나머지 셋은 한 번에.
    const run = simulate(locale, script([N, O, C, O, N, C, C, C, C]));
    expect(run.answers).toBe(9);
    expect(run.asked).toContain("echo");
    expect(run.credited).toEqual(["fact", "feeling", "meaning", "belief", "echo"]);
    expect(run.done).toBe(true);
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

describe("2. 장면은 유한하다 -- 판정 호출은 층마다 3, 장면마다 13 이하", () => {
  it("모델 판정만으로 된 모든 순서(인정 · none · 다른 층 · 판정 없음)를 다 돌려도 끝나고 상한을 지킨다", () => {
    // 인정 못 받음 셋은 화면에서 같은 길이라(실패 하나로 센다) 대표 둘로 펼치고 나머지 둘은 아래에서 섞는다.
    const verdicts: Verdict[] = ["credit", "none"];
    let leaves = 0;
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
      expect(run.judged).toBeLessThanOrEqual(13);
      for (const layer of DRILL_LAYERS) expect(run.judgedPerLayer[layer]).toBeLessThanOrEqual(3);
      maxJudged = Math.max(maxJudged, run.judged);
    };
    walk([]);
    // 층마다 "인정 · 못 받고 인정 · 두 번 못 받고 인정"(계속) 셋과 "세 번 못 받음"(끝) 하나.
    // 1~4층에서 끝나는 순서 1+3+9+27 + 다섯째 층까지 가서 한 번 판정받는 순서 81x2 = 202.
    expect(leaves).toBe(202);
    // 예전(8답 상한)의 최대는 8 이었다. 이제 13: 네 층 x (못 받음 둘 + 인정) + 마지막 층 한 번.
    expect(maxJudged).toBe(13);
  });

  it("최대 경로: 네 층에서 두 번씩 못 받고 인정, 마지막 층은 한 번에 판정된다", () => {
    const run = simulate("ko", script([N, N, C, O, S, C, N, O, C, S, N, C, C]));
    expect(run.judged).toBe(13);
    expect(run.credited).toEqual([...DRILL_LAYERS]);
    expect(run.done).toBe(true);
  });

  it("세 번째로 인정 못 받으면 원래대로 대화가 끝난다 (이번에 바꾸지 않은 규칙)", () => {
    const run = simulate("ko", script([C, O, N, S, C]));
    expect(run.done).toBe(true);
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
    for (let k = 0; k < 3000; k += 1) {
      const run = simulate(k % 2 === 0 ? "ko" : "en", () => pick(), 100);
      expect(run.done).toBe(true);
      expect(run.judged).toBeLessThanOrEqual(13);
      for (const layer of DRILL_LAYERS) expect(run.judgedPerLayer[layer]).toBeLessThanOrEqual(3);
      maxAnswers = Math.max(maxAnswers, run.answers);
    }
    // 발판(모델 없음)이 섞이면 답은 13개를 넘을 수 있다 -- 그래도 끝난다.
    expect(maxAnswers).toBeGreaterThan(13);
    expect(maxAnswers).toBeLessThan(100);
  });

  it("판정을 못 받은 호출(오류 · 위험 신호)은 판정 셈 밖이다 -- 끝내지도, 상한을 깨지도 않는다", () => {
    // 오류가 이어지면 장면 규칙은 끝내지 않는다(예전에는 8답 상한이 함께 끊었다). 이 길은
    // 사용자가 다시 보낼 때만 한 번씩 부르고, 서버의 목적별 하루 몫이 끊는다(session-end.ts).
    const run = simulate("ko", script([C, X, X, X, X, X, X, X, X, X, C, C, C, C]));
    expect(run.unjudged).toBeGreaterThanOrEqual(9);
    expect(run.judged).toBeLessThanOrEqual(13);
    expect(run.done).toBe(true);
    const cycle: readonly Step[] = [X, C, N, X, O, S, B, X, C, N];
    let i = 0;
    const mixed = simulate("ko", () => cycle[i++ % cycle.length] ?? null, 120);
    expect(mixed.judged).toBeLessThanOrEqual(13);
    for (const layer of DRILL_LAYERS) expect(mixed.judgedPerLayer[layer]).toBeLessThanOrEqual(3);
  });
});

describe("3. 소스 계약 -- 위 시뮬레이터가 옮긴 줄이 화면 · 엔진에 그대로 있다", () => {
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

  it("화면의 ask() 판정 갈래", () => {
    const screen = code("src/app/interview.tsx");
    const ask = between(screen, "const ask = useCallback(", "async function send(");
    const lines = [
      'if (move.kind === "finish" && !credited) { finish(); return; }',
      'move.kind === "finish" ? credited : move.layer',
      "const confirmed = credited && lastAnswer ? confirmedAnswer(lastAnswer.text, credited, locale, probe.answeredLayer) : false;",
      "if (credited && confirmed) setCoverage(incrementCoverage(cov, period, credited));",
      'if (move.kind === "finish") { setTurns(assessed); finish(); return; }',
      'const streak = currentScene(history).filter((turn) => turn.role === "user" && turn.layer === credited && turn.answered === false).length + 1;',
      "setStuckStreak(streak); if (shouldScaffold(streak)) {",
      "setPendingLayer(probe.layer);",
    ];
    let at = -1;
    for (const line of lines) {
      const found = ask.indexOf(line, at + 1);
      expect([line, found > at]).toEqual([line, true]);
      at = found;
    }
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

  it("엔진의 장면 경로에 답 개수 상한이 없다 (\"사실만\"의 4답 상한만 남는다)", () => {
    const probe = code("src/lib/interview/probe.ts");
    const scene = between(probe, "if (thread) {", "const loops = detectLoops(");
    expect(scene.length).toBeGreaterThan(0);
    expect(scene.match(/answers\.length\s*>=\s*\d+/g)).toEqual(["answers.length >= 4"]);
    expect(scene).toContain("if (isPeriodComplete(sceneCoverage, period)) return { kind: \"finish\" };");
    // 시뮬레이터는 모델 질문의 층을 `move.layer` 로 둔다 -- nextProbe 가 넘겨받은 층을 그대로 쓰기 때문이다.
    expect(probe).toContain("const layer = forceLayer ?? nextLayerSuggestion(coverage, period);");
  });
});
