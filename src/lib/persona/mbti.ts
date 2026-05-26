// 16-item MBTI-style screener. 4 forced-choice items per dichotomy:
//   E ↔ I (extraversion / introversion)
//   S ↔ N (sensing / intuition)
//   T ↔ F (thinking / feeling)
//   J ↔ P (judging / perceiving)
//
// IMPORTANT CAVEAT: MBTI has well-documented psychometric weaknesses
// (low test-retest reliability, weak construct validity, no
// dimensional support for the bimodal types). The blueprint §9
// explicitly cites MBTI under "회피" (avoid). This module exists
// because the user explicitly requested it for their personal use —
// it's clearly framed in the UI as "popular framework, not a
// scientific measure" and the result is stored alongside the
// validated TIPI / ECR-S so users can compare.
//
// The 16 items here are paraphrased from the public-domain pool used
// by 16personalities.com-style assessments. They are NOT the official
// MBTI inventory (which is copyrighted by The Myers-Briggs Company).

export type MbtiDichotomy = "EI" | "SN" | "TF" | "JP";

export interface MbtiItem {
  id: number;
  dichotomy: MbtiDichotomy;
  /** When the user agrees, which side of the dichotomy do they lean? */
  agreeSide: "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
  en: string;
  ko: string;
}

export const MBTI_ITEMS: readonly MbtiItem[] = [
  // E ↔ I
  { id: 1, dichotomy: "EI", agreeSide: "E", en: "I recharge by being around other people.", ko: "다른 사람들과 함께 있으면 에너지가 충전된다." },
  { id: 2, dichotomy: "EI", agreeSide: "I", en: "I need quiet alone time to feel like myself.", ko: "혼자 있는 조용한 시간이 있어야 나다워진다." },
  { id: 3, dichotomy: "EI", agreeSide: "E", en: "I usually think out loud, in conversation.", ko: "생각은 보통 대화를 통해 정리된다." },
  { id: 4, dichotomy: "EI", agreeSide: "I", en: "I prefer deep one-on-one talks over group settings.", ko: "여러 명보다 일대일 깊은 대화가 편하다." },
  // S ↔ N
  { id: 5, dichotomy: "SN", agreeSide: "S", en: "I trust facts and direct experience more than theories.", ko: "이론보다는 사실과 직접 경험을 더 믿는다." },
  { id: 6, dichotomy: "SN", agreeSide: "N", en: "I'm often more interested in possibilities than what is.", ko: "지금 있는 것보다 가능성에 더 끌리는 편이다." },
  { id: 7, dichotomy: "SN", agreeSide: "S", en: "I focus on details before stepping back to the big picture.", ko: "큰 그림보다 디테일을 먼저 본다." },
  { id: 8, dichotomy: "SN", agreeSide: "N", en: "I find patterns and connections quickly across topics.", ko: "주제들 사이에서 패턴과 연결을 빠르게 본다." },
  // T ↔ F
  { id: 9, dichotomy: "TF", agreeSide: "T", en: "I make decisions by weighing logic and consistency.", ko: "결정은 논리와 일관성으로 판단하는 편이다." },
  { id: 10, dichotomy: "TF", agreeSide: "F", en: "I weigh how a decision affects people and relationships.", ko: "결정이 사람과 관계에 미치는 영향을 중요하게 본다." },
  { id: 11, dichotomy: "TF", agreeSide: "T", en: "I'd rather be honest than tactful when they conflict.", ko: "정직과 배려가 부딪칠 때 정직 쪽을 택한다." },
  { id: 12, dichotomy: "TF", agreeSide: "F", en: "Empathy comes naturally to me even with strangers.", ko: "낯선 사람에게도 공감하는 게 자연스럽다." },
  // J ↔ P
  { id: 13, dichotomy: "JP", agreeSide: "J", en: "I like deciding things and having a plan in place.", ko: "정해 두고 계획대로 움직이는 게 좋다." },
  { id: 14, dichotomy: "JP", agreeSide: "P", en: "I keep options open as long as I can.", ko: "선택지를 가능한 한 오래 열어둔다." },
  { id: 15, dichotomy: "JP", agreeSide: "J", en: "Deadlines help me feel grounded, not stressed.", ko: "마감이 부담이 아니라 안정감을 준다." },
  { id: 16, dichotomy: "JP", agreeSide: "P", en: "I work best when I can improvise as I go.", ko: "그때그때 즉흥적으로 움직일 때 가장 잘 된다." },
] as const;

export type MbtiResponses = Partial<Record<number, number>>;

export interface MbtiResult {
  /** 4-letter type, e.g. "INTJ". null until all 16 items answered. */
  type: string | null;
  scores: Record<"E" | "I" | "S" | "N" | "T" | "F" | "J" | "P", number>;
  answered: number;
  complete: boolean;
}

// Forced-choice 1..5: 1 = strongly disagree, 3 = neutral, 5 = strongly agree.
export function scoreMbti(responses: MbtiResponses): MbtiResult {
  const scores: Record<"E" | "I" | "S" | "N" | "T" | "F" | "J" | "P", number> = {
    E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0,
  };
  let answered = 0;
  for (const item of MBTI_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 5 || !Number.isFinite(raw)) continue;
    answered += 1;
    // raw 3 = neutral, contributes nothing. raw > 3 → leans toward agreeSide.
    // raw < 3 → leans toward the opposite letter.
    const lean = raw - 3; // -2..+2
    if (lean === 0) continue;
    const sideForLean: "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P" =
      lean > 0 ? item.agreeSide : oppositeSide(item.agreeSide);
    scores[sideForLean] += Math.abs(lean);
  }

  const complete = answered === MBTI_ITEMS.length;
  if (!complete) return { type: null, scores, answered, complete };

  const type =
    (scores.E >= scores.I ? "E" : "I") +
    (scores.S >= scores.N ? "S" : "N") +
    (scores.T >= scores.F ? "T" : "F") +
    (scores.J >= scores.P ? "J" : "P");
  return { type, scores, answered, complete };
}

function oppositeSide(s: "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P"): "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P" {
  switch (s) {
    case "E": return "I";
    case "I": return "E";
    case "S": return "N";
    case "N": return "S";
    case "T": return "F";
    case "F": return "T";
    case "J": return "P";
    case "P": return "J";
  }
}

export const TYPE_NICKNAME: Record<"en" | "ko", Record<string, string>> = {
  en: {
    INTJ: "Architect", INTP: "Logician", ENTJ: "Commander", ENTP: "Debater",
    INFJ: "Advocate", INFP: "Mediator", ENFJ: "Protagonist", ENFP: "Campaigner",
    ISTJ: "Logistician", ISFJ: "Defender", ESTJ: "Executive", ESFJ: "Consul",
    ISTP: "Virtuoso", ISFP: "Adventurer", ESTP: "Entrepreneur", ESFP: "Entertainer",
  },
  ko: {
    INTJ: "전략가", INTP: "논리술사", ENTJ: "통솔자", ENTP: "변론가",
    INFJ: "옹호자", INFP: "중재자", ENFJ: "선도자", ENFP: "활동가",
    ISTJ: "현실주의자", ISFJ: "수호자", ESTJ: "경영자", ESFJ: "집정관",
    ISTP: "장인", ISFP: "모험가", ESTP: "사업가", ESFP: "연예인",
  },
};
