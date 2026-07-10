// Motivation self-report — a SHORT, positively-keyed self-report of what moves
// the respondent, anchored to Self-Determination Theory (SDT). This is NOT a
// medical assessment and NOT a validated proprietary instrument: it is the
// user's OWN self-rating, framed as an estimate. It mirrors the values-survey /
// strengths-survey shape so the /motivation screen can populate an INTRINSIC ↔
// EXTRINSIC balance + a 세 가지 욕구 (SDT-need) spectrum the same way /values and
// /strengths populate their lenses.
//
// Scale: 1 (전혀 나 같지 않다) … 6 (매우 나 같다). All 9 items are positively
// keyed (no reverse items) — a higher answer always means MORE of the construct
// that item measures. The three SDT needs (autonomy / competence / relatedness)
// are the intrinsic side; the three extrinsic items measure the extrinsic side
// DIRECTLY (higher = more extrinsically driven). The intrinsic↔extrinsic balance
// is derived from these two item groups, never by reverse-scoring anything.
//
// Per SDT need = mean of its 2 items, normalized to a 0-100 bar via
// (mean-1)/5*100 (6-point floor→0%, ceiling→100%). The intrinsic share is the
// scaled mean of all six need items relative to the sum of the scaled intrinsic
// and extrinsic means (a proportion, 0-100).
//
// HONESTY: confidence is deliberately capped well below 100%. Nine items is a
// brief self-report, so a full-completion run reads ~64% confidence, not
// certainty — the same honest sub-max the values / strengths instruments show.
// The stored scores are always the respondent's real answers; nothing is
// fabricated, and this is a self-report estimate, not a medical assessment.

export type MotivationKey = "autonomy" | "competence" | "relatedness" | "extrinsic";

/** The three SDT needs — the intrinsic side, rendered as the 3-bar spectrum.
 *  Extrinsic is a fourth measured pole but is NOT an SDT need, so it never
 *  appears in the need spectrum (it feeds the intrinsic↔extrinsic balance only). */
export type MotivationNeedKey = "autonomy" | "competence" | "relatedness";

export interface MotivationItem {
  /** 1-based item number. */
  id: number;
  /** Construct this item loads on. */
  key: MotivationKey;
  /** Item stem in KO — the measured content, kept verbatim. */
  ko: string;
  /** Natural EN rendering of the same stem. */
  en: string;
  /** Friendly one-line context under the stem (does not affect scoring). */
  subtitleKo: string;
  subtitleEn: string;
}

// Nine items, all positively keyed. Two per SDT need (autonomy / competence /
// relatedness) plus three extrinsic items. The KO stems are the measured content
// and MUST NOT be reworded. EN is a natural rendering; the subtitle is context only.
export const MOTIVATION_ITEMS: readonly MotivationItem[] = [
  // ── autonomy (자율성) ────────────────────────────────────────────────
  { id: 1, key: "autonomy", ko: "누가 시켜서가 아니라 내가 원해서 움직일 때가 많다.", en: "I often act because I want to, not because someone told me to.", subtitleKo: "내 의지로 시작할 때가 편해요.", subtitleEn: "It sits right when the push comes from me." },
  { id: 2, key: "autonomy", ko: "스스로 방식을 정할 수 있을 때 더 힘이 난다.", en: "I have more energy when I can decide my own approach.", subtitleKo: "방식을 고를 수 있을 때 힘이 나요.", subtitleEn: "Choosing the how lifts my energy." },
  // ── competence (유능감) ──────────────────────────────────────────────
  { id: 3, key: "competence", ko: "잘 해내고 성장하는 느낌 자체가 나를 움직인다.", en: "The feeling of doing well and growing is itself what moves me.", subtitleKo: "나아지는 감각 자체가 연료예요.", subtitleEn: "Getting better is its own fuel." },
  { id: 4, key: "competence", ko: "어려운 걸 해낼 수 있다는 감각이 동기가 된다.", en: "The sense that I can pull off something hard motivates me.", subtitleKo: "해낼 수 있다는 감각이 밀어줘요.", subtitleEn: "Feeling capable pushes me forward." },
  // ── relatedness (관계성) ─────────────────────────────────────────────
  { id: 5, key: "relatedness", ko: "함께하는 사람들과의 연결이 나에게 힘이 된다.", en: "Connection with the people around me gives me strength.", subtitleKo: "연결이 나를 지탱해요.", subtitleEn: "Connection holds me up." },
  { id: 6, key: "relatedness", ko: "혼자보다 누군가와 함께일 때 더 움직이게 된다.", en: "I get moving more when I'm with someone than on my own.", subtitleKo: "함께일 때 더 움직여요.", subtitleEn: "Company gets me going." },
  // ── extrinsic (외적 동기) ────────────────────────────────────────────
  { id: 7, key: "extrinsic", ko: "보상이나 대가가 있을 때 더 열심히 하게 된다.", en: "I try harder when there's a reward or a payoff.", subtitleKo: "보상이 있으면 더 밀어붙여요.", subtitleEn: "A reward makes me push harder." },
  { id: 8, key: "extrinsic", ko: "남들의 인정이나 평가가 나를 움직이는 큰 이유다.", en: "Other people's recognition or judgment is a big reason I act.", subtitleKo: "인정이 큰 이유가 돼요.", subtitleEn: "Recognition is a big driver." },
  { id: 9, key: "extrinsic", ko: "해야만 해서, 안 하면 불이익이 있어서 움직일 때가 많다.", en: "I often act because I have to, since there's a downside if I don't.", subtitleKo: "불이익을 피하려 움직이기도 해요.", subtitleEn: "Sometimes I move to avoid a penalty." },
] as const;

/** Item id → answer on the 1..6 scale. */
export type MotivationResponses = Record<number, number>;

export interface MotivationNeedScore {
  key: MotivationNeedKey;
  /** 0-100 bar value normalized from the need's 1-6 item mean. */
  score: number;
}

export interface MotivationResult {
  /** Per-SDT-need scores (autonomy/competence/relatedness), sorted descending. */
  needs: MotivationNeedScore[];
  /** Intrinsic share of the intrinsic+extrinsic balance, 0-100 (rounded). */
  intrinsicPct: number;
  /** Extrinsic share, 0-100 — always 100 - intrinsicPct. */
  extrinsicPct: number;
  /** 0..1 honest confidence — brief self-report, capped well under 1. */
  confidence: number;
  answered: number;
  complete: boolean;
}

// Full completion reads as ~0.64 (not 1.0): nine items is a brief self-report,
// so the honest sub-max mirrors the values / strengths instruments' 확신 %. A hard
// 0.7 cap keeps any future scaling from ever implying certainty.
const CONFIDENCE_CEILING = 0.64;
const CONFIDENCE_HARD_CAP = 0.7;

/** i18n row key (home.json ds.axisCheck.motivation.rows) for each SDT need.
 *  The need ids already match the i18n row keys 1:1, but the map is kept explicit
 *  to mirror VALUE_ROW_KEY / STRENGTH_ROW_KEY and stay robust to a future rename. */
export const MOTIVATION_ROW_KEY: Record<MotivationNeedKey, string> = {
  autonomy: "autonomy",
  competence: "competence",
  relatedness: "relatedness",
};

const NEED_KEYS: readonly MotivationNeedKey[] = ["autonomy", "competence", "relatedness"];

/**
 * Score a set of motivation responses (SDT).
 * - Per SDT need = mean of its two 1-6 items, normalized to 0-100 via
 *   (mean-1)/5*100 and rounded; the three need scores sort descending.
 * - intrinsicRaw = scaled mean of all six need items (0-100); extrinsicRaw =
 *   scaled mean of the three extrinsic items (0-100).
 * - intrinsicPct = round(intrinsicRaw / (intrinsicRaw + extrinsicRaw) * 100),
 *   guarded to 50 when both sides are zero (divide-by-zero); extrinsicPct is the
 *   complement so the two always sum to 100.
 * - Confidence = answered-fraction × a modest ceiling (9/9 → ~0.64), hard-capped
 *   at 0.7 so the brief self-report never reads as certainty.
 */
export function scoreMotivation(responses: MotivationResponses): MotivationResult {
  const sums: Record<MotivationKey, { sum: number; count: number }> = {
    autonomy: { sum: 0, count: 0 },
    competence: { sum: 0, count: 0 },
    relatedness: { sum: 0, count: 0 },
    extrinsic: { sum: 0, count: 0 },
  };

  let answered = 0;
  for (const item of MOTIVATION_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 6 || !Number.isFinite(raw)) continue;
    answered += 1;
    sums[item.key].sum += raw;
    sums[item.key].count += 1;
  }

  const needs: MotivationNeedScore[] = NEED_KEYS.map((key) => {
    const { sum, count } = sums[key];
    const mean = count > 0 ? sum / count : 0;
    const score = count > 0 ? Math.round(((mean - 1) / 5) * 100) : 0;
    return { key, score };
  }).sort((a, b) => b.score - a.score);

  // Intrinsic = all six need items pooled; extrinsic = the three extrinsic items.
  // Both normalized to the same 0-100 scale before being turned into a share.
  const intrinsicSum = sums.autonomy.sum + sums.competence.sum + sums.relatedness.sum;
  const intrinsicCount = sums.autonomy.count + sums.competence.count + sums.relatedness.count;
  const intrinsicMean = intrinsicCount > 0 ? intrinsicSum / intrinsicCount : 0;
  const intrinsicRaw = intrinsicCount > 0 ? ((intrinsicMean - 1) / 5) * 100 : 0;

  const extMean = sums.extrinsic.count > 0 ? sums.extrinsic.sum / sums.extrinsic.count : 0;
  const extrinsicRaw = sums.extrinsic.count > 0 ? ((extMean - 1) / 5) * 100 : 0;

  const denom = intrinsicRaw + extrinsicRaw;
  const intrinsicPct = denom > 0 ? Math.round((intrinsicRaw / denom) * 100) : 50;
  const extrinsicPct = 100 - intrinsicPct;

  const answeredFraction = MOTIVATION_ITEMS.length > 0 ? answered / MOTIVATION_ITEMS.length : 0;
  const confidence = Math.min(
    CONFIDENCE_HARD_CAP,
    Math.round(answeredFraction * CONFIDENCE_CEILING * 100) / 100,
  );

  return {
    needs,
    intrinsicPct,
    extrinsicPct,
    confidence,
    answered,
    complete: answered === MOTIVATION_ITEMS.length,
  };
}

export const MOTIVATION_LABEL_KO: Record<MotivationKey, string> = {
  autonomy: "자율성",
  competence: "유능감",
  relatedness: "관계성",
  extrinsic: "외적 동기",
};

export const MOTIVATION_LABEL_EN: Record<MotivationKey, string> = {
  autonomy: "Autonomy",
  competence: "Competence",
  relatedness: "Relatedness",
  extrinsic: "Extrinsic",
};
