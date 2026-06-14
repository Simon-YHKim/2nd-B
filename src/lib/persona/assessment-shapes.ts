export const MBTI_SCORE_KEYS = ["E", "I", "S", "N", "T", "F", "J", "P"] as const;
export type MbtiScoreKey = (typeof MBTI_SCORE_KEYS)[number];
export type MbtiScores = Record<MbtiScoreKey, number>;

const MBTI_TYPE = /^[EI][NS][TF][JP]$/;

export interface MbtiResult {
  type: string;
  scores: MbtiScores;
}

export function isCompleteMbtiScores(scores: unknown): scores is MbtiScores {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return false;
  const s = scores as Record<string, unknown>;
  return MBTI_SCORE_KEYS.every((key) => Number.isFinite(s[key]));
}

export function isValidMbtiResult(value: unknown): value is MbtiResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string" && MBTI_TYPE.test(v.type) && isCompleteMbtiScores(v.scores);
}

export function hasAnyMbtiSignal(value: Record<string, unknown>): boolean {
  const scores = value.scores;
  return (
    typeof value.type === "string" ||
    (!!scores &&
      typeof scores === "object" &&
      !Array.isArray(scores) &&
      MBTI_SCORE_KEYS.some((key) => key in (scores as Record<string, unknown>)))
  );
}
