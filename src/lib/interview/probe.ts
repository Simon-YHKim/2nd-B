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

import { callGemini } from "../llm/gemini";

export type LifePeriod = "childhood" | "teens" | "twenties" | "thirties" | "current";
export type DrillLayer = "fact" | "feeling" | "meaning" | "belief" | "echo";

export const LIFE_PERIODS: readonly LifePeriod[] = [
  "childhood",
  "teens",
  "twenties",
  "thirties",
  "current",
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
    childhood: "Childhood (under 12)",
    teens: "Teens (12–19)",
    twenties: "Twenties (20–29)",
    thirties: "Thirties (30–39)",
    current: "Right now",
  },
  ko: {
    childhood: "어린 시절 (12세 이전)",
    teens: "10대 (12–19세)",
    twenties: "20대 (20–29세)",
    thirties: "30대 (30–39세)",
    current: "지금 이 시기",
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

const SEED_QUESTION: Record<"en" | "ko", Record<LifePeriod, string>> = {
  en: {
    childhood: "Picture yourself at 8 or 9. What's the first scene that comes up?",
    teens: "Of your high-school years, what's the moment you still come back to in your head?",
    twenties: "What's something from your twenties that you almost never tell anyone?",
    thirties: "What did you think 'being thirty' would feel like vs. how it actually went?",
    current: "What's the thing you'd say first if I asked, 'what's really going on for you right now?'",
  },
  ko: {
    childhood: "여덟, 아홉 살 무렵의 자신을 떠올려 보세요. 가장 먼저 떠오르는 장면이 뭔가요?",
    teens: "고등학생 시절 중에서, 머릿속에 여전히 자주 돌아오는 한 장면은?",
    twenties: "20대에 거의 누구에게도 말하지 않은 무언가가 있다면 무엇인가요?",
    thirties: "30대가 어떨 거라고 생각했던 것과, 실제로 어땠는지를 비교해 보면?",
    current: "'지금 진짜로 어떻게 지내?' 라고 물으면 가장 먼저 떠오르는 한마디는?",
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
export function nextLayerSuggestion(c: Coverage, period: LifePeriod): DrillLayer {
  const cov = c[period];
  if (cov.fact === 0) return "fact";

  // Prefer the next *deepest* empty layer, going down the narrative.
  const order: DrillLayer[] = ["feeling", "meaning", "belief", "echo"];
  for (const l of order) if (cov[l] === 0) return l;

  // All non-empty. Drill into whatever is shallowest still — balance pass.
  let best: DrillLayer = "fact";
  let min = Infinity;
  for (const l of DRILL_LAYERS) {
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
      "출력: 다음 질문 한 줄만. 다른 텍스트는 출력하지 않습니다.",
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
    "Output: the next question on a single line. No other text.",
  ].join("\n");
}

function buildUserPrompt(history: InterviewTurn[]): string {
  return history.map((t) => (t.role === "interviewer" ? `Q: ${t.text}` : `A: ${t.text}`)).join("\n");
}

export interface ProbeResult {
  question: string;
  zone: "green" | "yellow" | "red";
  /** The layer the next question is probing for. Caller increments coverage
   *  with this layer once the user answers. */
  layer: DrillLayer;
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
): Promise<ProbeResult> {
  const layer = nextLayerSuggestion(coverage, period);
  const res = await callGemini({
    userId,
    locale,
    purpose: "interview_probe",
    system: buildSystemPrompt(period, locale, layer),
    user: buildUserPrompt(history),
    minor,
  });
  const cleaned = res.text.trim().split("\n")[0]?.trim() ?? "";
  return {
    question: cleaned.length > 0
      ? cleaned
      : (locale === "ko" ? "조금 더 말해 줄 수 있을까요?" : "Can you say a little more about that?"),
    zone: res.safety.zone,
    layer,
  };
}
