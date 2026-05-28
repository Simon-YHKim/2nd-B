// 32-item MBTI-style screener. 8 forced-choice items per dichotomy:
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
// validated BFI / ECR-S so users can compare.
//
// The 32 items here are paraphrased from the public-domain pool used
// by 16personalities.com-style assessments. They are NOT the official
// MBTI inventory (which is copyrighted by The Myers-Briggs Company).
// `subtitle` is a one-line concrete example shown under each stem to
// reduce abstract self-rating.

export type MbtiDichotomy = "EI" | "SN" | "TF" | "JP";

export interface MbtiItem {
  id: number;
  dichotomy: MbtiDichotomy;
  /** When the user agrees, which side of the dichotomy do they lean? */
  agreeSide: "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
  en: string;
  ko: string;
  subtitleEn: string;
  subtitleKo: string;
}

export const MBTI_ITEMS: readonly MbtiItem[] = [
  // ── E ↔ I (8) ──
  { id: 1, dichotomy: "EI", agreeSide: "E", en: "I recharge by being around other people.", ko: "다른 사람들과 함께 있으면 에너지가 충전된다.", subtitleEn: "A social evening leaves you energized, not drained.", subtitleKo: "사람 만난 저녁이 진을 빼기보다 채워준다." },
  { id: 2, dichotomy: "EI", agreeSide: "I", en: "I need quiet alone time to feel like myself.", ko: "혼자 있는 조용한 시간이 있어야 나다워진다.", subtitleEn: "Solitude isn't loneliness — it's how you reset.", subtitleKo: "혼자는 외로움이 아니라 리셋의 방식." },
  { id: 3, dichotomy: "EI", agreeSide: "E", en: "I usually think out loud, in conversation.", ko: "생각은 보통 대화를 통해 정리된다.", subtitleEn: "Ideas crystallize when you say them, not before.", subtitleKo: "생각은 말하고 나서야 또렷해진다." },
  { id: 4, dichotomy: "EI", agreeSide: "I", en: "I prefer deep one-on-one talks over group settings.", ko: "여러 명보다 일대일 깊은 대화가 편하다.", subtitleEn: "Group dynamics dilute what you want to say.", subtitleKo: "여러 명이면 하고 싶은 말이 흐려진다." },
  { id: 5, dichotomy: "EI", agreeSide: "E", en: "After a busy social day, I still want to call a friend.", ko: "사람들과 보낸 하루 끝에도 친구에게 전화하고 싶다.", subtitleEn: "Your social battery rarely fully drains.", subtitleKo: "사회 배터리가 다 닳는 일이 드물다." },
  { id: 6, dichotomy: "EI", agreeSide: "I", en: "After a busy social day, I shut my phone off.", ko: "사람들과 보낸 하루 끝에는 휴대폰을 꺼둔다.", subtitleEn: "Quiet is the only thing that puts the day to bed.", subtitleKo: "조용함이 있어야 하루가 마무리된다." },
  { id: 7, dichotomy: "EI", agreeSide: "E", en: "I enjoy being the center of attention.", ko: "주목받는 자리가 즐겁다.", subtitleEn: "Spotlight feels like fuel, not pressure.", subtitleKo: "조명이 압박보다 연료에 가깝다." },
  { id: 8, dichotomy: "EI", agreeSide: "I", en: "I'd rather observe a room than be its focus.", ko: "주인공이 되기보다 관찰하는 쪽이 좋다.", subtitleEn: "You read the room before joining it.", subtitleKo: "들어가기 전에 분위기를 먼저 읽는다." },

  // ── S ↔ N (8) ──
  { id: 9, dichotomy: "SN", agreeSide: "S", en: "I trust facts and direct experience more than theories.", ko: "이론보다는 사실과 직접 경험을 더 믿는다.", subtitleEn: "Show, don't tell — and don't speculate.", subtitleKo: "추측보다 직접 보여줘야 믿어진다." },
  { id: 10, dichotomy: "SN", agreeSide: "N", en: "I'm often more interested in possibilities than what is.", ko: "지금 있는 것보다 가능성에 더 끌리는 편이다.", subtitleEn: "What could be pulls harder than what is.", subtitleKo: "있는 것보다 될 수 있는 게 더 끌린다." },
  { id: 11, dichotomy: "SN", agreeSide: "S", en: "I focus on details before stepping back to the big picture.", ko: "큰 그림보다 디테일을 먼저 본다.", subtitleEn: "Specifics first, framework after.", subtitleKo: "구체적인 것 먼저, 틀은 그 다음." },
  { id: 12, dichotomy: "SN", agreeSide: "N", en: "I find patterns and connections quickly across topics.", ko: "주제들 사이에서 패턴과 연결을 빠르게 본다.", subtitleEn: "Cross-domain analogies show up fast.", subtitleKo: "분야가 달라도 비슷한 구조가 빨리 보인다." },
  { id: 13, dichotomy: "SN", agreeSide: "S", en: "I describe events by what happened, in order.", ko: "있었던 일을 순서대로 설명하는 편이다.", subtitleEn: "Narration goes step-by-step, then-and-now.", subtitleKo: "있었던 순서대로 따라가며 설명한다." },
  { id: 14, dichotomy: "SN", agreeSide: "N", en: "I describe events by what they meant or hinted at.", ko: "있었던 일이 무엇을 의미했는지로 설명하는 편이다.", subtitleEn: "The meaning is the headline, not the timeline.", subtitleKo: "시간 순서보다 의미가 헤드라인." },
  { id: 15, dichotomy: "SN", agreeSide: "S", en: "Tradition has wisdom worth preserving.", ko: "전통은 보존할 가치가 있는 지혜를 담고 있다.", subtitleEn: "If it survived this long, there's a reason.", subtitleKo: "이 만큼 살아남았다면 이유가 있다." },
  { id: 16, dichotomy: "SN", agreeSide: "N", en: "Conventions exist to be questioned and reinvented.", ko: "관습은 질문하고 새로 만들어야 할 대상이다.", subtitleEn: "Default settings are starting points, not endings.", subtitleKo: "기본값은 출발점이지 종착점이 아니다." },

  // ── T ↔ F (8) ──
  { id: 17, dichotomy: "TF", agreeSide: "T", en: "I make decisions by weighing logic and consistency.", ko: "결정은 논리와 일관성으로 판단하는 편이다.", subtitleEn: "Pros/cons on paper, then decide.", subtitleKo: "장단점을 정리한 다음 결정한다." },
  { id: 18, dichotomy: "TF", agreeSide: "F", en: "I weigh how a decision affects people and relationships.", ko: "결정이 사람과 관계에 미치는 영향을 중요하게 본다.", subtitleEn: "Who gets hurt is part of the calculation.", subtitleKo: "누가 다칠지가 계산의 일부." },
  { id: 19, dichotomy: "TF", agreeSide: "T", en: "I'd rather be honest than tactful when they conflict.", ko: "정직과 배려가 부딪칠 때 정직 쪽을 택한다.", subtitleEn: "Sugarcoating feels worse than the truth.", subtitleKo: "포장이 진실보다 더 불편하다." },
  { id: 20, dichotomy: "TF", agreeSide: "F", en: "Empathy comes naturally to me even with strangers.", ko: "낯선 사람에게도 공감하는 게 자연스럽다.", subtitleEn: "Other people's weather lands on you quickly.", subtitleKo: "남의 기분 날씨가 금방 옮아온다." },
  { id: 21, dichotomy: "TF", agreeSide: "T", en: "A clear principle beats a case-by-case ruling.", ko: "분명한 원칙이 사례별 판단보다 낫다.", subtitleEn: "Consistency you can trust > flexible exceptions.", subtitleKo: "믿을 수 있는 일관성 > 유연한 예외." },
  { id: 22, dichotomy: "TF", agreeSide: "F", en: "The right call depends on who's in front of me.", ko: "옳은 판단은 앞에 있는 사람에 따라 달라진다.", subtitleEn: "Context first, principle second.", subtitleKo: "맥락 먼저, 원칙은 그 다음." },
  { id: 23, dichotomy: "TF", agreeSide: "T", en: "I find debate energizing, not draining.", ko: "토론은 진을 빼기보다 활력을 준다.", subtitleEn: "Friction sharpens thinking — bring it on.", subtitleKo: "마찰이 생각을 날카롭게 한다." },
  { id: 24, dichotomy: "TF", agreeSide: "F", en: "Conflict between people is something I try to absorb.", ko: "사람들 사이의 갈등은 흡수하려 애쓰는 편이다.", subtitleEn: "You feel the room's tension before words form.", subtitleKo: "말이 되기 전에 분위기 긴장이 먼저 느껴진다." },

  // ── J ↔ P (8) ──
  { id: 25, dichotomy: "JP", agreeSide: "J", en: "I like deciding things and having a plan in place.", ko: "정해 두고 계획대로 움직이는 게 좋다.", subtitleEn: "Open loops are uncomfortable to leave open.", subtitleKo: "결정 안 된 채로 두는 게 불편하다." },
  { id: 26, dichotomy: "JP", agreeSide: "P", en: "I keep options open as long as I can.", ko: "선택지를 가능한 한 오래 열어둔다.", subtitleEn: "Locking in too early feels like losing.", subtitleKo: "너무 일찍 결정하면 잃는 느낌." },
  { id: 27, dichotomy: "JP", agreeSide: "J", en: "Deadlines help me feel grounded, not stressed.", ko: "마감이 부담이 아니라 안정감을 준다.", subtitleEn: "A clear end-date is a gift, not a threat.", subtitleKo: "분명한 마감일은 위협이 아니라 선물." },
  { id: 28, dichotomy: "JP", agreeSide: "P", en: "I work best when I can improvise as I go.", ko: "그때그때 즉흥적으로 움직일 때 가장 잘 된다.", subtitleEn: "Plans constrain more than they help.", subtitleKo: "계획이 돕기보다 묶을 때가 많다." },
  { id: 29, dichotomy: "JP", agreeSide: "J", en: "Finishing things gives me more satisfaction than starting them.", ko: "시작보다 끝맺음에서 더 큰 만족을 느낀다.", subtitleEn: "The last 10% is the best part.", subtitleKo: "마지막 10%가 가장 좋은 구간." },
  { id: 30, dichotomy: "JP", agreeSide: "P", en: "Starting new things gives me more energy than finishing them.", ko: "끝맺음보다 새로 시작할 때 에너지가 더 난다.", subtitleEn: "First 10% beats the last 10%.", subtitleKo: "처음 10%가 마지막 10%보다 좋다." },
  { id: 31, dichotomy: "JP", agreeSide: "J", en: "I make to-do lists and stick to them.", ko: "할 일 목록을 만들고 그대로 지킨다.", subtitleEn: "Checkboxes get checked, in order.", subtitleKo: "체크박스가 순서대로 체크된다." },
  { id: 32, dichotomy: "JP", agreeSide: "P", en: "To-do lists become suggestions within an hour.", ko: "할 일 목록은 한 시간 안에 참고사항이 된다.", subtitleEn: "Lists describe possibilities, not commitments.", subtitleKo: "목록은 가능성이지 약속이 아니다." },
] as const;

export type MbtiResponses = Partial<Record<number, number>>;

export interface MbtiResult {
  /** 4-letter type, e.g. "INTJ". null until all 32 items answered. */
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
