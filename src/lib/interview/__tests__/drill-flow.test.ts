// 인터뷰가 사람을 충분히 파고드는가 -- 화면 흐름 시뮬레이션 (QA 261005 R2F-04 · 05 · 09).
//
// Simon Q-261004-18: "시스템 LLM 이 사용자를 충분히 drilldown 해서 정보를 얻어내는지 검증과
// 개선이 필요해." 2차 점검 하네스(round2/R2F-drilldown/harness, origin/main a01f174c)가 화면의
// send()/ask() 를 옮겨 적어 돌렸고, 그 결과가 이 파일의 "예전" 숫자다. 여기서는 같은 시나리오를
// **이 저장소의 실제 순수 함수**로 돌린다 -- 판정 흐름은 drill-flow.ts 에 있고, 화면은 그 함수를
// 같은 인자로 부른다(맨 아래 배선 검사). 렌더 테스트는 이 저장소에서 막혀 있다(RN 0.85).
//
// 모델은 부르지 않는다. `callLlm` 을 가짜 판정기로 바꿔 끼우고, 판정기는 시스템 프롬프트에서
// 겨냥한 층 · 판정할 층 · 갈래를 읽어 정해진 정책대로 답한다. **실제 모델이 그렇게 판정한다는
// 증거가 아니다** -- 판정이 이렇게 나왔을 때 화면이 무엇을 하는지를 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import { callLlm } from "../../llm/boundary";
import {
  answerDisposition,
  answerOutcome,
  canCreditAnswer,
  confirmedAnswer,
  currentScene,
  isBareMention,
  layerTally,
} from "../continuity";
import { planProbe, settleLatest, stepAfterJudgement } from "../drill-flow";
import {
  DRILL_LAYERS,
  emptyCoverage,
  incrementCoverage,
  lastWasDetour,
  nextMove,
  nextProbe,
  seedQuestion,
  type Coverage,
  type DrillLayer,
  type InterviewTurn,
  type LifePeriod,
} from "../probe";
import { isNonAnswer, MAX_TRIES_PER_LAYER, scaffoldQuestion } from "../stuck";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
const llm = jest.mocked(callLlm);

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const KO = JSON.parse(read("locales/ko/interview.json")).drill as Record<string, string>;

const PERIOD: LifePeriod = "school";
const LOCALE = "ko" as const;
const NOW = new Date("2026-10-05T00:00:00Z");

// ── 가짜 판정기 ──────────────────────────────────────────────────────────
type Verdict = DrillLayer | "none" | "broken";
type Policy = (asked: DrillLayer, answer: string, afterDetour: boolean) => Verdict;

const layerOf = (n: string | undefined): DrillLayer | null => (n ? DRILL_LAYERS[Number(n) - 1] ?? null : null);

let serial = 0;
function installJudge(policy: Policy) {
  serial = 0;
  llm.mockReset();
  llm.mockImplementation(async (input) => {
    const system = input.system ?? "";
    const asked = layerOf(/9\) 함께 판정합니다 — \*\*사용자의 마지막 답이 L([1-5])/.exec(system)?.[1]);
    const answers = [...input.user.matchAll(/A \((\w+)\): ([^\n<]*)/g)];
    const last = answers[answers.length - 1]?.[2] ?? "";
    const afterDetour = system.includes("직전 질문은 같은 단계를 쉬운 각도로 다시 물은 것입니다");
    const verdict = asked ? policy(asked, last, afterDetour) : "none";
    serial += 1;
    // 16자 미만이면 usableQuestion 의 유사 반복 검사를 타지 않는다 -- 질문마다 다르다.
    const question = `Q${serial}?`;
    const text = verdict === "broken"
      ? "not json at all"
      : JSON.stringify({ question, answeredLayer: verdict, openers: [] });
    return { text, safety: { zone: "green" } } as never;
  });
}

/** 판정기는 물은 층을 그대로 인정한다(협조적 사용자 + 후한 판정). */
const confirmAll: Policy = (asked) => asked;

// ── 화면 흐름 (src/app/interview.tsx send() · ask() 와 같은 순서 · 같은 함수) ────────────
interface Sim {
  turns: InterviewTurn[];
  coverage: Coverage;
  pending: DrillLayer | null;
  concreteOnly: boolean;
  done: boolean;
  why: string;
  calls: number;
}

function newSim(): Sim {
  return {
    turns: [{ role: "interviewer", text: seedQuestion(PERIOD, LOCALE), layer: "fact", period: PERIOD, sceneStart: true }],
    coverage: emptyCoverage(),
    pending: "fact",
    concreteOnly: false,
    done: false,
    why: "",
    calls: 0,
  };
}

const isBlockedAnswer = (text: string) => text === KO.dontKnow || isNonAnswer(text, LOCALE);
const isLocalNonAnswer = (text: string, layer: DrillLayer | null | undefined) => layer != null && isBlockedAnswer(text);

function finish(s: Sim, why: string) {
  s.done = true;
  s.why = why;
  s.pending = null;
}

async function ask(
  s: Sim, history: InterviewTurn[], stuck: { layer: DrillLayer; streak: number } | null, credited: DrillLayer | null,
) {
  const move = nextMove(s.coverage, PERIOD, [], NOW, stuck, [], { history, locale: LOCALE, concreteOnly: s.concreteOnly });
  if (move.kind === "finish" && !credited) return finish(s, "scene");
  if (move.kind === "loopCheck") throw new Error("the scene path never loop-checks");
  if (move.kind === "scaffold") {
    s.turns = [...history, {
      role: "interviewer", text: scaffoldQuestion(move.layer, LOCALE, stuck?.streak ?? 1), layer: move.layer, period: PERIOD, detour: true,
    }];
    s.pending = move.layer;
    return;
  }
  const plan = planProbe({ history, period: PERIOD, locale: LOCALE, concreteOnly: s.concreteOnly, credited, move });
  if (!plan) {
    s.turns = credited ? settleLatest(history, "unlanded") : history;
    return finish(s, "scene");
  }
  const before = llm.mock.calls.length;
  const probe = await nextProbe("qa", LOCALE, PERIOD, history, s.coverage, false, 0, plan.target, plan.fallback);
  s.calls += llm.mock.calls.length - before;
  const lastAnswer = history[history.length - 1];
  const confirmed = credited && lastAnswer ? confirmedAnswer(lastAnswer.text, credited, LOCALE, probe.answeredLayer) : false;
  const outcome = credited && lastAnswer
    ? answerOutcome(Boolean(confirmed), probe.answeredLayer, lastWasDetour(history))
    : null;
  const assessed = outcome ? settleLatest(history, outcome) : history;
  if (credited && confirmed) s.coverage = incrementCoverage(s.coverage, PERIOD, credited);
  const step = credited && outcome
    ? stepAfterJudgement(outcome, credited, currentScene(assessed), plan)
    : { kind: "ask" as const, layer: plan.target, detour: false };
  if (step.kind === "finish") {
    s.turns = assessed;
    return finish(s, outcome === "credited" ? "scene" : "stuck");
  }
  if (step.kind === "scaffold") {
    s.turns = [...assessed, {
      role: "interviewer", text: scaffoldQuestion(step.layer, LOCALE, step.streak), layer: step.layer, period: PERIOD, detour: true,
    }];
    s.pending = step.layer;
    return;
  }
  if (!probe.question) {
    s.turns = assessed;
    return finish(s, "no-question");
  }
  // 모델은 자기 판정으로 겨냥을 골랐고(nextProbe), 화면은 판정 흐름이 고른 층으로 받는다. 같아야 한다.
  expect(probe.layer).toBe(step.layer);
  s.turns = [...assessed, { role: "interviewer", text: probe.question, layer: step.layer, period: PERIOD, detour: step.detour }];
  s.pending = step.layer;
}

async function send(s: Sim, text: string) {
  if (s.done) return;
  const disposition = answerDisposition(text, LOCALE);
  if (disposition === "stop") {
    s.turns = [...s.turns, { role: "user", text, period: PERIOD, answered: false }];
    return finish(s, "stop");
  }
  if (disposition === "skip") throw new Error("scenarios do not skip");
  const blocked = isLocalNonAnswer(text, s.pending);
  const answered: InterviewTurn = blocked
    ? { role: "user", text, layer: s.pending ?? undefined, period: PERIOD, answered: false, outcome: "blocked" }
    : { role: "user", text, layer: s.pending ?? undefined, period: PERIOD };
  const nextTurns = [...s.turns, answered];
  const stuck = blocked && s.pending
    ? { layer: s.pending, streak: layerTally(currentScene(nextTurns), s.pending).failures }
    : null;
  const credited = blocked ? null : s.pending;
  s.turns = nextTurns;
  s.pending = null;
  await ask(s, nextTurns, stuck, credited);
}

async function run(policy: Policy, answers: readonly string[]) {
  installJudge(policy);
  const s = newSim();
  for (const a of answers) {
    if (s.done) break;
    await send(s, a);
  }
  const open = DRILL_LAYERS.filter((l) => s.coverage[PERIOD][l] > 0);
  const users = s.turns.filter((t) => t.role === "user").length;
  return { s, open, users };
}

// 하네스와 같은 답들 (round2/R2F-drilldown/harness/sim.ts).
const RICH = [
  "중학교 2학년 때 운동장 스탠드에서 친구랑 싸웠던 날이 기억나요",
  "그때 얼굴이 화끈거리고 창피했어요",
  "친구한테 지기 싫어서 고집을 부린 거였다고 생각해요",
  "약한 모습을 보이면 무시당한다고 믿게 된 것 같아요",
  "지금도 회의에서 모른다는 말을 잘 못하는 게 그때랑 이어져 있어요",
] as const;

describe("R2F-04 짧지만 구체적인 답은 모델의 판정을 받는다", () => {
  it.each([
    // [답, 층, 로컬 문턱 통과] -- 예전 문턱(ko 8 · en 14)에서는 감정층 밖이 전부 false 였다.
    ["시험 망쳤어요", "fact", "ko", true],
    ["엄마랑 싸웠어요", "fact", "ko", true],
    ["책임감이요", "meaning", "ko", true],
    ["나는 혼자다", "belief", "ko", true],
    ["세상은 불공평", "belief", "ko", true],
    ["아무도 안 믿어", "belief", "ko", true],
    ["People leave.", "belief", "en", true],
    ["My dad left.", "fact", "en", true],
    ["Responsibility", "meaning", "en", true],
    // 사실층의 술어 없는 언급은 의도적으로 막는다(장면을 열었지만 아직 일이 없다).
    ["운동장이요", "fact", "ko", false],
    ["할머니 댁", "fact", "ko", false],
    ["Office", "fact", "en", false],
    ["the office", "fact", "en", false],
    // 비어 있는 답은 어느 층에서도 안 된다.
    ["응", "belief", "ko", false],
    ["ok", "echo", "en", false],
    ["모르겠어요", "belief", "ko", false],
  ] as const)("%p @%s (%s) -> %p", (text, layer, locale, expected) => {
    expect(canCreditAnswer(text, layer, locale)).toBe(expected);
  });

  it.each([
    ["시험 망쳤어요", "I failed the exam"],
    ["엄마랑 싸웠어요", "I fought with mom"],
    ["세상은 불공평", "The world is unfair"],
    ["책임감이요", "Responsibility"],
    ["나는 혼자다", "I am alone"],
    ["아무도 안 믿어", "I trust no one"],
  ])("같은 뜻 ko/en 쌍이 비사실층에서 똑같이 판정을 받는다: %s / %s", (ko, en) => {
    for (const layer of ["meaning", "belief", "echo"] as const) {
      expect({ layer, ko: canCreditAnswer(ko, layer, "ko"), en: canCreditAnswer(en, layer, "en") })
        .toEqual({ layer, ko: true, en: true });
    }
  });

  it("술어 없는 언급 판정은 좁다 -- 사건 · 행동이 보이면 언급이 아니다", () => {
    for (const t of ["운동장이요", "할머니 댁", "학교요", "아빠", "가족 여행"]) expect({ t, bare: isBareMention(t, "ko") }).toEqual({ t, bare: true });
    for (const t of ["시험 망쳤어요", "엄마랑 싸웠어요", "친구랑 놀아요", "넘어졌어요", "운동장 스탠드에서 친구랑 싸웠던 날"]) {
      expect({ t, bare: isBareMention(t, "ko") }).toEqual({ t, bare: false });
    }
    for (const t of ["Office", "the office", "my dad", "School."]) expect({ t, bare: isBareMention(t, "en") }).toEqual({ t, bare: true });
    for (const t of ["My dad left.", "People leave.", "grandma's house"]) expect({ t, bare: isBareMention(t, "en") }).toEqual({ t, bare: false });
  });

  it("예전 B: 짧은 사실 답 넷 -> 모델을 부르고, 사건이 나오면 칸이 열린다 (예전: 0층 · LLM 0 · 답 3개 뒤 종료)", async () => {
    const { s, open, users } = await run(confirmAll, ["운동장이요", "할머니 댁", "시험 망쳤어요", "엄마랑 싸웠어요"]);
    expect(s.done).toBe(false);
    expect(users).toBe(4);
    expect(s.calls).toBe(4);
    expect(open).toEqual(["fact", "feeling"]);
    // 맨 언급 둘은 칸을 못 채우지만 막힘도 아니다 -- 모델이 같은 층을 다시 묻는다(발판 안내 없음).
    const userTurns = s.turns.filter((t) => t.role === "user");
    expect(userTurns.map((t) => t.outcome)).toEqual(["unlanded", "unlanded", "credited", "credited"]);
  });

  it("예전 B2: 믿음층의 짧고 깊은 답 -> 다섯 층을 연다 (예전: 3층 · LLM 3 · 믿음 세 번 뒤 종료)", async () => {
    const { s, open } = await run(confirmAll, [RICH[0], RICH[1], RICH[2], "나는 혼자다", "세상은 불공평", "아무도 안 믿어"]);
    expect(open).toEqual([...DRILL_LAYERS]);
    expect(s.calls).toBe(5);
    expect(s.done).toBe(true);
    expect(s.why).toBe("scene");
  });
});

describe("R2F-05 다른 층으로 판정된 정직한 답은 실패로 세지 않는다", () => {
  const C_ANSWERS = [RICH[0], RICH[1], RICH[2], RICH[3], "그 뒤로 남 앞에서 잘 안 울게 됐어요", "비슷한 일이 생기면 그냥 혼자 해결하려고 해요", RICH[4]];

  it("예전 C: 인색한 모델이 믿음을 none 으로 -> 발판 뒤 답은 막힘이 아니고, 믿음을 비운 채 울림으로 간다 (예전: 3층 · '모델 거부 3회' 종료)", async () => {
    const stingy: Policy = (asked) => (asked === "belief" ? "none" : asked);
    const { s, open } = await run(stingy, C_ANSWERS);
    expect(open).toEqual(["fact", "feeling", "meaning", "echo"]);
    expect(s.done).toBe(true);
    expect(s.why).toBe("scene");
    expect(s.calls).toBe(7);
    const belief = s.turns.filter((t) => t.role === "user" && t.layer === "belief").map((t) => t.outcome);
    // 첫 none 만 막힘(일반 질문) -- 그 뒤는 발판 · 다시 묻기에 대한 답이라 막힘이 아니다.
    expect(belief).toEqual(["missed", "unlanded", "unlanded"]);
  });

  it("예전 G: 믿음 질문에 장면 사실로 답(판정 fact) -> 모델 질문으로 같은 층을 다시 묻고, 세 번 뒤 다음 층 (예전: 버린 질문 3 · 종료)", async () => {
    const factual: Policy = (asked, last) => (asked === "belief" && /스탠드|선생님|교실/.test(last) ? "fact" : asked);
    const { s, open } = await run(factual, [
      RICH[0], RICH[1], RICH[2],
      "그날 담임 선생님이 교실로 불러서 둘 다 혼났어요",
      "스탠드 맨 위 칸에 혼자 앉아 있었어요",
      "교실 창가 자리에서 계속 밖만 봤어요",
      RICH[4],
    ]);
    expect(open).toEqual(["fact", "feeling", "meaning", "echo"]);
    expect(s.calls).toBe(7);
    expect(s.why).toBe("scene");
    // 다시 묻기 질문은 모델이 만든 것이다(고정 발판이 아니다) -- 버린 질문이 없다.
    const askedBelief = s.turns.filter((t) => t.role === "interviewer" && t.layer === "belief");
    expect(askedBelief.map((t) => t.detour === true)).toEqual([false, true, true]);
    expect(askedBelief.every((t) => /^Q\d+\?$/.test(t.text))).toBe(true);
    // 발판 안내가 붙는 고정 발판은 한 번도 나가지 않았다.
    for (const q of askedBelief) expect([scaffoldQuestion("belief", LOCALE, 1), scaffoldQuestion("belief", LOCALE, 2)]).not.toContain(q.text);
  });

  it.each([
    ["다른 층 판정 3회", "fact" as Verdict],
    ["판정 없음(응답 깨짐) 3회", "broken" as Verdict],
    ["none 3회(첫 질문 뒤는 다시 묻기)", "none" as Verdict],
  ])("%s 는 대화를 끝내지 않는다 -- 그 층을 비우고 다음 층으로", async (_name, verdict) => {
    const policy: Policy = (asked) => (asked === "meaning" ? verdict : asked);
    const { s, open } = await run(policy, [RICH[0], RICH[1], "a1 그 일 얘기를 더 해 보면", "a2 그때 상황을 말하자면", "a3 그 뒤에 있었던 일은", RICH[3], RICH[4]]);
    expect(open).toEqual(["fact", "feeling", "belief", "echo"]);
    expect(s.why).toBe("scene");
    expect(layerTally(currentScene(s.turns), "meaning").tries).toBe(MAX_TRIES_PER_LAYER);
  });

  it("모르겠어요 세 번은 예전처럼 대화를 끝낸다 -- 못 답하는 사람을 더 깊은 층으로 밀지 않는다", async () => {
    const { s, open } = await run(confirmAll, [RICH[0], RICH[1], KO.dontKnow, KO.dontKnow, KO.dontKnow, RICH[3]]);
    expect(open).toEqual(["fact", "feeling"]);
    expect(s.done).toBe(true);
    expect(s.why).toBe("scene");
    expect(s.calls).toBe(2);
  });

  it("모델 none 뒤 모르겠어요 두 번도 같은 층의 막힘 셋이라 끝난다 (발판 문장이 겹치지 않는다)", async () => {
    const noneOnMeaning: Policy = (asked) => (asked === "meaning" ? "none" : asked);
    const { s } = await run(noneOnMeaning, [RICH[0], RICH[1], "그건 왜 물어요", KO.dontKnow, KO.dontKnow]);
    expect(s.done).toBe(true);
    const scaffolds = s.turns.filter((t) => t.role === "interviewer" && t.layer === "meaning" && t.detour).map((t) => t.text);
    expect(scaffolds).toEqual([scaffoldQuestion("meaning", LOCALE, 1), scaffoldQuestion("meaning", LOCALE, 2)]);
  });
});

describe("R2F-09 장면은 답의 개수로 끝나지 않는다", () => {
  it("예전 I: 감정 · 의미에서 모르겠어요 두 번씩 뒤 답 -> 울림까지 간다 (예전: 4층 · 울림을 묻지 않고 8답째 종료)", async () => {
    const { s, open, users } = await run(confirmAll, [
      RICH[0], KO.dontKnow, KO.dontKnow, "얼굴이 화끈거렸어요", KO.dontKnow, KO.dontKnow, RICH[2], RICH[3], RICH[4],
    ]);
    expect(open).toEqual([...DRILL_LAYERS]);
    expect(users).toBe(9);
    expect(s.calls).toBe(5);
    expect(s.why).toBe("scene");
  });

  it("check.ts C1 · C3 의 8번째 답 뒤에도 장면이 이어진다 (예전: finish)", () => {
    const seq = (steps: readonly [DrillLayer, "ok" | "dk" | "veto" | "last"][]) => {
      const h: InterviewTurn[] = [{ role: "interviewer", text: "seed", layer: "fact", period: PERIOD, sceneStart: true }];
      steps.forEach(([layer, kind], i) => {
        if (i > 0) h.push({ role: "interviewer", text: `Q${i} ${layer}`, layer, period: PERIOD });
        const text = kind === "dk" ? KO.dontKnow : RICH[DRILL_LAYERS.indexOf(layer)]!;
        const turn: InterviewTurn = { role: "user", text, layer, period: PERIOD };
        if (kind === "ok") Object.assign(turn, { answered: true, outcome: "credited" });
        if (kind === "dk") Object.assign(turn, { answered: false, outcome: "blocked" });
        if (kind === "veto") Object.assign(turn, { answered: false, outcome: "unlanded" });
        h.push(turn);
      });
      return nextMove(emptyCoverage(), PERIOD, [], NOW, null, [], { history: h, locale: LOCALE });
    };
    expect(seq([["fact", "ok"], ["feeling", "dk"], ["feeling", "dk"], ["feeling", "ok"],
      ["meaning", "dk"], ["meaning", "dk"], ["meaning", "ok"], ["belief", "last"]])).toEqual({ kind: "drill", layer: "echo" });
    expect(seq([["fact", "ok"], ["feeling", "ok"], ["meaning", "veto"], ["meaning", "veto"],
      ["meaning", "ok"], ["belief", "veto"], ["belief", "veto"], ["belief", "last"]])).toEqual({ kind: "drill", layer: "echo" });
  });

  it("끝없이 돌지 않는다: 아무것도 인정되지 않아도 한 장면의 모델 호출은 층당 3 x 5 = 15 에서 끝난다", async () => {
    for (const verdict of ["fact", "broken", "none"] as const) {
      // 사실층도 판정을 피하도록 "다른 층" 판정은 echo 로 돌린다.
      const never: Policy = (asked) => (verdict === "fact" ? (asked === "echo" ? "fact" : "echo") : verdict);
      const answers = Array.from({ length: 40 }, (_, i) => `그 장면에서 있었던 일을 이어서 말해 보면 ${i}번째로 떠오른 것은 이거예요`);
      const { s, open, users } = await run(never, answers);
      expect({ verdict, done: s.done, calls: s.calls, users, open: open.length })
        .toEqual({ verdict, done: true, calls: DRILL_LAYERS.length * MAX_TRIES_PER_LAYER, users: 15, open: 0 });
    }
  });

  it("사실만 길은 그대로 넷에서 끝난다", async () => {
    installJudge(confirmAll);
    const s = newSim();
    s.concreteOnly = true;
    for (const a of [RICH[0], "선생님이 와서 말렸어요", "그 뒤 교실로 돌아갔어요", "가방을 챙겨 집에 갔어요", "다음 날 사과했어요"]) {
      if (s.done) break;
      await send(s, a);
    }
    expect(s.done).toBe(true);
    expect(s.turns.filter((t) => t.role === "user")).toHaveLength(4);
  });
});

describe("판정 흐름의 순수 함수", () => {
  it("answerOutcome: 인정 · none · 다른 층 · 판정 없음 · 다시 묻기 뒤 none", () => {
    expect(answerOutcome(true, "belief", false)).toBe("credited");
    expect(answerOutcome(false, null, false)).toBe("missed");
    expect(answerOutcome(false, "fact", false)).toBe("unlanded");
    expect(answerOutcome(false, undefined, false)).toBe("unlanded");
    expect(answerOutcome(false, null, true)).toBe("unlanded");
  });

  it("layerTally: 판정 전 답은 세지 않고, 막힘은 비답 · none 만이다", () => {
    const scene: InterviewTurn[] = [
      { role: "user", text: "x", layer: "belief", answered: false, outcome: "blocked" },
      { role: "user", text: "x", layer: "belief", answered: false, outcome: "missed" },
      { role: "user", text: "x", layer: "belief", answered: false, outcome: "unlanded" },
      { role: "user", text: "x", layer: "belief", answered: true, outcome: "credited" },
      { role: "user", text: "x", layer: "belief" },
      { role: "user", text: "x", layer: "echo", answered: false, outcome: "unlanded" },
    ];
    expect(layerTally(scene, "belief")).toEqual({ tries: 3, failures: 2 });
    expect(layerTally(scene, "echo")).toEqual({ tries: 1, failures: 0 });
  });

  it("planProbe: 로컬 문턱을 못 넘는 답은 인정 갈래가 없다 -- 한 겨냥만 넘긴다", () => {
    const history: InterviewTurn[] = [
      { role: "interviewer", text: "seed", layer: "fact", sceneStart: true },
      { role: "user", text: "운동장이요", layer: "fact" },
    ];
    const move = nextMove(emptyCoverage(), PERIOD, [], NOW, null, [], { history, locale: LOCALE });
    expect(move).toEqual({ kind: "drill", layer: "fact" });
    expect(planProbe({ history, period: PERIOD, locale: LOCALE, concreteOnly: false, credited: "fact", move }))
      .toEqual({ onCredit: null, onMiss: "fact", target: "fact", fallback: null });
  });

  it("planProbe: 인정되면 다음 층, 안 되면 같은 층 -- 시도를 다 쓰면 둘이 같은 층이 된다", () => {
    const base: InterviewTurn[] = [
      { role: "interviewer", text: "seed", layer: "fact", sceneStart: true },
      { role: "user", text: RICH[0], layer: "fact", answered: true, outcome: "credited" },
      { role: "interviewer", text: "q", layer: "feeling" },
    ];
    const first = [...base, { role: "user", text: RICH[1], layer: "feeling" } as InterviewTurn];
    const move1 = nextMove(emptyCoverage(), PERIOD, [], NOW, null, [], { history: first, locale: LOCALE });
    expect(planProbe({ history: first, period: PERIOD, locale: LOCALE, concreteOnly: false, credited: "feeling", move: move1 }))
      .toEqual({ onCredit: "meaning", onMiss: "feeling", target: "meaning", fallback: "feeling" });
    const tried: InterviewTurn[] = [...base,
      { role: "user", text: "a", layer: "feeling", answered: false, outcome: "unlanded" },
      { role: "interviewer", text: "q2", layer: "feeling", detour: true },
      { role: "user", text: "b", layer: "feeling", answered: false, outcome: "unlanded" },
      { role: "interviewer", text: "q3", layer: "feeling", detour: true },
      { role: "user", text: RICH[1], layer: "feeling" },
    ];
    const move3 = nextMove(emptyCoverage(), PERIOD, [], NOW, null, [], { history: tried, locale: LOCALE });
    expect(planProbe({ history: tried, period: PERIOD, locale: LOCALE, concreteOnly: false, credited: "feeling", move: move3 }))
      .toEqual({ onCredit: "meaning", onMiss: "meaning", target: "meaning", fallback: null });
  });

  it("nextProbe: 갈래가 있으면 모델 판정에 따라 질문의 층이 바뀐다", async () => {
    const history: InterviewTurn[] = [
      { role: "interviewer", text: "seed", layer: "fact", sceneStart: true },
      { role: "user", text: RICH[0], layer: "fact", answered: true, outcome: "credited" },
      { role: "interviewer", text: "q", layer: "feeling" },
      { role: "user", text: RICH[1], layer: "feeling" },
    ];
    installJudge(() => "feeling");
    expect((await nextProbe("qa", LOCALE, PERIOD, history, emptyCoverage(), false, 0, "meaning", "feeling")).layer).toBe("meaning");
    installJudge(() => "fact");
    expect((await nextProbe("qa", LOCALE, PERIOD, history, emptyCoverage(), false, 0, "meaning", "feeling")).layer).toBe("feeling");
    const system = llm.mock.calls[0]![0].system ?? "";
    expect(system).toContain("이번 질문은 반드시 9번 판정에 따라 겨냥합니다");
    expect(system).toContain("같은 단계를 다시 묻는 것이니 앞 질문과 다른 각도");
    expect(system).toContain("길이로 판정하지 않습니다");
  });

  it("nextProbe: 영어 프롬프트에도 같은 갈래와 판정 규칙이 있다", async () => {
    installJudge(() => "fact");
    await nextProbe("qa", "en", PERIOD, [
      { role: "interviewer", text: "seed", layer: "fact", sceneStart: true },
      { role: "user", text: "I fought with my friend at the stands", layer: "fact", answered: true, outcome: "credited" },
      { role: "interviewer", text: "Easier: what did you do?", layer: "feeling", detour: true },
      { role: "user", text: "I walked away", layer: "feeling" },
    ], emptyCoverage(), false, 0, "meaning", "feeling");
    const system = llm.mock.calls[0]![0].system ?? "";
    expect(system).toContain("This question MUST target according to judgement 9");
    expect(system).toContain("Length is not the test");
    expect(system).toContain("if they answered it, that is not `none`");
    expect(system).toContain("Be STINGY here");
  });
});

describe("화면이 같은 함수를 같은 인자로 부른다 (주석을 뺀 코드)", () => {
  const code = (() => {
    const rel = "src/app/interview.tsx";
    const sf = ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return ts.createPrinter({ removeComments: true }).printFile(sf);
  })();

  it.each([
    "const plan = planProbe({ history, period, locale, concreteOnly, credited, move });",
    "0, plan.target, plan.fallback",
    "answerOutcome(Boolean(confirmed), probe.answeredLayer, lastWasDetour(history))",
    "const assessed = outcome ? settleLatest(history, outcome) : history;",
    "stepAfterJudgement(outcome, credited, currentScene(assessed), plan)",
    "layerTally(currentScene(nextTurns), pendingLayer).failures",
    "answered: false, outcome: \"blocked\"",
    "layer: step.layer, period, detour: step.detour",
    "setPendingLayer(step.layer);",
  ])("%s", (fragment) => {
    expect(code.replace(/\s+/g, " ")).toContain(fragment.replace(/\s+/g, " "));
  });

  it("장면당 답 개수 상한이 코드에 없다", () => {
    const probe = ts.createPrinter({ removeComments: true }).printFile(
      ts.createSourceFile("probe.ts", read("src/lib/interview/probe.ts"), ts.ScriptTarget.Latest, true),
    );
    expect(probe).not.toMatch(/answers\.length\s*>=\s*8/);
    expect(code).not.toMatch(/stuckStreak|setAbandoned/);
  });
});
