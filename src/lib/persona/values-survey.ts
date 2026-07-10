// Values self-report — a SHORT, positively-keyed self-report of stated value
// importance, anchored to six Schwartz-family value directions. This is NOT a
// medical assessment and NOT a validated proprietary instrument: it is the
// user's OWN stated importance, framed as an estimate. It mirrors the BFI-44
// shape (bfi.ts) so the /values screen can populate a CORE VALUES top-3 + a
// 가치 스펙트럼 the same way /big-five populates the trait lens.
//
// Scale: 1 (전혀 나 같지 않다) … 6 (매우 나 같다). All 12 items are positively
// keyed (no reverse items) — a higher answer always means the value matters
// more to the respondent. Per-value score = mean of its 2 items, normalized to
// a 0-100 bar via (mean-1)/5*100 (6-point floor→0%, ceiling→100%).
//
// HONESTY: confidence is deliberately capped well below 100%. Twelve items over
// six values is a brief screen, so a full-completion run reads ~64% confidence,
// not certainty — the same honest sub-max the reference prototype shows. The
// stored scores are always the respondent's real answers; nothing is fabricated.

export type ValueId =
  | "self_direction"
  | "stimulation"
  | "authenticity"
  | "benevolence"
  | "achievement"
  | "security";

export interface ValueItem {
  /** 1-based item number. */
  id: number;
  /** Value direction this item loads on. */
  value: ValueId;
  /** Item stem in KO — the measured content, kept verbatim. */
  ko: string;
  /** Natural EN rendering of the same stem. */
  en: string;
  /** Friendly one-line context under the stem (does not affect scoring). */
  subtitleKo: string;
  subtitleEn: string;
}

// Two items per value, all positively keyed. The KO stems are the measured
// content and MUST NOT be reworded. EN is a natural rendering; the subtitle is
// context only.
export const VALUE_ITEMS: readonly ValueItem[] = [
  // ── self_direction (자율성) ──────────────────────────────────────────
  { id: 1, value: "self_direction", ko: "무엇을 할지 스스로 정하는 것이 나에게 중요하다.", en: "Deciding for myself what to do matters to me.", subtitleKo: "선택의 주도권이 내 손에 있길 바란다.", subtitleEn: "I want the reins on my own choices." },
  { id: 2, value: "self_direction", ko: "누가 시키지 않아도 내 방식대로 하는 편이다.", en: "I tend to do things my own way, even unprompted.", subtitleKo: "지시가 없어도 내 방식을 찾는다.", subtitleEn: "I find my own way without being told." },
  // ── stimulation (새로움) ─────────────────────────────────────────────
  { id: 3, value: "stimulation", ko: "새로운 것을 배우고 시도할 때 가장 살아있다고 느낀다.", en: "I feel most alive when learning and trying new things.", subtitleKo: "낯선 것 앞에서 에너지가 오른다.", subtitleEn: "Novelty lifts my energy." },
  { id: 4, value: "stimulation", ko: "익숙함보다 변화와 도전이 더 끌린다.", en: "Change and challenge pull me more than the familiar.", subtitleKo: "안주보다 흔들림 쪽을 택한다.", subtitleEn: "I lean toward stir over settle." },
  // ── authenticity (진정성) ────────────────────────────────────────────
  { id: 5, value: "authenticity", ko: "겉으로 보이는 모습과 속마음이 같기를 바란다.", en: "I want my outward self and my inner self to match.", subtitleKo: "겉과 속의 간극이 불편하다.", subtitleEn: "A gap between outside and inside unsettles me." },
  { id: 6, value: "authenticity", ko: "나를 꾸미기보다 있는 그대로 드러내는 게 편하다.", en: "I'm more comfortable being as I am than putting on a front.", subtitleKo: "포장보다 솔직함이 편하다.", subtitleEn: "Plain feels easier than polished." },
  // ── benevolence (돌봄) ───────────────────────────────────────────────
  { id: 7, value: "benevolence", ko: "가까운 사람을 챙기고 돕는 것이 나에게 중요하다.", en: "Looking after and helping the people close to me matters to me.", subtitleKo: "곁의 사람을 돌보는 데 마음이 간다.", subtitleEn: "My attention goes to caring for those near me." },
  { id: 8, value: "benevolence", ko: "내 이익보다 소중한 사람의 안녕을 우선할 때가 많다.", en: "I often put a loved one's well-being before my own gain.", subtitleKo: "내 몫보다 그들의 안녕이 앞설 때가 많다.", subtitleEn: "Their well-being often comes before my share." },
  // ── achievement (성취) ───────────────────────────────────────────────
  { id: 9, value: "achievement", ko: "목표를 이뤄내고 인정받는 것이 나에게 중요하다.", en: "Reaching goals and being recognized matters to me.", subtitleKo: "성취와 인정이 나를 끌어올린다.", subtitleEn: "Achievement and recognition lift me." },
  { id: 10, value: "achievement", ko: "무언가를 해냈다는 감각이 나를 움직인다.", en: "The sense of having pulled something off moves me.", subtitleKo: "'해냈다'는 감각이 동력이 된다.", subtitleEn: "The 'I did it' feeling is my fuel." },
  // ── security (안정) ──────────────────────────────────────────────────
  { id: 11, value: "security", ko: "예측 가능하고 안정적인 삶이 나에게 중요하다.", en: "A predictable, stable life matters to me.", subtitleKo: "예측 가능함에서 안심을 얻는다.", subtitleEn: "Predictability settles me." },
  { id: 12, value: "security", ko: "위험을 감수하기보다 안전한 선택을 선호한다.", en: "I prefer the safe choice over taking risks.", subtitleKo: "모험보다 안전한 쪽을 고른다.", subtitleEn: "I pick safe over risky." },
] as const;

/** Item id → answer on the 1..6 scale. */
export type ValuesResponses = Record<number, number>;

export interface ValueScore {
  value: ValueId;
  /** 0-100 bar value normalized from the value's 1-6 item mean. */
  score: number;
}

export interface ValuesResult {
  /** Per-value scores, sorted descending (highest first). */
  scores: ValueScore[];
  /** 0..1 honest confidence — brief self-report, capped well under 1. */
  confidence: number;
  answered: number;
  complete: boolean;
}

// Full completion reads as ~0.64 (not 1.0): twelve items over six values is a
// brief screen, so the honest sub-max mirrors the reference prototype's 확신 %.
// A hard 0.7 cap keeps any future scaling from ever implying certainty.
const CONFIDENCE_CEILING = 0.64;
const CONFIDENCE_HARD_CAP = 0.7;

/** i18n row key (home.json ds.axisCheck.values.rows) for each ValueId.
 *  The i18n keys are camelCase; ValueId is snake_case. */
export const VALUE_ROW_KEY: Record<ValueId, string> = {
  self_direction: "selfDirection",
  stimulation: "stimulation",
  authenticity: "authenticity",
  benevolence: "benevolence",
  achievement: "achievement",
  security: "security",
};

const VALUE_IDS: readonly ValueId[] = [
  "self_direction",
  "stimulation",
  "authenticity",
  "benevolence",
  "achievement",
  "security",
];

/**
 * Score a set of values responses. Per value = mean of its two 1-6 items,
 * normalized to 0-100 via (mean-1)/5*100 and rounded. Scores sort descending.
 * Confidence = answered-fraction × a modest ceiling (12/12 → ~0.64), hard-capped
 * at 0.7 so the brief self-report never reads as certainty.
 */
export function scoreValues(responses: ValuesResponses): ValuesResult {
  const sums: Record<ValueId, { sum: number; count: number }> = {
    self_direction: { sum: 0, count: 0 },
    stimulation: { sum: 0, count: 0 },
    authenticity: { sum: 0, count: 0 },
    benevolence: { sum: 0, count: 0 },
    achievement: { sum: 0, count: 0 },
    security: { sum: 0, count: 0 },
  };

  let answered = 0;
  for (const item of VALUE_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 6 || !Number.isFinite(raw)) continue;
    answered += 1;
    sums[item.value].sum += raw;
    sums[item.value].count += 1;
  }

  const scores: ValueScore[] = VALUE_IDS.map((value) => {
    const { sum, count } = sums[value];
    const mean = count > 0 ? sum / count : 0;
    const score = count > 0 ? Math.round(((mean - 1) / 5) * 100) : 0;
    return { value, score };
  }).sort((a, b) => b.score - a.score);

  const answeredFraction = VALUE_ITEMS.length > 0 ? answered / VALUE_ITEMS.length : 0;
  const confidence = Math.min(
    CONFIDENCE_HARD_CAP,
    Math.round(answeredFraction * CONFIDENCE_CEILING * 100) / 100,
  );

  return { scores, confidence, answered, complete: answered === VALUE_ITEMS.length };
}

export const VALUE_LABEL_KO: Record<ValueId, string> = {
  self_direction: "자율성",
  stimulation: "새로움",
  authenticity: "진정성",
  benevolence: "돌봄",
  achievement: "성취",
  security: "안정",
};

export const VALUE_LABEL_EN: Record<ValueId, string> = {
  self_direction: "Self-Direction",
  stimulation: "Stimulation",
  authenticity: "Authenticity",
  benevolence: "Benevolence",
  achievement: "Achievement",
  security: "Security",
};
