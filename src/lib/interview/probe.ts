// "Twenty Questions" interview helper. Drives a stepwise, locale-aware,
// age-period-anchored interview that gradually goes deeper without
// pressing past the user's comfort.
//
// v0.3 (2026-05-27): drill-down layered architecture per
// docs/ux/2026-05-27-interview-drilldown.html. The interview probes
// across 5 narrative layers (FACT → FEELING → MEANING → BELIEF → ECHO,
// McAdams 2001, docs/research/batches/narrative-identity.md) and 5 life
// periods (Erikson stages, repo: erikson.md). Together: a 25-cell
// matrix that fills live as the user answers.
//
// Architecture (3-stage nextProbe, single LLM call):
//   S1 classify — what layer was the user's last answer in?
//   S2 plan     — which layer to drill into next? (under-covered first)
//   S3 question — emit the next probe question for that layer.
// The LLM only classifies + drafts; coverage accounting + termination
// signals are deterministic functions here (LLM-agnostic per C1/C9).

import { callLlm } from "../llm/boundary";
import {
  detectLoops,
  loopCheckKeyFor,
  type LoopCheckKey,
  type LoopFinding,
  type ReflectionEntry,
} from "./loop-check";
import { INJECTION_GUARD, wrapUntrusted } from "../llm/untrusted";
import { findAnthroViolations } from "../safety/anthro";
import { containsAnalysisForbidden, containsForbiddenLexicon } from "../safety/classifier";
import { MAX_TRIES_PER_LAYER, scaffoldQuestion, shouldScaffold } from "./stuck";
import { answerDisposition, canCreditAnswer, currentScene, layerTally } from "./continuity";

/**
 * 인터뷰가 다루는 자리. **북두칠성 일곱 중 인터뷰가 있는 여섯과 1:1** 이다
 * (`persona/seven-stars.ts`). 프로필 별만 인터뷰가 없다.
 *
 * ⚠ 2026-08-24 에 통째로 갈아엎었다. 예전에는 나이 십년 단위
 * (childhood/teens/twenties/thirties/forties/…)였는데, 별 구조가 바뀌면서
 * **별 = 인터뷰 자리**가 됐다. `interview_coverage` 가 0행이고 인터뷰 기록도
 * 0건인 시점이라 옮길 데이터가 없었다 -- 바꾸기 가장 싼 때였다.
 *
 * 앞의 넷은 나이 구간, 뒤의 둘은 **주제**다. 주제 별은 시기와 겹칠 수 있고
 * 그건 의도다(Simon 결정 1) -- 다르게 만드는 것은 재료가 아니라 질문의 결이다.
 */
export type LifePeriod =
  | "infancy" // 영유아기 0~6
  | "school" // 학창시절 7~19
  | "twenties" // 20대 20~29
  | "later" // 30대 이후 30~
  | "work" // 직장 — 일하는 나
  | "now"; // 지금 — 현재의 나
export type DrillLayer = "fact" | "feeling" | "meaning" | "belief" | "echo";

// 모든 시기. **화면이 이걸 그대로 그리면 안 된다** -- 사용자가 살아온 칸만
// 보여주는 것이 규칙이고, 그 목록은 `periods.ts` 의 periodsForAge() 가 만든다.
// 여기는 Coverage 행렬의 폭(= 있을 수 있는 칸 전부)일 뿐이다.
export const LIFE_PERIODS: readonly LifePeriod[] = [
  "infancy",
  "school",
  "twenties",
  "later",
  "work",
  "now",
] as const;

export const DRILL_LAYERS: readonly DrillLayer[] = [
  "fact",
  "feeling",
  "meaning",
  "belief",
  "echo",
] as const;

export interface InterviewTurn {
  role: "interviewer" | "user";
  text: string;
  /** Layer the *answer* sits in (interviewer turn has the layer it was probing for). */
  layer?: DrillLayer;
  /** Period this turn sits under. A turn can switch period when user changes focus. */
  period?: LifePeriod;
  /** Session-only metadata, no change to stored transcript/schema. */
  sceneStart?: boolean;
  /** Session-only: true = this answer earned its layer's cell, false = it did not. */
  answered?: boolean;
  /** Session-only: why a user answer did or did not earn the cell (`continuity.ts`). */
  outcome?: AnswerOutcome;
  /** Session-only, interviewer turns: a re-ask of the same layer from an easier angle
   *  (a fixed scaffold, or the model asking the layer again after an answer that did not
   *  land). The judge prompt says so (rule 9), so an honest answer to it is named by the
   *  layer it landed in and is not a failure. A `none` after it still is (`answerOutcome`). */
  detour?: boolean;
}

/**
 * 사용자 답 하나의 판정 결과 (세션 안에서만 쓴다).
 *
 * - `blocked`  : 화면이 받은 명시적 비답("모르겠어요"). 모델을 부르지 않는다.
 * - `missed`   : 모델이 "답을 아예 안 했다"(`none`)고 판정했다.
 * - `unlanded` : 답은 했지만 그 층에 안 닿았다(다른 층 · 판정 없음 · 성긴 답).
 * - `credited` : 그 층의 칸을 채웠다.
 * - `errored`  : 판정을 받으러 간 호출이 실패했다(하루 한도 밖의 오류). 답이 부족하다는 판정이
 *                아니므로 그 층의 시도로도, 막힘으로도 세지 않는다(게이트 W4-R2-01).
 */
export type AnswerOutcome = "credited" | "unlanded" | "missed" | "blocked" | "errored";

/** A user's coverage across 25 cells (5 periods × 5 layers). Each cell is the
 *  number of user answers that landed in that (period, layer) combination. */
export type Coverage = Record<LifePeriod, Record<DrillLayer, number>>;

export const PERIOD_LABEL: Record<"en" | "ko", Record<LifePeriod, string>> = {
  en: {
    infancy: "Early childhood (0-6)",
    school: "School years (7-19)",
    twenties: "Twenties (20-29)",
    later: "Thirties and after (30+)",
    work: "Work",
    now: "Right now",
  },
  ko: {
    infancy: "영유아기 (0~6세)",
    school: "학창시절 (7~19세)",
    twenties: "20대 (20~29세)",
    later: "30대 이후 (30세~)",
    work: "직장",
    now: "지금",
  },
};

export const LAYER_LABEL: Record<"en" | "ko", Record<DrillLayer, string>> = {
  en: {
    fact: "L1 · Fact",
    feeling: "L2 · Feeling",
    meaning: "L3 · Meaning",
    belief: "L4 · Belief",
    echo: "L5 · Echo",
  },
  ko: {
    fact: "L1 · 사실",
    feeling: "L2 · 감정",
    meaning: "L3 · 의미",
    belief: "L4 · 믿음",
    echo: "L5 · 울림",
  },
};

// 문을 여는 한 줄. 시기 별은 **그때의 개인적 경험**을, 주제 별은 그 주제를 겨냥한다.
// Simon 결정 1: 겹침은 막지 않고 **질문의 결로** 가른다 -- 같은 서른다섯 살 이야기라도
// 시기 별에서는 "그때 어떤 사람이었나", 직장 별에서는 "일하는 나"를 묻는다.
const SEED_QUESTION: Record<"en" | "ko", Record<LifePeriod, string>> = {
  en: {
    infancy: "Is there a sound or smell you remember from early childhood? If you don't remember, you can say so.",
    school: "When you think of your school years, is there a place or sound you remember?",
    twenties: "Is there an experience from your twenties that you'd like to talk about?",
    later: "Since turning thirty, what changed in you that you didn't expect?",
    work: "Think of a day at work you still remember. What was happening?",
    now: "What's been happening lately that you'd like to talk about?",
  },
  ko: {
    infancy: "아주 어릴 때 기억나는 소리나 냄새가 있나요? 기억나지 않으면 그렇게 말해 주세요.",
    school: "학창시절을 떠올리면 기억나는 장소나 소리가 있나요?",
    twenties: "20대에 겪은 일 중 이야기하고 싶은 일이 있나요?",
    later: "서른을 넘기고 나서 생각지 못하게 달라진 것이 있다면 무엇인가요?",
    work: "일하면서 기억에 남은 하루가 있다면, 그날 무슨 일이 있었나요?",
    now: "요즘 어떻게 지내는지, 이야기하고 싶은 일이 있나요?",
  },
};

export function seedQuestion(period: LifePeriod, locale: "en" | "ko"): string {
  return SEED_QUESTION[locale][period];
}

/** Build a fresh zero-coverage map. Use as the starting state for a session. */
export function emptyCoverage(): Coverage {
  const c = {} as Coverage;
  for (const p of LIFE_PERIODS) {
    c[p] = { fact: 0, feeling: 0, meaning: 0, belief: 0, echo: 0 };
  }
  return c;
}

/** Increment one cell. Returns a new Coverage (immutable). */
export function incrementCoverage(c: Coverage, p: LifePeriod, l: DrillLayer): Coverage {
  const next = JSON.parse(JSON.stringify(c)) as Coverage;
  next[p][l] = next[p][l] + 1;
  return next;
}

/** 한 칸을 되돌린다. 모델이 "그 답은 그 층에 안 닿았다"고 했을 때 쓴다.
 *  0 아래로는 안 내려간다 -- 되돌릴 것이 없으면 그대로다. */
export function decrementCoverage(c: Coverage, p: LifePeriod, l: DrillLayer): Coverage {
  const next = JSON.parse(JSON.stringify(c)) as Coverage;
  next[p][l] = Math.max(0, next[p][l] - 1);
  return next;
}

/** Total user answers across all 25 cells. */
export function totalTurns(c: Coverage): number {
  let t = 0;
  for (const p of LIFE_PERIODS) for (const l of DRILL_LAYERS) t += c[p][l];
  return t;
}

/** Cells covered by at least one answer, out of 25. */
export function cellsCovered(c: Coverage): number {
  let n = 0;
  for (const p of LIFE_PERIODS) for (const l of DRILL_LAYERS) if (c[p][l] > 0) n++;
  return n;
}

/** True when every layer in `period` has at least one answer. */
export function isPeriodComplete(c: Coverage, period: LifePeriod): boolean {
  return DRILL_LAYERS.every((l) => c[period][l] > 0);
}

/**
 * Pick the next layer to probe inside `period`. Strategy:
 *   1. If FACT is empty, go FACT (you can't talk about feelings/belief about
 *      a scene that hasn't been introduced).
 *   2. Otherwise pick the deepest layer (echo → belief → meaning → feeling)
 *      that still has zero coverage in this period — drills downward.
 *   3. If every layer has ≥ 1, return the layer with the *lowest* coverage
 *      to keep the period balanced even past its first pass.
 */
/**
 * 다음 질문 선택 순서: loopCheck 후보, scaffold, drill.
 *
 * loop-check.ts의 문자 집합 비교는 검증되지 않은 제품 휴리스틱이다.
 * 후보가 있으면 선택 질문을 먼저 돌려주는 것은 제품의 순서 결정이며,
 * 더 쓰는 것이 해롭거나 이 질문이 효과적이라는 연구 결과가 아니다.
 *
 * `docs/research/batches/self-knowledge.md`의 측정·적용 한계를 따른다.
 * 이 함수는 사용자 상태·안전 위험을 판정하지 않는다. LLM 호출의 안전 분류는
 * `src/lib/llm/boundary.ts`가 담당한다. 거절·중단 선택권 처리는 호출부의 책임이다.
 */
export type NextMove =
  | { kind: "drill"; layer: DrillLayer }
  | { kind: "finish" }
  /** 사용자가 이 층을 못 답했다. **내려가지 않고** 같은 층을 더 쉬운
   *  각도로 다시 묻는다. 그 칸은 여전히 빈 칸이다(`stuck.ts`). */
  | { kind: "scaffold"; layer: DrillLayer }
  | { kind: "loopCheck"; finding: LoopFinding; questionKey: LoopCheckKey };

export function nextMove(
  c: Coverage,
  period: LifePeriod,
  recentEntries: readonly ReflectionEntry[],
  now: Date,
  /** 직전 턴의 막힘 상태. `layer` 는 못 답한 층, `streak` 은 그 층에서
   *  연속으로 못 답한 횟수. 없으면(null) 평소대로 내려간다. */
  stuck: { layer: DrillLayer; streak: number } | null = null,
  /** 발판을 다 썼는데도 막혀서 더 묻지 않기로 한 층들. */
  abandoned: readonly DrillLayer[] = [],
  thread?: { history: readonly InterviewTurn[]; locale: "en" | "ko"; concreteOnly?: boolean },
): NextMove {
  if (thread) {
    const scene = currentScene(thread.history);
    const answers = scene.filter((turn) => turn.role === "user");
    const last = answers[answers.length - 1];
    // A refusal and exhausted scaffolds end questioning; empty cells are not a reason
    // to revisit a declined topic. No obligation to reach all five layers.
    if (last && answerDisposition(last.text, thread.locale) === "stop") return { kind: "finish" };
    if (abandoned.length === DRILL_LAYERS.length) return { kind: "finish" };
    if (stuck) return shouldScaffold(stuck.streak)
      ? { kind: "scaffold", layer: stuck.layer }
      : { kind: "finish" };
    if (thread.concreteOnly) return answers.length >= 4
      ? { kind: "finish" }
      : { kind: "drill", layer: "fact" };
    // Past sessions may have every cell filled. A new event still starts with its own
    // scene, and follows its own answers. No cumulative coverage drives this path.
    // The latest answer is not judged yet (`answered` unset): it counts here when it
    // passes the local gate, so the move below is "where to go if it is credited".
    const sceneCoverage = emptyCoverage();
    for (const turn of answers) {
      if (turn.layer && turn.answered !== false && canCreditAnswer(turn.text, turn.layer, thread.locale)) {
        sceneCoverage[period][turn.layer] += 1;
      }
    }
    // 장면은 **답의 개수로 끝나지 않는다** (QA 261005 R2F-09). 여기 있던 `answers.length >= 8`
    // 은 인정 여부와 상관없이 답을 세서, 두 층에서 막혔다 회복한 사람의 장면을 울림(L5)을
    // 묻기도 전에 끊었다. 대신 **층마다** 인정 없이 물을 수 있는 횟수를 둔다: 다 쓴 층은 칸을
    // 비운 채 놓고 다음 층으로 간다. 층이 다섯이라 장면은 저절로 유한하다(층당 최대 세 번).
    const settled = [
      ...abandoned,
      ...DRILL_LAYERS.filter((l) => layerTally(scene, l).tries >= MAX_TRIES_PER_LAYER),
    ];
    if (DRILL_LAYERS.every((l) => sceneCoverage[period][l] > 0 || settled.includes(l))) {
      return { kind: "finish" };
    }
    return { kind: "drill", layer: nextLayerSuggestion(sceneCoverage, period, settled) };
  }
  const loops = detectLoops(recentEntries, now);
  if (loops.length > 0) {
    // 문자 새 원소 비율이 가장 낮은 후보 하나를 선택한다. 의미나 위험의 순위가 아니다.
    const finding = loops[0];
    return { kind: "loopCheck", finding, questionKey: loopCheckKeyFor(finding) };
  }
  // 제품의 질문 선택 순서다. loopCheck 다음 scaffold를 보고, 둘 다 없으면 drill.
  // 이 우선순위가 boundary의 안전 분류를 대신하거나 앞선다는 뜻은 아니다.
  if (stuck && shouldScaffold(stuck.streak)) return { kind: "scaffold", layer: stuck.layer };
  return { kind: "drill", layer: nextLayerSuggestion(c, period, abandoned) };
}

export function nextLayerSuggestion(
  c: Coverage,
  period: LifePeriod,
  /** 발판을 두 번 줘도 막혀서 **포기한** 층. 이번 대화에서 다시 고르지 않는다.
   *
   *  이게 없으면 제자리를 돌았다(실측 2026-08-24): 못 답한 칸을 일부러 안
   *  채우는데, "가장 먼저 비어 있는 칸" 규칙이 바로 그 칸을 다시 집어서
   *  같은 질문이 계속 나갔다. 칸은 비우되 **묻기는 멈추는** 것이 맞다. */
  abandoned: readonly DrillLayer[] = [],
): DrillLayer {
  const cov = c[period];
  const open = DRILL_LAYERS.filter((l) => !abandoned.includes(l));
  // 전부 포기했으면 포기 목록을 무시한다 -- 달리 돌려줄 것이 없다.
  // 대화를 끝내는 것은 이 함수가 아니다. 화면은 `nextMove` 에 thread 를 넘기고,
  // 그 분기가 다섯 층이 모두 인정됐거나 비워 둔 채 넘어갔을 때 `finish` 를 돌려준다
  // (위 `settled`). 여기 적혀 있던 "턴 상한(MAX_TURNS)이 어차피 끝낸다"는
  // 그 상한과 함께 없어졌다(Simon 결정 2026-10-05, 12턴 상한 해제).
  const pool = open.length > 0 ? open : DRILL_LAYERS;

  if (pool.includes("fact") && cov.fact === 0) return "fact";

  // Prefer the next *deepest* empty layer, going down the narrative.
  for (const l of ["feeling", "meaning", "belief", "echo"] as const) {
    if (pool.includes(l) && cov[l] === 0) return l;
  }

  // All non-empty. Drill into whatever is shallowest still — balance pass.
  let best: DrillLayer = pool[0] ?? "fact";
  let min = Infinity;
  for (const l of pool) {
    if (cov[l] < min) {
      min = cov[l];
      best = l;
    }
  }
  return best;
}

function buildSystemPrompt(
  period: LifePeriod,
  locale: "en" | "ko",
  nextLayer: DrillLayer,
  /** 직전에 사용자가 이 층을 못 답했다. 더 깊이 가지 말고 **쉽게** 다시 물어야 한다. */
  scaffold = false,
  /** 직전 질문이 겨냥했던 층. 모델은 직전 답이 **거기 닿았는지**를 같이 판정한다.
   *  null 이면 아직 답이 없다(첫 질문) -- 판정할 것이 없다. */
  askedLayer: DrillLayer | null = null,
  /** 직전 답이 `askedLayer` 에 **안 닿았을 때** 겨냥할 층(QA 261005 R2F-05). null 이면
   *  판정과 상관없이 `nextLayer` 하나다. 같은 층이면 다른 각도로 다시 묻는 것이다. */
  fallbackLayer: DrillLayer | null = null,
  /** 직전 질문이 같은 층을 쉬운 각도로 다시 물은 것(발판 · 다시 묻기)이었다. */
  afterDetour = false,
): string {
  const periodLabel = PERIOD_LABEL[locale][period];
  const layerLabel = LAYER_LABEL[locale][nextLayer];
  // 겨냥이 판정에 달려 있는가. 화면은 부르기 전에 두 갈래를 다 정해 넘긴다(drill-flow.ts):
  // 인정되면 `nextLayer`, 아니면 `fallbackLayer`. 모델은 자기 판정(9번)으로 하나를 고른다.
  const branch = askedLayer !== null && fallbackLayer !== null && fallbackLayer !== nextLayer
    ? { asked: askedLayer, fallback: fallbackLayer }
    : null;
  if (locale === "ko") {
    const layerGuide: Record<DrillLayer, string> = {
      fact: "사실(L1) — 사건의 시간/장소/등장인물을 한 장면으로 떠올리게 하는 질문",
      feeling: "감정(L2) — 사건 직후의 정서·신체 감각을 묻는 질문",
      meaning: "의미(L3) — 사용자가 그 사건을 어떻게 해석했는지 묻는 질문",
      belief: "믿음(L4) — 그 경험에서 어떤 일반화(자기·세상·관계에 대한)가 남았는지 묻는 질문",
      echo: "울림(L5) — 그 믿음이 지금의 결정/관계/일에 어떻게 작용하는지 묻는 질문",
    };
    return [
      "사용자가 나누고 싶은 경험을 구체적으로 돌아볼 수 있도록 질문하는 인터뷰어입니다.",
      `시기 초점: ${periodLabel}.`,
      `다음 깊이 단계: ${layerLabel} — ${layerGuide[nextLayer]}.`,
      "규칙:",
      "1) 한 번에 한 가지 질문만 합니다. 짧고, 구체적이고, 부드럽게.",
      "말투는 쉬운 일상어로, 설명은 '~습니다', 질문은 '~나요?'·'~까요?'를 씁니다. 상투적인 칭찬·공감이나 추상적인 비유 없이 바로 묻고, 층·단계 같은 내부 용어를 질문에 드러내지 마세요.",
      "비밀이나 말하기 불편한 일을 요구하지 마세요. 기억나지 않는 내용을 상상해서 채우게 하지 마세요. 직접 기억한 것과 나중에 들은 이야기를 구분하세요. 사용자가 답하지 않겠다고 하면 그 뜻을 존중하는 것이 깊이 단계보다 우선합니다.",
      "2) 사용자의 마지막 답에 직접 이어붙입니다 — 답의 어느 부분을 더 듣고 싶은지 명확히 합니다.",
      "같은 장면의 사람·행동·사용자 표현을 이어갑니다. 질문에서 사용자의 '제가·나는' 같은 1인칭을 인터뷰어 자신의 말처럼 재사용하지 않습니다. 사용자 말로 명확히 인용하거나 주어를 생략합니다. 답에 없는 사건이나 속마음을 지어내지 않습니다. 짧아도 구체적인 답이면 충분합니다. 다른 장면으로 넘어가려면 사용자의 선택이 먼저입니다.",
      "감정은 말하고 싶은 범위에서만 묻습니다. 숨겨진 진실·더 솔직한 답을 요구하거나 공개 정도를 칭찬하지 않습니다. 감정 대신 그때 한 행동을 이야기해도 되고, 건너뛰거나 여기서 저장해도 됩니다.",
      "3) 진단·조언·해석은 절대 하지 않습니다. 그저 더 듣는 다음 질문만.",
      "4) 사용자가 '그만' 같은 신호를 보내면, '여기서 멈춰도 좋아요'로 마무리합니다.",
      "5) 위기 신호(자해·자살·학대)가 보이면 즉시 한국 109(자살예방) 안내로 전환합니다.",
      // 6·7 은 실측 후 추가(2026-08-23). 화면을 붙이고 보니 모델이 층이 바뀌어도
      // "방금 말한 것 중에서 가장 살아 있는 느낌은?" 을 L2 와 L3 에 똑같이 냈다.
      // 층을 내려가는 것이 이 기능의 전부인데 그러면 남는 것이 없다.
      "6) **이미 물어본 질문을 다시 하지 않습니다.** 위 기록에 있는 질문과 같은 뜻이면 다른 각도로 묻습니다.",
      branch
        ? `7) 이번 질문은 반드시 9번 판정에 따라 겨냥합니다. 직전 답이 ${LAYER_LABEL[locale][branch.asked]} 에 닿았으면 **${layerLabel}** — ${layerGuide[nextLayer]}. `
          + `닿지 않았으면 대신 **${LAYER_LABEL[locale][branch.fallback]}** — ${layerGuide[branch.fallback]}. `
          + (branch.fallback === branch.asked
            ? "같은 단계를 다시 묻는 것이니 앞 질문과 다른 각도(그때 한 행동, 비교, 구체적인 예)로 묻고, 답이 부족했다고 말하지 않습니다. "
            : "")
          + "어느 쪽이든 의미나 믿음을 앞서 단정하지 않습니다."
        : `7) 이번 질문은 반드시 **${layerLabel}** 을 겨냥합니다 — ${layerGuide[nextLayer]}. 단, 답이 부족하면 같은 장면의 한 가지 구체적 내용만 확인하고 의미나 믿음을 앞서 단정하지 않습니다.`,
      ...(scaffold
        ? [
            // 8 은 실측 후 추가(2026-08-24). 사용자가 "잘 모르겠는데" 라고 했는데
            // 시스템이 더 깊은 층으로 내려갔다. 못 답한 사람에게 더 어려운 걸 묻는 꼴이다.
            "8) **사용자가 방금 '모르겠다'고 했습니다.** 같은 단계를 더 쉬운 각도로 다시 묻습니다. "
              + "해석을 요구하지 말고 **비교·가정·구체적인 예**로 우회합니다"
              + "(예: '무엇을 의미했나요' → '그 일이 없었다면 뭔가 달랐을까요'). "
              + "모르겠다는 것을 문제 삼거나 다그치지 않습니다.",
          ]
        : []),
      ...(askedLayer !== null
        ? [
            // QA 261005 R2F-04 · 05: `none` 은 "답을 안 했다"는 뜻이라 화면이 막힘으로 센다.
            // 정직하게 답했는데 다른 층의 이야기(그때 한 사실 · 행동)였으면 그 층 이름을 받아야
            // 막힘으로 세지 않는다. 길이도 기준이 아니다 -- 짧고 구체적인 답은 닿은 것이다.
            `9) 함께 판정합니다 — **사용자의 마지막 답이 ${LAYER_LABEL[locale][askedLayer]} 에 실제로 닿았습니까?**`
              + " 닿았으면 그 층 이름을 `answeredLayer` 에 넣습니다. 길이로 판정하지 않습니다 -- 짧아도 그 단계의 내용이면 닿은 것입니다."
              + " 닿지 않았지만 같은 이야기 안에서 다른 단계(그때 있었던 일이나 한 행동 같은)로 답했으면 그 단계의 층 이름을,"
              + " 답을 아예 안 한 것이면(거부·되묻기·인터뷰 자체에 대한 항의·딴 이야기) `none` 을 넣습니다."
              + (afterDetour
                ? " 직전 질문은 같은 단계를 쉬운 각도로 다시 물은 것입니다. 그 질문에 답했으면 `none` 이 아니라 그 답이 닿은 층을 넣습니다."
                : "")
              + " 이 판정은 **덜 후하게** 하십시오 — 애매하면 닿았다고 하지 말고, 그 답이 실제로 닿은 다른 층을 넣으십시오.",
          ]
        : []),
      // 말문 후보. **답을 대신 써 주는 것이 아니다** — 사용자가 고쳐 쓸 첫머리다.
      "10) `openers` 에 **말문 후보를 최대 2개** 넣습니다. 사용자가 그대로 보내는 답이 아니라 "
        + "**고쳐 쓸 첫머리**입니다. 각각 20자 이내, 1인칭, 꾸미지 않은 평범한 말로. "
        + "서로 다른 방향이어야 합니다(한쪽은 긍정, 한쪽은 부정 같은 식). "
        + "마땅한 것이 없으면 **빈 배열로 두십시오** — 억지로 지어내지 마십시오.",
      "출력: JSON 객체 하나. `question` 에 다음 질문 한 줄, `answeredLayer` 에 위 판정, `openers` 에 말문 후보.",
      INJECTION_GUARD.ko,
    ].join("\n");
  }
  const layerGuide: Record<DrillLayer, string> = {
    fact: "Fact (L1) — surface a single scene with time/place/people",
    feeling: "Feeling (L2) — emotion + body sensation right after the event",
    meaning: "Meaning (L3) — how they interpreted what happened",
    belief: "Belief (L4) — what general belief about self/world/relationships it left",
    echo: "Echo (L5) — how that belief still shows up in current decisions/relationships/work",
  };
  return [
    "You are an interviewer helping the user reflect on experiences they choose to share.",
    `Period in focus: ${periodLabel}.`,
    `Next depth layer to probe: ${layerLabel} — ${layerGuide[nextLayer]}.`,
    "Rules:",
    "1) ONE question at a time. Short, specific, gentle.",
    "Use plain, conversational language. Ask directly without canned praise, stock empathy, elaborate metaphors, or internal layer labels.",
    "Do not ask for secrets or uncomfortable disclosures. Do not ask the user to imagine missing memories. Distinguish direct memories from stories heard later. Respecting a choice not to answer takes priority over reaching a depth layer.",
    "2) Anchor directly on the user's last answer — make clear which part you want to hear more about.",
    "Stay with the same scene, people, actions, and the user's own wording. In questions, do not reuse the user's first-person I/me as the interviewer's voice. Clearly quote it as the user's words, or refer to the user without taking over their first person. Do not invent events or hidden feelings. A short specific answer is sufficient. Change scenes only when the user chooses to.",
    "Invite feelings only if they want to share. Never seek hidden truths, demand greater honesty, or praise disclosure. They may describe a concrete action instead, skip, or stop and save at any time.",
    "3) NEVER diagnose, advise, or interpret. Just the next question that elicits more.",
    "4) If the user signals 'stop' or 'enough', close warmly: 'It's okay to pause here.'",
    "5) If you detect crisis signals (self-harm, suicide, abuse), pivot immediately to US 988 hotline guidance.",
    "6) **Never repeat a question you already asked.** If the transcript above already covers it, come at it from a different angle.",
    branch
      ? `7) This question MUST target according to judgement 9. If the last answer landed in ${LAYER_LABEL[locale][branch.asked]}, target **${layerLabel}** -- ${layerGuide[nextLayer]}. `
        + `If it did not, target **${LAYER_LABEL[locale][branch.fallback]}** instead -- ${layerGuide[branch.fallback]}. `
        + (branch.fallback === branch.asked
          ? "You are asking the same layer again, so come at it from a different angle (something they did then, a comparison, a concrete example) and never say the answer fell short. "
          : "")
        + "Either way, do not assume a meaning or belief."
      : `7) This question MUST target **${layerLabel}** -- ${layerGuide[nextLayer]}. If the scene is still unclear, ask for one concrete detail; do not assume a meaning or belief.`,
    ...(scaffold
      ? [
          "8) **The user just said they don't know.** Ask the SAME layer again from an easier angle. "
            + "Do not ask for interpretation -- go around it with a comparison, a hypothetical, or a concrete "
            + "example (e.g. 'what did it mean' -> 'what would be different if it hadn't happened'). "
            + "Never treat not knowing as a problem or press them about it.",
        ]
      : []),
    ...(askedLayer !== null
      ? [
          `9) Also judge: **did the user's last answer actually land in ${LAYER_LABEL[locale][askedLayer]}?**`
            + " Put that layer's name in `answeredLayer` if it did. Length is not the test - a short answer with that layer's content lands."
            + " If it did not, but they answered within the same story at another layer (what happened then, something they did),"
            + " put that layer's name; put `none` only if they did not answer at all"
            + " (refusal, a question back, a complaint about the interview itself, off-topic)."
            + (afterDetour
              ? " The last question asked the same layer again from an easier angle; if they answered it, that is not `none` - name the layer the answer landed in."
              : "")
            + " Be STINGY here - when in doubt, do not credit it; name the layer the answer actually landed in instead.",
        ]
      : []),
    "Output: one JSON object. `question` = the next question, one line. `answeredLayer` = the judgement above.",
    INJECTION_GUARD.en,
  ].join("\n");
}

// The transcript is stored user material — fence it (was raw until 2026-07-26).
function buildUserPrompt(history: InterviewTurn[]): string {
  const transcript = history
    .map((t) => (t.role === "interviewer" ? `Q (${t.layer ?? "choice"}): ${t.text}` : `A (${t.layer ?? "choice"}): ${t.text}`))
    .join("\n");
  return wrapUntrusted("interview_transcript", transcript);
}

export interface ProbeResult {
  question: string;
  /**
   * **말문 후보** — 이 질문에 답을 시작할 만한 짧은 문장 최대 2개.
   *
   * ⚠ 이건 답이 아니다. 화면은 이걸 누르면 **보내지 않고 입력창을 채운다** —
   *   모델이 지어낸 문장이 사용자의 기록으로 남으면 안 되기 때문이다.
   *   이 저장소의 데이터 방향(위키가 원본, 페르소나가 파생)이 그걸 요구한다.
   * ⚠ 모델이 안 주면 빈 배열이다. 그때는 칩이 안 뜨고 화면은 그대로 돈다.
   */
  openers: string[];
  zone: "green" | "yellow" | "red";
  /** The layer the next question is probing for. Caller increments coverage
   *  with this layer once the user answers. */
  layer: DrillLayer;
  /**
   * 직전 답이 **실제로** 어느 층에 닿았는지에 대한 모델의 판정. 닿은 데가 없으면
   * `null`. 직전 답이 아예 없으면 `undefined`.
   *
   * 화면은 결정론적 적합성과 이 판정이 모두 확인된 뒤에만 물었던 층을 더한다.
   * 모델이 다른 층을 지목하거나 판정이 없으면 더하지 않는다. 저장 원문은 그대로다.
   */
  answeredLayer?: DrillLayer | null;
}

/** Generate the next interviewer question.
 *
 *  Given the current coverage matrix + the active period, deterministically
 *  decide which layer to probe next (`nextLayerSuggestion`), brief the LLM
 *  with that target, and emit one question. Coverage accounting stays in
 *  the caller — this function is pure aside from the network call. */
export async function nextProbe(
  userId: string,
  locale: "en" | "ko",
  period: LifePeriod,
  history: InterviewTurn[],
  coverage: Coverage,
  minor = false,
  /** 발판 모드. 0 이면 평소대로, 1 이상이면 **몇 번째 발판인지**다.
   *  번호를 갖고 있어야 두 번째 발판이 첫 번째와 같은 문장이 되지 않는다. */
  scaffoldStreak = 0,
  /** 발판일 때 머물 층. 주어지면 `nextLayerSuggestion` 을 건너뛴다. */
  forceLayer: DrillLayer | null = null,
  /** 직전 답이 물은 층에 **안 닿았다고** 판정될 때 대신 물을 층(QA 261005 R2F-05).
   *  null 이면 판정과 상관없이 `forceLayer` 하나다. 화면이 `planProbe` 로 정한다. */
  fallbackLayer: DrillLayer | null = null,
): Promise<ProbeResult> {
  // 어느 층을 물을지를 **부르는 쪽이 정할 수도 있다.** 발판이 그렇다 --
  // 막힌 층에 그대로 머무른다. 안 주면 예전처럼 빈 칸을 찾아 내려간다.
  const layer = forceLayer ?? nextLayerSuggestion(coverage, period);
  const askedLayer = lastAskedLayer(history);
  const fallback = askedLayer !== null && fallbackLayer !== null && fallbackLayer !== layer ? fallbackLayer : null;
  const res = await callLlm<ProbeReply>({
    userId,
    locale,
    purpose: "interview_probe",
    system: buildSystemPrompt(period, locale, layer, scaffoldStreak > 0, askedLayer, fallback, lastWasDetour(history)),
    user: buildUserPrompt(currentScene(history)),
    minor,
    responseSchema: PROBE_SCHEMA,
  });
  // 구조화 출력이 깨져도 화면이 멈추지 않게 원문 첫 줄로 떨어진다.
  // 그 아래 대체 문장까지 있으니 두 겹이다.
  // ⚠ `callLlm` 은 스키마를 줘도 **문자열**을 돌려준다. 파싱은 부르는 쪽 몫이다
  // (`persona/northstar.ts` 도 같은 관용구를 쓴다). 실측 2026-08-24: 여기서
  // 파싱된 객체를 기대했더니 `bodyType:"string"` 이라 판정이 통째로 버려졌고,
  // 겉으로는 그냥 "거부권이 안 걸리네" 로만 보였다.
  const parsed = parseProbeReply(typeof res.text === "string" ? res.text : "");
  const raw = typeof parsed?.question === "string" ? parsed.question : typeof res.text === "string" ? res.text : "";
  const cleaned = raw.trim().split("\n")[0]?.trim() ?? "";
  // 모델이 쓴 질문 · 말문 후보는 화면에 그대로 나간다. 형식(`usableQuestion`)만 보던 것에
  // 말의 규율을 더한다 (게이트 W4R1-03 · W4R2-03, `modelMaySay`): 그 규율을 못 지킨 질문은
  // 그 층의 고정 질문으로 바꾸고, 그 질문에 딸린 말문 후보는 비운다. 인정 갈래든 다시 묻기
  // 갈래든 같은 게이트다. 판정(`answeredLayer`)은 그대로 쓴다 -- 보여 줄 말을 고르는 것이지
  // 판정을 버리는 것이 아니다.
  const speakable = modelMaySay(cleaned, "question");
  const result: ProbeResult = {
    question: "",
    openers: speakable ? readOpeners(parsed) : [],
    zone: res.safety.zone,
    layer,
    answeredLayer: askedLayer === null ? undefined : readAnsweredLayer(parsed),
  };
  // 규칙 7: 갈래가 있으면 모델은 **자기 판정으로** 겨냥을 골랐다. 닿았다고 본 경우만
  // `layer`, 아니면(다른 층 · none · 판정 없음) `fallback`. 반복 대체 문장도 그 층으로 고른다.
  if (fallback !== null && result.answeredLayer !== askedLayer) result.layer = fallback;
  result.question = usableQuestion(speakable ? cleaned : "", history, result.layer, locale, scaffoldStreak);
  return result;
}

/** 금지 어휘(임상 용어) · 분석 금지어가 없는가. 두 언어를 다 본다 -- 모델은 섞어 쓸 수 있다.
 *  다른 모델 출력 표면(북극성 · 제안 · 위키)과 같은 런타임 거름망이다. */
function withoutForbiddenTerms(text: string): boolean {
  return (["en", "ko"] as const).every((l) =>
    containsForbiddenLexicon(text, l).length === 0 && containsAnalysisForbidden(text, l).length === 0);
}

/**
 * 조언 · 권유 (프롬프트 규칙 3 "진단 · 조언 · 해석은 하지 않는다"). 두 언어를 다 본다.
 *
 * 질문에서는 묻는 꼴의 조언("Why don't you …?" · "~해 보는 건 어때요?")을 겨냥한다 -- 서술 ·
 * 명령의 조언은 질문 꼴 검사(`isOneQuestion`)가 먼저 떨어뜨린다. 서술 꼴의 권유("~하셔야 해요" ·
 * "추천해요")는 그 검사가 없는 말문 후보 때문에 함께 둔다. 일부러 좁다: 사용자가 그때 한 생각을
 * 묻는 질문("Did you feel you should apologize?" · "무엇을 해야 했나요?")은 통과한다.
 */
const ADVICE: readonly RegExp[] = [
  /\bwhy don['’]?t you\b/i,
  /\bhave you (?:ever )?tried\b/i,
  /\bhow about (?:you|trying)\b/i,
  /\b(?:maybe|perhaps) you (?:could|should|might)\b/i,
  /\byou (?:could|might|may want to) (?:try|consider)\b/i,
  /\b(?:i|we) (?:would )?(?:suggest|recommend|advise)\b/i,
  /\bmy advice\b|\bif i were you\b/i,
  /보(?:는|시는)\s?(?:게|건|것은?)\s?어(?:때|떨|떠세)/,
  /야\s?하지\s?않을까/,
  /셔야\s?(?:해요|합니다|돼요|됩니다)/,
  /(?:권해|권합니다|추천(?:해요|합니다|드려요|드립니다))/,
];

/**
 * 말문 후보가 **시키는 말**인가. 명령은 주어("you")를 흔히 생략하므로 2인칭 검사만으로는
 * 못 잡는다 -- "그 사람을 잊으세요" · "Please call them". 좁게 둔다: 영어는 지시로만 쓰이는
 * 첫머리, 한국어는 명령 어미(-세요 · -십시오 · -어라/-아라 · -거라)로 끝나는 말. 높임 서술
 * ("할머니가 바쁘세요")도 걸리지만 그 값은 칩 하나를 버리는 것이다.
 */
function isDirective(text: string): boolean {
  return /^(?:please\b|make sure\b|remember to\b|try to\b|go ahead\b|don['’]?t (?:worry|forget|be|let|blame|give up)\b|stop (?:blaming|worrying|being)\b)/i.test(text.trim())
    || /(?:세요|십시오|[해하거어아]라)[.!~\s]*$/u.test(text);
}

/** "you should …"류. 앞에 "you felt / told you (that)" 같은 전달 꼴이 붙으면 사용자의
 *  생각을 묻는 것이라 조언이 아니다. */
const YOU_MODAL = /\byou (?:should|must|need to|have to|ought to|had better|['’]d better)\b/gi;
const REPORTED_BEFORE = /(?:\byou(?: \w+)? (?:feel|felt|think|thought|believe|believed|know|knew|sense|sensed|decide|decided|realize|realized|wish|wished|worry|worried|fear|feared|say|said)|\b(?:told|tell|telling|said|say|saying|taught|teach) you)(?: (?:that|like))? $/i;

function givesAdvice(text: string): boolean {
  const flat = text.replace(/\s+/g, " ");
  if (ADVICE.some((re) => re.test(flat))) return true;
  for (const match of flat.matchAll(YOU_MODAL)) {
    if (!REPORTED_BEFORE.test(flat.slice(0, match.index))) return true;
  }
  return false;
}

/** 질문 하나로 끝나는가: 물음표가 정확히 하나이고 그 뒤에는 닫는 따옴표 · 괄호뿐이다.
 *  "You should stop speaking to them." 같은 서술 · 명령은 질문이 아니다(규칙 1 · 3). */
function isOneQuestion(text: string): boolean {
  return (text.match(/\?/g)?.length ?? 0) === 1 && /\?["'”’」』)\]\s]*$/u.test(text);
}

/** 듣는 사람을 부르는가(2인칭). 말문 후보는 사용자 자신의 말 첫머리라 사용자를 부르면 안 된다. */
function addressesListener(text: string): boolean {
  return /\b(?:you|your|yours|yourself|yourselves)\b/i.test(text)
    || /(?:^|[^\p{L}])(?:너희|너|당신|네가|니가|그대)(?:들)?(?:는|은|가|이|의|를|을|도|한테|에게|랑|와|과)?(?=$|[^\p{L}])/u.test(text);
}

/**
 * 모델이 쓴 말 한 줄을 화면에 내도 되는가 -- 질문과 말문 후보가 **같은 게이트**를 지난다
 * (게이트 W4R1-03 · W4R2-03).
 *
 * 먼저 NFKC 로 접는다: 전각 · 호환 문자("Ｉ’ｍ ａｌｗａｙｓ ｈｅｒｅ ｆｏｒ ｙｏｕ")가 의인화 검사
 * (`findAnthroViolations` 는 NFC 만 본다)와 조언 검사를 빠져나가지 않게. 그다음 공통으로
 * 금지 어휘 · 분석 금지어 · 의인화 · 조언이 없어야 한다.
 *
 * - 질문: 질문 하나로 끝나야 한다(`isOneQuestion`). 실패하면 부르는 쪽이 그 층의 고정 질문을 쓴다.
 * - 말문 후보: 사용자 자신의 말(1인칭) 첫머리여야 한다 -- 사용자를 부르는 2인칭이거나 시키는
 *   말(`isDirective`)이면 안 된다. 실패한 후보는 버린다. 의인화 검사도 받는다: 칩은 앱이 내미는 모델의 문장이라,
 *   "I'm always here for you" 같은 동반자 말투가 사용자의 첫머리로 위장해 들어오면 안 된다.
 *   1인칭 표지("I" · "나는")가 **있어야** 한다고는 보지 않는다 -- 한국어 첫머리는 주어를
 *   흔히 생략하고("그때 기억나는 건"), 이 화면의 "en" 은 es/pt/id 사용자도 받는다.
 *
 * 걸리면 버리는 것이 전부다(대체 문장 · 빈 칩). 판정은 건드리지 않는다.
 */
export function modelMaySay(text: string, kind: "question" | "opener"): boolean {
  const folded = text.normalize("NFKC");
  if (!withoutForbiddenTerms(folded) || findAnthroViolations(folded).length > 0 || givesAdvice(folded)) return false;
  return kind === "question" ? isOneQuestion(folded) : !addressesListener(folded) && !isDirective(folded);
}

interface ProbeReply {
  answeredLayer?: unknown;
  question?: unknown;
  openers?: unknown;
}

/** 구조화 출력. 루트는 OBJECT 여야 한다(전사 규약, `assertRootObjectSchema`). */
const PROBE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    answeredLayer: {
      type: "STRING",
      enum: [...DRILL_LAYERS, "none"],
      description:
        "Which layer the user's LAST answer actually landed in. Use 'none' if it did not answer at all (refusal, meta-comment about the interview, off-topic).",
    },
    question: { type: "STRING", description: "The next interviewer question, one line." },
    // ⚠ 선택 필드다. `required` 에 넣지 않는다 — 모델이 못 채워도 질문은 나와야 한다.
    openers: {
      type: "ARRAY",
      items: { type: "STRING" },
      description:
        "At most 2 very short first-person sentence STARTERS the user could edit into their own answer. Not answers on the user's behalf. Keep each under 20 characters in the user's language.",
    },
  },
  required: ["answeredLayer", "question"],
};

/** 모델 응답에서 JSON 객체를 꺼낸다. 못 꺼내면 null -- 그때는 원문을 질문으로 쓰고
 *  판정은 없는 것으로 둔다(모르는 것과 "안 닿았다"는 다르다). */
function parseProbeReply(text: string): ProbeReply | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj: unknown = JSON.parse(match[0]);
    return typeof obj === "object" && obj !== null ? (obj as ProbeReply) : null;
  } catch {
    return null;
  }
}

/**
 * 말문 후보를 읽는다. **모델을 믿지 않는다** — 화면에 그대로 나가는 문자열이다.
 *
 * 최대 2개 · 각 24자 이내 · 줄바꿈 없음 · 빈 것 제거. 넘치면 버린다.
 * 길이를 안 자르면 칩이 화면을 밀어내고, 줄바꿈이 들어오면 한 줄 칩이 두 줄이 된다.
 * 질문과 같은 말의 게이트(`modelMaySay`)를 못 지난 후보도 하나씩 버린다(게이트 W4R1-03 · W4R2-03).
 */
function readOpeners(reply: ProbeReply | null): string[] {
  if (!reply || !Array.isArray(reply.openers)) return [];
  const out: string[] = [];
  for (const raw of reply.openers) {
    if (typeof raw !== "string") continue;
    const one = raw.replace(/\s+/g, " ").trim();
    if (!one || one.length > 24 || !modelMaySay(one, "opener")) continue;
    if (out.includes(one)) continue;
    out.push(one);
    if (out.length === 2) break;
  }
  return out;
}

/** 직전에 인터뷰어가 **겨냥했던** 층. 없으면 null(= 아직 답이 없다). */
function lastAskedLayer(history: readonly InterviewTurn[]): DrillLayer | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn?.role === "user") return turn.layer ?? null;
  }
  return null;
}

/** 직전 사용자 답이 받은 질문이 **같은 층 다시 묻기**(발판 · 우회)였는가. */
export function lastWasDetour(history: readonly InterviewTurn[]): boolean {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role !== "interviewer") continue;
    return history[i]?.detour === true;
  }
  return false;
}

/** Missing and negative judgements stay distinct; neither can confirm coverage. */
function readAnsweredLayer(parsed: ProbeReply | null): DrillLayer | null | undefined {
  const v = parsed?.answeredLayer;
  if (typeof v !== "string") return undefined;
  if (v === "none") return null;
  return (DRILL_LAYERS as readonly string[]).includes(v) ? (v as DrillLayer) : undefined;
}

/**
 * 모델이 낸 줄을 그대로 쓸지 판단한다. **프롬프트만 믿지 않는다.**
 *
 * 실측(2026-08-23, 화면을 붙이고 처음 돌렸을 때): 층이 L2 에서 L3 으로 내려갔는데
 * 모델이 "방금 말한 것 중에서 지금 가장 살아 있는 느낌이 드는 부분은 무엇인가요?"
 * 를 **두 번 연속 똑같이** 냈다. 층을 내려가는 것이 이 기능의 전부라, 같은 질문이
 * 반복되면 사용자에게는 기능이 없는 것과 같다.
 *
 * 프롬프트에 반복 금지 규칙을 넣었지만(6번) 규칙은 지켜질 수도 안 지켜질 수도 있다.
 * 여기서는 **이미 물은 것과 사실상 같으면 버린다.** 그 자리에는 그 층을 겨냥한
 * 고정 질문이 들어간다 -- 한 번 더 LLM 을 부르는 것보다 싸고 결과가 예측 가능하다.
 */
export function usableQuestion(
  candidate: string,
  history: readonly InterviewTurn[],
  layer: DrillLayer,
  locale: "en" | "ko",
  scaffoldStreak = 0,
): string {
  const norm = (v: string) => v.replace(/[\p{P}\p{S}]+/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
  const asked = new Set(
    history.filter((turn) => turn.role === "interviewer").map((turn) => norm(turn.text)),
  );
  const repeated = (question: string) => {
    const normalized = norm(question);
    if (asked.has(normalized)) return true;
    // Small wording edits do not make a new question. This detects near copies,
    // not semantic equivalence; the prompt still owns meaning-level repetition.
    const grams = (text: string) => new Set(Array.from({ length: Math.max(0, text.length - 2) }, (_, i) => text.slice(i, i + 3)));
    const candidateGrams = grams(normalized);
    return [...asked].some((previous) => {
      if (normalized.length < 16 || previous.length < 16) return false;
      const previousGrams = grams(previous);
      const overlap = [...candidateGrams].filter((gram) => previousGrams.has(gram)).length;
      return (2 * overlap) / (candidateGrams.size + previousGrams.size) >= 0.88;
    });
  };
  if (candidate.length > 0 && candidate.length <= 320 && (candidate.match(/[?？]/g)?.length ?? 0) <= 1
    && !candidate.startsWith("{") && !candidate.startsWith("```") && !repeated(candidate)) return candidate;
  // 발판일 때 같은 층의 원래 질문을 돌려주면 방금 못 답한 그 질문을 그대로
  // 다시 묻게 된다. 발판은 발판용 문장이 따로 있다.
  const fallbacks = scaffoldStreak > 0
    ? [scaffoldQuestion(layer, locale, scaffoldStreak), LAYER_FALLBACK[locale][layer]]
    : [LAYER_FALLBACK[locale][layer], scaffoldQuestion(layer, locale, 1), scaffoldQuestion(layer, locale, 2)];
  // An exhausted fallback pool ends this thread instead of asking the same thing again.
  return fallbacks.find((question) => !repeated(question)) ?? "";
}

/**
 * 층마다 하나씩 준비된 물음. 모델이 반복하거나 빈 줄을 낼 때만 쓴다.
 *
 * 각 제품 층에 맞춰 자체 작성한 질문이며 검증된 척도 문항이나 효과 측정이 아니다.
 * `docs/research/batches/self-knowledge.md`의 적용 한계를 따른다. 사용자가 해석을
 * 모르거나 더 말하고 싶지 않을 수 있으며, 그 선택을 존중하는 처리는 호출부가 맡는다.
 */
const LAYER_FALLBACK: Record<"en" | "ko", Record<DrillLayer, string>> = {
  ko: {
    fact: "말씀한 장면에서 직접 했던 행동 하나가 기억나나요?",
    feeling: "말씀한 그 순간에 어떤 기분이 들었는지, 말하고 싶은 만큼만 들려주실래요?",
    meaning: "말씀한 일에서 본인에게 중요했던 부분은 무엇인가요?",
    belief: "그 경험이 남긴 생각이 있다면, 본인이나 사람들에 대해 어떤 거였어요?",
    echo: "그때의 생각이 요즘 선택에도 이어지는 부분이 있나요?",
  },
  en: {
    fact: "What is one action you remember taking in the scene you described?",
    feeling: "If you want to share, what feeling stands out from that moment?",
    meaning: "What part of what happened mattered to you?",
    belief: "If it left you with a belief about yourself or about people, what was it?",
    echo: "Does that thought connect to any choice you make now?",
  },
};
