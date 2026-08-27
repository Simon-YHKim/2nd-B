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
import { scaffoldQuestion, shouldScaffold } from "./stuck";

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
}

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
    infancy: "Pick one early sensation - light, a smell, a sound, how your body sat. It doesn't have to make sense. What comes up?",
    school: "Go back to your school years: what sense arrives first? The room's smell, the sounds, the seat you sat in - anything counts.",
    twenties: "What's something from your twenties that you almost never tell anyone?",
    later: "Since turning thirty, what changed in you that you didn't expect?",
    work: "Think of a day at work you still remember. What was happening?",
    now: "What's the thing you'd say first if I asked, 'what's really going on for you right now?'",
  },
  ko: {
    infancy: "아주 어릴 때의 감각 하나만 떠올려 볼까요? 빛, 냄새, 소리, 몸의 자세. 말이 안 되어도 괜찮아요.",
    school: "학창시절로 돌아가면 먼저 오는 감각이 뭔가요? 교실 냄새, 복도의 소리, 그때 앉아 있던 자리 같은 것들요.",
    twenties: "20대에 거의 누구에게도 말하지 않은 무언가가 있다면 무엇인가요?",
    later: "서른을 넘기고 나서 생각지 못하게 달라진 것이 있다면 무엇인가요?",
    work: "아직도 기억나는 회사에서의 하루가 있다면, 그날 무슨 일이 있었나요?",
    now: "'지금 진짜로 어떻게 지내?' 라고 물으면 가장 먼저 떠오르는 한마디는?",
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
 * 다음에 무엇을 할 것인가 -- **더 파기 전에 되물을 때인지 먼저 본다.**
 *
 * `nextLayerSuggestion` 은 "어느 층을 팔까" 만 답한다. 그런데
 * `docs/research/batches/self-knowledge.md` 는 그 앞에 질문이 하나 더 있다고
 * 말한다: **지금 더 파는 것이 맞는가.** 같은 주제를 새 틀 없이 반복해서 쓰고
 * 있으면, 더 캐묻는 것은 도움이 아니라 그 고리를 굳힌다.
 *
 *   "surface the loop-check question rather than continuing to invite more
 *    entry on that theme."
 *
 * 그래서 이 함수가 진입점이다. 되물을 것이 있으면 그것을 먼저 돌려준다.
 */
export type NextMove =
  | { kind: "drill"; layer: DrillLayer }
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
): NextMove {
  const loops = detectLoops(recentEntries, now);
  if (loops.length > 0) {
    // 가장 제자리인 것 하나만. 여러 개를 한꺼번에 들이밀면 되묻기가 아니라
    // 지적이 된다.
    const finding = loops[0];
    return { kind: "loopCheck", finding, questionKey: loopCheckKeyFor(finding) };
  }
  // 되묻기보다 늦고 내려가기보다 이르다. 반복(rumination)은 안전 쪽 판단이라
  // 먼저이고, 막힘은 그 다음이며, 둘 다 아니면 빈 칸을 찾아 내려간다.
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
  // 전부 포기했으면 포기 목록을 무시한다 -- 달리 돌려줄 것이 없고,
  // 턴 상한(MAX_TURNS)이 어차피 대화를 끝낸다.
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
): string {
  const periodLabel = PERIOD_LABEL[locale][period];
  const layerLabel = LAYER_LABEL[locale][nextLayer];
  if (locale === "ko") {
    const layerGuide: Record<DrillLayer, string> = {
      fact: "사실(L1) — 사건의 시간/장소/등장인물을 한 장면으로 떠올리게 하는 질문",
      feeling: "감정(L2) — 사건 직후의 정서·신체 감각을 묻는 질문",
      meaning: "의미(L3) — 사용자가 그 사건을 어떻게 해석했는지 묻는 질문",
      belief: "믿음(L4) — 그 경험에서 어떤 일반화(자기·세상·관계에 대한)가 남았는지 묻는 질문",
      echo: "울림(L5) — 그 믿음이 지금의 결정/관계/일에 어떻게 작용하는지 묻는 질문",
    };
    return [
      "당신은 노련한 인터뷰어입니다. 사용자가 자신의 속마음을 단계적으로 더 깊이 드러낼 수 있도록 돕습니다.",
      `시기 초점: ${periodLabel}.`,
      `다음 깊이 단계: ${layerLabel} — ${layerGuide[nextLayer]}.`,
      "규칙:",
      "1) 한 번에 한 가지 질문만 합니다. 짧고, 구체적이고, 부드럽게.",
      "2) 사용자의 마지막 답에 직접 이어붙입니다 — 답의 어느 부분을 더 듣고 싶은지 명확히 합니다.",
      "3) 진단·조언·해석은 절대 하지 않습니다. 그저 더 듣는 다음 질문만.",
      "4) 사용자가 '그만' 같은 신호를 보내면, '여기서 멈춰도 좋아요'로 마무리합니다.",
      "5) 위기 신호(자해·자살·학대)가 보이면 즉시 한국 109(자살예방) 안내로 전환합니다.",
      // 6·7 은 실측 후 추가(2026-08-23). 화면을 붙이고 보니 모델이 층이 바뀌어도
      // "방금 말한 것 중에서 가장 살아 있는 느낌은?" 을 L2 와 L3 에 똑같이 냈다.
      // 층을 내려가는 것이 이 기능의 전부인데 그러면 남는 것이 없다.
      "6) **이미 물어본 질문을 다시 하지 않습니다.** 위 기록에 있는 질문과 같은 뜻이면 다른 각도로 묻습니다.",
      `7) 이번 질문은 반드시 **${layerLabel}** 을 겨냥합니다 — ${layerGuide[nextLayer]}. 앞 단계로 되돌아가지 않습니다.`,
      ...(scaffold
        ? [
            // 8 은 실측 후 추가(2026-08-24). 사용자가 "잘 모르겠는데" 라고 했는데
            // 시스템이 더 깊은 층으로 내려갔다. 못 답한 사람에게 더 어려운 걸 묻는 꼴이다.
            "8) **사용자가 방금 '모르겠다'고 했습니다.** 같은 단계를 더 쉬운 각도로 다시 묻습니다. "
              + "해석을 요구하지 말고 **비교·가정·구체적인 예**로 우회합니다"
              + "(예: '무엇을 의미했나요' → '그 일이 없었다면 뭔가 달랐을까요'). "
              + "모르겠다는 것을 문제 삼거나 다극지 않습니다.",
          ]
        : []),
      ...(askedLayer !== null
        ? [
            `9) 함께 판정합니다 — **사용자의 마지막 답이 ${LAYER_LABEL[locale][askedLayer]} 에 실제로 닿았습니까?**`
              + " 닿았으면 그 층 이름을, 답을 아예 안 한 것이면(거부·되묻기·인터뷰 자체에 대한 항의·딴 이야기)"
              + " `none` 을 `answeredLayer` 에 넣습니다. 이 판정은 **덜 후하게** 하십시오 —"
              + " 애매하면 닿았다고 하지 말고 `none` 으로 두십시오.",
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
    "You are a skilled interviewer. Help the user reveal their inner experience one careful step deeper.",
    `Period in focus: ${periodLabel}.`,
    `Next depth layer to probe: ${layerLabel} — ${layerGuide[nextLayer]}.`,
    "Rules:",
    "1) ONE question at a time. Short, specific, gentle.",
    "2) Anchor directly on the user's last answer — make clear which part you want to hear more about.",
    "3) NEVER diagnose, advise, or interpret. Just the next question that elicits more.",
    "4) If the user signals 'stop' or 'enough', close warmly: 'It's okay to pause here.'",
    "5) If you detect crisis signals (self-harm, suicide, abuse), pivot immediately to US 988 hotline guidance.",
    "6) **Never repeat a question you already asked.** If the transcript above already covers it, come at it from a different angle.",
    `7) This question MUST target **${layerLabel}** -- ${layerGuide[nextLayer]}. Do not fall back to an earlier layer.`,
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
            + " Put that layer's name in `answeredLayer` if it did, or `none` if they did not answer at all"
            + " (refusal, a question back, a complaint about the interview itself, off-topic)."
            + " Be STINGY here - when in doubt, say `none` rather than crediting it.",
        ]
      : []),
    "Output: one JSON object. `question` = the next question, one line. `answeredLayer` = the judgement above.",
    INJECTION_GUARD.en,
  ].join("\n");
}

// The transcript is stored user material — fence it (was raw until 2026-07-26).
function buildUserPrompt(history: InterviewTurn[]): string {
  const transcript = history
    .map((t) => (t.role === "interviewer" ? `Q: ${t.text}` : `A: ${t.text}`))
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
   * ⚠ 이 값은 **깎는 데만 쓴다.** 3단계 프롬프트의 S1(분류)은 처음부터 있었는데
   * 결과가 여기 안 실려서 버려지고 있었다(2026-08-24 실측). 되살리되 규율을 둔다 --
   * 모델이 "닿았다"고 해도 그것만으로 칸을 채우지 않고, **"안 닿았다"고 할 때만**
   * 결정론적 판정 위에 얹어 크레딧을 물린다.
   *
   * 이유: 밝기가 부풀면 거짓말이 되고 덜 차면 그냥 덜 찬 것이다. 모델에게 줄 수
   * 있는 권한은 거부권까지다. `isNonAnswer`(결정론적)는 그대로 바닥으로 남는다.
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
): Promise<ProbeResult> {
  // 어느 층을 물을지를 **부르는 쪽이 정할 수도 있다.** 발판이 그렇다 --
  // 막힌 층에 그대로 머무른다. 안 주면 예전처럼 빈 칸을 찾아 내려간다.
  const layer = forceLayer ?? nextLayerSuggestion(coverage, period);
  const askedLayer = lastAskedLayer(history);
  const res = await callLlm<ProbeReply>({
    userId,
    locale,
    purpose: "interview_probe",
    system: buildSystemPrompt(period, locale, layer, scaffoldStreak > 0, askedLayer),
    user: buildUserPrompt(history),
    minor,
    responseSchema: PROBE_SCHEMA,
  });
  // 구조화 출력이 깨져도 화면이 멈추지 않게 원문 첫 줄로 떨어진다.
  // 그 아래 대체 문장까지 있으니 두 겹이다.
  // ⚠ `callLlm` 은 스키마를 줘도 **문자열**을 돌려준다. 파싱은 부르는 쪽 몫이다
  // (`audit/axis-estimate.ts` 가 같은 관용구를 쓴다). 실측 2026-08-24: 여기서
  // 파싱된 객체를 기대했더니 `bodyType:"string"` 이라 판정이 통째로 버려졌고,
  // 겉으로는 그냥 "거부권이 안 걸리네" 로만 보였다.
  const parsed = parseProbeReply(typeof res.text === "string" ? res.text : "");
  const raw = typeof parsed?.question === "string" ? parsed.question : typeof res.text === "string" ? res.text : "";
  const cleaned = raw.trim().split("\n")[0]?.trim() ?? "";
  return {
    question: usableQuestion(cleaned, history, layer, locale, scaffoldStreak),
    openers: readOpeners(parsed),
    zone: res.safety.zone,
    layer,
    answeredLayer: askedLayer === null ? undefined : readAnsweredLayer(parsed),
  };
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
 */
function readOpeners(reply: ProbeReply | null): string[] {
  if (!reply || !Array.isArray(reply.openers)) return [];
  const out: string[] = [];
  for (const raw of reply.openers) {
    if (typeof raw !== "string") continue;
    const one = raw.replace(/\s+/g, " ").trim();
    if (!one || one.length > 24) continue;
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

/** 모델의 분류를 읽는다. **모르겠으면 `undefined`** -- 판단을 안 한 것과 "안 닿았다"는
 *  다르다. 전자는 크레딧을 그대로 두고, 후자만 물린다. */
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
function usableQuestion(
  candidate: string,
  history: readonly InterviewTurn[],
  layer: DrillLayer,
  locale: "en" | "ko",
  scaffoldStreak = 0,
): string {
  const norm = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
  const asked = new Set(
    history.filter((turn) => turn.role === "interviewer").map((turn) => norm(turn.text)),
  );
  if (candidate.length > 0 && !asked.has(norm(candidate))) return candidate;
  // 발판일 때 같은 층의 원래 질문을 돌려주면 방금 못 답한 그 질문을 그대로
  // 다시 묻게 된다. 발판은 발판용 문장이 따로 있다.
  return scaffoldStreak > 0
    ? scaffoldQuestion(layer, locale, scaffoldStreak)
    : LAYER_FALLBACK[locale][layer];
}

/**
 * 층마다 하나씩 준비된 물음. 모델이 반복하거나 빈 줄을 낼 때만 쓴다.
 *
 * 결은 `docs/research/batches/self-knowledge.md` 의 reflection-promoting 목록을
 * 따랐다 -- 장면에 닻을 내리고(L1), 몸의 감각을 묻고(L2), 지금으로 이어 붙인다(L5).
 * 진단·조언은 없고 전부 더 듣는 질문이다.
 */
const LAYER_FALLBACK: Record<"en" | "ko", Record<DrillLayer, string>> = {
  ko: {
    fact: "그때 그 자리에 누가 있었고 무슨 일이 있었는지, 한 장면만 더 말해 줄 수 있을까요?",
    feeling: "그 순간 몸에서는 어떤 느낌이 들었어요?",
    meaning: "그 일이 본인에게 무엇을 보여줬다고 생각하세요?",
    belief: "그 경험이 남긴 생각이 있다면, 본인이나 사람들에 대해 어떤 거였어요?",
    echo: "그 생각이 요즘 어떤 선택에서 다시 나타나나요?",
  },
  en: {
    fact: "Can you give me one more piece of that scene: who was there, what was happening?",
    feeling: "What did that moment feel like in your body?",
    meaning: "What do you think that showed you?",
    belief: "If it left you with a belief about yourself or about people, what was it?",
    echo: "Where does that belief show up in a choice you make now?",
  },
};
