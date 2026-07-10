// Strengths self-report — a SHORT, positively-keyed self-report of how much a
// handful of character strengths feel like the respondent. This is NOT a
// medical assessment and NOT a validated proprietary instrument: it is the
// user's OWN self-rating, framed as an estimate. It mirrors the values-survey
// shape (values-survey.ts) so the /strengths screen can populate a SIGNATURE
// strengths top-3 + a 강점 스펙트럼 the same way /values populates its lens.
//
// Scale: 1 (전혀 나 같지 않다) … 6 (매우 나 같다). All 10 items are positively
// keyed (no reverse items) — a higher answer always means the strength feels
// more like the respondent. Per-strength score = mean of its 2 items,
// normalized to a 0-100 bar via (mean-1)/5*100 (6-point floor→0%, ceiling→100%).
//
// HONESTY: confidence is deliberately capped well below 100%. Ten items over
// five strengths is a brief self-report, so a full-completion run reads ~64%
// confidence, not certainty — the same honest sub-max the values instrument
// shows. The stored scores are always the respondent's real answers; nothing is
// fabricated, and this is a self-report estimate, not a medical assessment.

export type StrengthId =
  | "curiosity"
  | "grit"
  | "honesty"
  | "empathy"
  | "aesthetics";

export interface StrengthItem {
  /** 1-based item number. */
  id: number;
  /** Strength this item loads on. */
  strength: StrengthId;
  /** Item stem in KO — the measured content, kept verbatim. */
  ko: string;
  /** Natural EN rendering of the same stem. */
  en: string;
  /** Friendly one-line context under the stem (does not affect scoring). */
  subtitleKo: string;
  subtitleEn: string;
}

// Two items per strength, all positively keyed. The KO stems are the measured
// content and MUST NOT be reworded. EN is a natural rendering; the subtitle is
// context only.
export const STRENGTH_ITEMS: readonly StrengthItem[] = [
  // ── curiosity (호기심) ───────────────────────────────────────────────
  { id: 1, strength: "curiosity", ko: "새로운 것을 알아가는 게 즐겁고, 자주 파고든다.", en: "Learning new things is fun for me, and I often dig in.", subtitleKo: "새로운 걸 알아가는 재미에 자주 빠진다.", subtitleEn: "Discovery is its own reward." },
  { id: 2, strength: "curiosity", ko: "모르는 걸 만나면 그냥 넘기기보다 알아보고 싶어진다.", en: "When I meet something I don't know, I'd rather look into it than let it pass.", subtitleKo: "모르는 건 그냥 넘기지 못한다.", subtitleEn: "An unknown is hard to leave alone." },
  // ── grit (끈기) ──────────────────────────────────────────────────────
  { id: 3, strength: "grit", ko: "한번 시작한 일은 힘들어도 끝까지 붙드는 편이다.", en: "Once I start something, I tend to hold on to the end even when it's hard.", subtitleKo: "시작한 건 끝까지 붙든다.", subtitleEn: "I see things through." },
  { id: 4, strength: "grit", ko: "관심이 생긴 일은 오래도록 꾸준히 이어간다.", en: "When something catches my interest, I keep at it for a long time.", subtitleKo: "관심 생긴 일은 오래 이어간다.", subtitleEn: "Interest turns into staying power." },
  // ── honesty (정직함) ─────────────────────────────────────────────────
  { id: 5, strength: "honesty", ko: "생각과 겉으로 하는 말이 일치하도록 애쓴다.", en: "I try to keep what I think and what I say out loud aligned.", subtitleKo: "생각과 말을 맞추려 한다.", subtitleEn: "Inside and outside line up." },
  { id: 6, strength: "honesty", ko: "불편해도 솔직하게 말하는 쪽을 택한다.", en: "I lean toward speaking honestly even when it's uncomfortable.", subtitleKo: "불편해도 솔직한 쪽을 고른다.", subtitleEn: "Candor over comfort." },
  // ── empathy (공감) ───────────────────────────────────────────────────
  { id: 7, strength: "empathy", ko: "상대의 기분이나 속마음을 잘 알아차리는 편이다.", en: "I tend to pick up on how others feel and what's on their mind.", subtitleKo: "상대의 기분을 잘 읽는다.", subtitleEn: "I read the room's feelings." },
  { id: 8, strength: "empathy", ko: "누군가 힘들어하면 그 마음이 나에게도 전해진다.", en: "When someone is hurting, that feeling reaches me too.", subtitleKo: "남의 힘듦이 나에게도 전해진다.", subtitleEn: "Others' weight lands on me." },
  // ── aesthetics (심미안) ──────────────────────────────────────────────
  { id: 9, strength: "aesthetics", ko: "잘 만들어진 것이나 아름다운 것을 금방 알아본다.", en: "I quickly notice things that are well-made or beautiful.", subtitleKo: "잘 만든 것을 금방 알아본다.", subtitleEn: "Quality catches my eye." },
  { id: 10, strength: "aesthetics", ko: "일상에서 미묘한 아름다움에 마음이 자주 움직인다.", en: "In everyday life, subtle beauty often moves me.", subtitleKo: "일상의 미묘한 아름다움에 자주 움직인다.", subtitleEn: "Small beauty moves me." },
] as const;

/** Item id → answer on the 1..6 scale. */
export type StrengthsResponses = Record<number, number>;

export interface StrengthScore {
  strength: StrengthId;
  /** 0-100 bar value normalized from the strength's 1-6 item mean. */
  score: number;
}

export interface StrengthsResult {
  /** Per-strength scores, sorted descending (highest first). */
  scores: StrengthScore[];
  /** 0..1 honest confidence — brief self-report, capped well under 1. */
  confidence: number;
  answered: number;
  complete: boolean;
}

// Full completion reads as ~0.64 (not 1.0): ten items over five strengths is a
// brief self-report, so the honest sub-max mirrors the values instrument's 확신 %.
// A hard 0.7 cap keeps any future scaling from ever implying certainty.
const CONFIDENCE_CEILING = 0.64;
const CONFIDENCE_HARD_CAP = 0.7;

/** i18n row key (home.json ds.axisCheck.strengths.rows) for each StrengthId.
 *  The strength ids already match the i18n row keys 1:1, but the map is kept
 *  explicit to mirror VALUE_ROW_KEY and stay robust to any future rename. */
export const STRENGTH_ROW_KEY: Record<StrengthId, string> = {
  curiosity: "curiosity",
  grit: "grit",
  honesty: "honesty",
  empathy: "empathy",
  aesthetics: "aesthetics",
};

const STRENGTH_IDS: readonly StrengthId[] = [
  "curiosity",
  "grit",
  "honesty",
  "empathy",
  "aesthetics",
];

/**
 * Score a set of strengths responses. Per strength = mean of its two 1-6 items,
 * normalized to 0-100 via (mean-1)/5*100 and rounded. Scores sort descending.
 * Confidence = answered-fraction × a modest ceiling (10/10 → ~0.64), hard-capped
 * at 0.7 so the brief self-report never reads as certainty.
 */
export function scoreStrengths(responses: StrengthsResponses): StrengthsResult {
  const sums: Record<StrengthId, { sum: number; count: number }> = {
    curiosity: { sum: 0, count: 0 },
    grit: { sum: 0, count: 0 },
    honesty: { sum: 0, count: 0 },
    empathy: { sum: 0, count: 0 },
    aesthetics: { sum: 0, count: 0 },
  };

  let answered = 0;
  for (const item of STRENGTH_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 6 || !Number.isFinite(raw)) continue;
    answered += 1;
    sums[item.strength].sum += raw;
    sums[item.strength].count += 1;
  }

  const scores: StrengthScore[] = STRENGTH_IDS.map((strength) => {
    const { sum, count } = sums[strength];
    const mean = count > 0 ? sum / count : 0;
    const score = count > 0 ? Math.round(((mean - 1) / 5) * 100) : 0;
    return { strength, score };
  }).sort((a, b) => b.score - a.score);

  const answeredFraction = STRENGTH_ITEMS.length > 0 ? answered / STRENGTH_ITEMS.length : 0;
  const confidence = Math.min(
    CONFIDENCE_HARD_CAP,
    Math.round(answeredFraction * CONFIDENCE_CEILING * 100) / 100,
  );

  return { scores, confidence, answered, complete: answered === STRENGTH_ITEMS.length };
}

export const STRENGTH_LABEL_KO: Record<StrengthId, string> = {
  curiosity: "호기심",
  grit: "끈기",
  honesty: "정직함",
  empathy: "공감",
  aesthetics: "심미안",
};

export const STRENGTH_LABEL_EN: Record<StrengthId, string> = {
  curiosity: "Curiosity",
  grit: "Grit",
  honesty: "Honesty",
  empathy: "Empathy",
  aesthetics: "Aesthetics",
};
