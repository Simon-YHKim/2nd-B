// Riverside Life Satisfaction Scale (RLSS) — Margolis, Schwitzgebel, Ozer &
// Lyubomirsky (2019), Journal of Personality Assessment 101, 621-630.
// 6 items, 1-7 Likert. Free to use (author Eric Schwitzgebel, verbatim: "Free
// to use!" — no attribution/commercial/permission conditions; verified
// 2026-06-28). Items 2, 4, 6 are reverse-keyed. Overall life satisfaction =
// mean of the 6 items after reverse-coding.
//
// WHY this exists (research 2026-06-28): overall life satisfaction should be
// measured DIRECTLY with a validated instrument, NOT back-derived from the
// constellation brightness — brightness is epistemic COVERAGE (how much the app
// knows about a domain), which is a different construct from how satisfied you
// feel. RLSS gives the app an honest, separate wellbeing signal.
//
// English stems are VERBATIM from the published scale to preserve validity; the
// Korean is a faithful translation and the `subtitle` is friendly context that
// never changes what is measured. Scoring here is pure + LLM-free.
//
// CROSS-CULTURAL NOTE (research 2026-06-28): item 4 is a social-comparison stem.
// Self-enhancement / social comparison is weighted differently across cultures
// (Markus & Kitayama 1991; Heine & Hamamura 2007) — for Korean/interdependent
// users it can read more sharply than for US/independent users. The item is kept
// VERBATIM (altering a validated stem breaks the score); the cultural care
// belongs in how the RESULT is framed, not in the instrument.

export interface RlssItem {
  /** 1-based item number in the published RLSS. */
  id: number;
  /** True if the item is reverse-keyed (negatively valenced). */
  reverse: boolean;
  /** Item stem in EN — verbatim from the published RLSS to preserve validity. */
  en: string;
  /** Item stem in KO (faithful translation). */
  ko: string;
  /** Friendly one-line context under the stem. Does NOT affect scoring. */
  subtitleEn: string;
  subtitleKo: string;
}

export const RLSS_ITEMS: readonly RlssItem[] = [
  {
    id: 1,
    reverse: false,
    en: "I like how my life is going.",
    ko: "내 삶이 흘러가는 방식이 마음에 든다.",
    subtitleEn: "The overall direction, not any single day.",
    subtitleKo: "특정 하루가 아니라 전체적인 방향에 대해.",
  },
  {
    id: 2,
    reverse: true,
    en: "If I could live my life over, I would change many things.",
    ko: "다시 살 수 있다면, 많은 것을 바꾸고 싶다.",
    subtitleEn: "Looking back across the whole of it.",
    subtitleKo: "지금까지의 삶을 통틀어 돌아본다면.",
  },
  {
    id: 3,
    reverse: false,
    en: "I am content with my life.",
    ko: "나는 내 삶에 만족한다.",
    subtitleEn: "A settled, at-ease feeling about it.",
    subtitleKo: "전반적으로 편안하고 안정된 느낌.",
  },
  {
    id: 4,
    reverse: true,
    en: "Those around me seem to be living better lives than my own.",
    ko: "내 주변 사람들이 나보다 더 나은 삶을 사는 것 같다.",
    subtitleEn: "How it feels, not a measured fact.",
    subtitleKo: "사실 판단이 아니라, 느껴지는 정도.",
  },
  {
    id: 5,
    reverse: false,
    en: "I am satisfied with where I am in life right now.",
    ko: "지금 내 삶이 와 있는 자리에 만족한다.",
    subtitleEn: "Your current point, as of today.",
    subtitleKo: "오늘 기준, 지금 서 있는 지점에 대해.",
  },
  {
    id: 6,
    reverse: true,
    en: "I want to change the path my life is on.",
    ko: "지금 내 삶이 가는 길을 바꾸고 싶다.",
    subtitleEn: "The trajectory you're currently on.",
    subtitleKo: "지금 올라타 있는 흐름·방향에 대해.",
  },
] as const;

export type RlssResponses = Partial<Record<number, number>>;

export interface RlssResult {
  /** Mean of the 6 items on the 1-7 scale after reverse-coding (0 if none answered). */
  mean: number;
  /** Sum of the 6 reverse-coded item scores (6-42 when complete). */
  total: number;
  answered: number;
  complete: boolean;
}

/** Reverse-key a 1-7 response: 1<->7, 2<->6, 3<->5, 4<->4. */
function reverseScore(value: number): number {
  return 8 - value;
}

export function scoreRlss(responses: RlssResponses): RlssResult {
  let sum = 0;
  let answered = 0;
  for (const item of RLSS_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 7 || !Number.isFinite(raw)) continue;
    answered += 1;
    sum += item.reverse ? reverseScore(raw) : raw;
  }
  const mean = answered > 0 ? sum / answered : 0;
  return { mean, total: sum, answered, complete: answered === RLSS_ITEMS.length };
}

/**
 * Map an RLSS mean (1-7) to a 0-100 bar percentage with the same (v-1)/range
 * anchor the persona bars use: 1 -> 0%, 4 -> 50% (neutral), 7 -> 100%. Keeps a
 * satisfaction reading on the same visual scale as the rest of the persona.
 */
export function rlssMeanToPercent(mean: number): number {
  const clamped = Math.max(1, Math.min(7, mean));
  return Math.round(((clamped - 1) / 6) * 100);
}

export type RlssBand = "lower" | "mixed" | "higher";

/**
 * Coarse, NON-CLINICAL band for the result copy: a self-report satisfaction
 * reading at one moment, never a health label or claim. Thresholds on the
 * 1-7 mean: <=3 lower, 3-5 mixed, >=5 higher.
 */
export function rlssBand(mean: number): RlssBand {
  if (mean >= 5) return "higher";
  if (mean <= 3) return "lower";
  return "mixed";
}

export const RLSS_BAND_LABEL: Record<"en" | "ko", Record<RlssBand, string>> = {
  ko: {
    lower: "지금은 만족이 낮은 편",
    mixed: "만족이 엇갈리는 편",
    higher: "지금은 만족이 높은 편",
  },
  en: {
    lower: "Lower satisfaction right now",
    mixed: "Mixed satisfaction",
    higher: "Higher satisfaction right now",
  },
};
