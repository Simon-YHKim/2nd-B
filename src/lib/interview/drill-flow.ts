// 인터뷰 한 턴의 판정 흐름 (QA 261005 R2F-04 · R2F-05 · R2F-09).
//
// Simon Q-261004-18: "시스템 LLM 이 사용자를 충분히 drilldown 해서 정보를 얻어내는지
// 검증과 개선이 필요해." · Q-261004-24: 12턴 상한 해제와 같은 방향.
//
// ── 무엇이 막고 있었나 (2차 점검 실측, origin/main a01f174c) ──────────────────
//   R2F-04  짧지만 구체적인 답("시험 망쳤어요" · "나는 혼자다")이 글자 수 문턱(ko 8 · en 14)에
//           걸려 "모르겠어요"와 같은 막힘 길을 탔다. 모델은 한 번도 안 불렸고, 발판 두 번 뒤
//           대화가 끝났다. 프롬프트는 "짧아도 구체적이면 충분하다"고 말하는데 화면이 먼저 막았다.
//   R2F-05  모델이 다른 층(사실 · 행동)으로 판정한 답도 "안 닿음"으로 세서 세 번이면 끝났다.
//           행동을 묻는 발판에 행동으로 답해도 그랬다. 모델이 만든 질문은 매번 버렸다.
//   R2F-09  장면당 답 8개 상한이 인정 여부와 상관없이 답을 셌다. 두 층에서 막혔다 회복하면
//           울림(L5)을 묻기 전에 끝났다.
//
// ── 이제 한 턴은 이렇게 돈다 ────────────────────────────────────────────────
//   명시적 비답("모르겠어요")     -> 화면이 받는다(모델 안 부름). 막힘 +1, 발판 또는 끝.
//   그 밖의 답(짧아도)            -> 모델이 판정한다. 부르기 **전에** 두 갈래를 정한다
//                                    (`planProbe`): 인정되면 어디로, 안 되면 어디로.
//     credited  인정              -> 다음 층.
//     missed    "답을 안 했다"    -> 막힘 +1, 발판 또는 끝(못 답하는 사람을 밀지 않는다).
//     unlanded  답했지만 안 닿음  -> 막힘이 아니다. 같은 층을 모델이 다른 각도로 다시 묻는다.
//                                    한 층에서 인정 없이 세 번이면 칸을 비운 채 다음 층으로.
//
// 칸이 오르는 규칙은 그대로다: 로컬 문턱(`canCreditAnswer`)과 모델 판정이 **둘 다**
// 그 층을 인정해야 한다. 바뀐 것은 "안 닿았다"를 실패로 세지 않는 것과, 장면을 끝내는 셈이
// 장면 전체의 답 개수가 아니라 층마다의 시도라는 것이다.
//
// ── 비용 ────────────────────────────────────────────────────────────────────
// 모델을 부르는 답은 한 번에 한 번이다(그대로). 한 장면의 최대 호출 수는 층마다 세 번 x
// 다섯 층 = 15 다(예전 8: 장면 답 8개 상한). 실패한 호출 · 위험 신호로 질문을 못 보인 호출도
// 그 답을 "안 닿음"으로 정착시켜 같은 층의 시도로 센다(`settleUnjudged`). 짧은 답도 이제 모델로
// 가므로 호출이 늘 수 있다.
// 좌석(interview_probe) · effort 는 바꾸지 않았고, 하루 몫은 서버가 막는다(session-end.ts).

import { canCreditAnswer, currentScene, layerTally } from "./continuity";
import {
  emptyCoverage,
  nextMove,
  type AnswerOutcome,
  type DrillLayer,
  type InterviewTurn,
  type LifePeriod,
  type NextMove,
} from "./probe";
import { MAX_TRIES_PER_LAYER, shouldScaffold } from "./stuck";

/** 모델을 부르기 전에 정한 두 갈래. 모델은 자기 판정(규칙 9)으로 하나를 겨냥한다. */
export interface ProbePlan {
  /** 직전 답이 인정되면 물을 층. null = 인정되면 장면이 끝난다. */
  onCredit: DrillLayer | null;
  /** 인정되지 않으면 물을 층. null = 그러면 장면이 끝난다. */
  onMiss: DrillLayer | null;
  /** `nextProbe` 의 forceLayer. */
  target: DrillLayer;
  /** `nextProbe` 의 fallbackLayer. null = 판정과 상관없이 `target` 하나다. */
  fallback: DrillLayer | null;
}

/** 모델 판정 뒤에 화면이 할 일. */
export type JudgedStep =
  /** 모델이 만든 질문을 보여 준다. `detour` = 같은 층을 다른 각도로 다시 묻는 것. */
  | { kind: "ask"; layer: DrillLayer; detour: boolean }
  /** 모델 질문을 버리고 고정 발판을 보여 준다. `streak` = 이 층에서 못 답한 횟수. */
  | { kind: "scaffold"; layer: DrillLayer; streak: number }
  | { kind: "finish" };

/** 장면 경로의 `nextMove`. 이 경로는 장면만 읽는다 -- 누적 칸 · 기록 · 시계는 쓰지 않는다. */
function sceneMove(
  history: readonly InterviewTurn[], period: LifePeriod, locale: "en" | "ko", concreteOnly: boolean,
): NextMove {
  return nextMove(emptyCoverage(), period, [], new Date(0), null, [], { history, locale, concreteOnly });
}

/** 마지막 사용자 답에 판정을 붙인다(세션 안에서만). 저장 원문은 그대로다. */
export function settleLatest(history: readonly InterviewTurn[], outcome: AnswerOutcome): InterviewTurn[] {
  const last = history.length - 1;
  return history.map((turn, index) => (index === last && turn.role === "user"
    ? { ...turn, answered: outcome === "credited", outcome }
    : turn));
}

/**
 * 모델의 판정을 못 받은 답을 정리한다 (게이트 W4R1-01 · W4-R1-01).
 *
 * 호출이 실패했거나(하루 한도 밖의 오류) 응답이 위험 신호(red)라 질문을 못 보여 준 때다.
 * 예전에는 그 답을 판정 전 상태로 두고 겨냥 층도 비웠다. 그러면 다음 답은 층 없이 나가
 * 층마다의 시도 셈(`layerTally`)에 안 잡혔고, 판정 전 답은 장면 셈에서 인정된 것처럼
 * 보였다 -- 실패를 되풀이하면 "장면당 호출 최대 15회"가 성립하지 않았다.
 *
 * 이제 그 답은 **안 닿음**(`unlanded`)으로 정착한다: 칸은 오르지 않고 그 층의 시도 하나를
 * 쓴다. 그 층에 시도가 남았으면 같은 질문에 다시 답하게 하고(`retry` = 그 층), 남지 않았으면
 * `retry` = null -- 다음 층을 물을 질문이 없으므로 화면은 대화를 끝낸다(모델을 다시 부르지
 * 않는다). 겨냥한 층이 없던 답(`credited` = null)도 다시 물을 층이 없으니 끝낸다.
 * 그래서 성공이든 실패든 모든 호출이 어느 한 층의 시도 하나를 쓴다.
 */
export function settleUnjudged(
  history: readonly InterviewTurn[],
  credited: DrillLayer | null,
): { turns: InterviewTurn[]; retry: DrillLayer | null } {
  if (credited === null) return { turns: [...history], retry: null };
  const turns = settleLatest(history, "unlanded");
  const { tries } = layerTally(currentScene(turns), credited);
  return { turns, retry: tries < MAX_TRIES_PER_LAYER ? credited : null };
}

/**
 * 모델을 부르기 전에 갈래를 정한다. null 이면 부를 필요가 없다(장면이 끝난다).
 *
 * `move` 는 화면이 방금 얻은 `nextMove` -- 마지막 답이 **인정된다고 치고** 고른 수다.
 * 인정되지 않았을 때의 수는 같은 장면에 그 답을 "안 닿음"으로 붙여 다시 묻는다.
 * 로컬 문턱을 못 넘는 답은 인정될 길이 없으므로 그 갈래 하나만 남는다.
 */
export function planProbe(args: {
  history: readonly InterviewTurn[];
  period: LifePeriod;
  locale: "en" | "ko";
  concreteOnly: boolean;
  /** 마지막 답이 겨냥한 층. 판정할 답이 없으면 null. */
  credited: DrillLayer | null;
  move: NextMove;
}): ProbePlan | null {
  const { history, period, locale, concreteOnly, credited, move } = args;
  const onCredit = move.kind === "drill" ? move.layer : null;
  if (credited === null) {
    return onCredit === null ? null : { onCredit, onMiss: onCredit, target: onCredit, fallback: null };
  }
  const missMove = sceneMove(settleLatest(history, "unlanded"), period, locale, concreteOnly);
  const onMiss = missMove.kind === "drill" ? missMove.layer : null;
  const last = history[history.length - 1];
  const creditable = last?.role === "user" && canCreditAnswer(last.text, credited, locale);
  if (!creditable) {
    return onMiss === null ? null : { onCredit: null, onMiss, target: onMiss, fallback: null };
  }
  const target = onCredit ?? credited;
  return { onCredit, onMiss, target, fallback: onMiss !== null && onMiss !== target ? onMiss : null };
}

/**
 * 모델 판정 뒤의 한 수. `scene` 은 판정을 붙인 뒤의 현재 장면이다.
 *
 * 순서가 규칙이다:
 *   1. 인정되면 다음 층(없으면 끝).
 *   2. "답을 안 했다"가 이 층에서 발판 수를 넘으면 끝 -- 예전과 같다.
 *   3. 인정 안 된 쪽으로 갈 곳이 없으면 끝.
 *   4. "답을 안 했다"이고 이 층에 시도가 남았으면 고정 발판.
 *   5. 그 밖에는 모델이 만든 질문 -- 같은 층이면 다른 각도로 다시 묻기, 이 층의 시도를 다
 *      썼으면 다음 층.
 */
export function stepAfterJudgement(
  outcome: Exclude<AnswerOutcome, "blocked">,
  layer: DrillLayer,
  scene: readonly InterviewTurn[],
  plan: Pick<ProbePlan, "onCredit" | "onMiss">,
): JudgedStep {
  if (outcome === "credited") {
    return plan.onCredit === null ? { kind: "finish" } : { kind: "ask", layer: plan.onCredit, detour: false };
  }
  const { tries, failures } = layerTally(scene, layer);
  if (outcome === "missed" && !shouldScaffold(failures)) return { kind: "finish" };
  if (plan.onMiss === null) return { kind: "finish" };
  if (outcome === "missed" && tries < MAX_TRIES_PER_LAYER) return { kind: "scaffold", layer, streak: failures };
  return { kind: "ask", layer: plan.onMiss, detour: plan.onMiss === layer };
}
