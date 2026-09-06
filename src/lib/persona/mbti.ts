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
// because the user explicitly requested it for their personal use -
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
  { id: 1, dichotomy: "EI", agreeSide: "E", en: "I recharge by being around other people.", ko: "다른 사람들과 함께 있으면 에너지가 충전된다.", subtitleEn: "After a social evening, I still feel like talking with people.", subtitleKo: "사람들을 만나고 온 뒤에도 더 이야기하고 싶다." },
  { id: 2, dichotomy: "EI", agreeSide: "I", en: "I need quiet alone time to feel like myself.", ko: "혼자 있는 조용한 시간이 있어야 나다워진다.", subtitleEn: "Spending time alone helps me feel rested.", subtitleKo: "혼자 시간을 보내고 나면 다시 여유가 생긴다." },
  { id: 3, dichotomy: "EI", agreeSide: "E", en: "I usually think out loud, in conversation.", ko: "생각은 보통 대화를 통해 정리된다.", subtitleEn: "Talking an idea through helps me understand it.", subtitleKo: "생각을 말로 꺼내면서 정리하는 편이다." },
  { id: 4, dichotomy: "EI", agreeSide: "I", en: "I prefer deep one-on-one talks over group settings.", ko: "여러 명보다 일대일 깊은 대화가 편하다.", subtitleEn: "I find it easier to talk with one person than with a group.", subtitleKo: "여럿이 있을 때보다 한 사람과 대화할 때 말이 더 잘 나온다." },
  { id: 5, dichotomy: "EI", agreeSide: "E", en: "After a busy social day, I still want to call a friend.", ko: "사람들과 보낸 하루 끝에도 친구에게 전화하고 싶다.", subtitleEn: "Even after seeing people all day, I want another conversation.", subtitleKo: "사람들을 만난 날에도 누군가와 또 이야기하고 싶다." },
  { id: 6, dichotomy: "EI", agreeSide: "I", en: "After a busy social day, I shut my phone off.", ko: "사람들과 보낸 하루 끝에는 휴대폰을 꺼둔다.", subtitleEn: "After seeing people, I want to put my phone away and rest quietly.", subtitleKo: "사람들을 만나고 나면 연락을 멈추고 조용히 쉬고 싶다." },
  { id: 7, dichotomy: "EI", agreeSide: "E", en: "I enjoy being the center of attention.", ko: "주목받는 자리가 즐겁다.", subtitleEn: "I enjoy moments when everyone is paying attention to me.", subtitleKo: "여러 사람이 나에게 관심을 보이는 자리가 즐겁다." },
  { id: 8, dichotomy: "EI", agreeSide: "I", en: "I'd rather observe a room than be its focus.", ko: "주인공이 되기보다 관찰하는 쪽이 좋다.", subtitleEn: "I prefer to watch what is happening before joining in.", subtitleKo: "먼저 분위기를 살펴본 뒤 대화에 참여하는 편이다." },

  // ── S ↔ N (8) ──
  { id: 9, dichotomy: "SN", agreeSide: "S", en: "I trust facts and direct experience more than theories.", ko: "이론보다는 사실과 직접 경험을 더 믿는다.", subtitleEn: "I look for evidence I can check before accepting an explanation.", subtitleKo: "설명을 들으면 직접 확인할 수 있는 근거부터 찾는다." },
  { id: 10, dichotomy: "SN", agreeSide: "N", en: "I'm often more interested in possibilities than what is.", ko: "지금 있는 것보다 가능성에 더 끌리는 편이다.", subtitleEn: "I often think about what might be possible next.", subtitleKo: "앞으로 무엇이 가능할지 생각하는 일이 많다." },
  { id: 11, dichotomy: "SN", agreeSide: "S", en: "I focus on details before stepping back to the big picture.", ko: "큰 그림보다 디테일을 먼저 본다.", subtitleEn: "I check the details before putting the whole picture together.", subtitleKo: "세부 내용을 먼저 확인한 뒤 전체를 정리한다." },
  { id: 12, dichotomy: "SN", agreeSide: "N", en: "I find patterns and connections quickly across topics.", ko: "주제들 사이에서 패턴과 연결을 빠르게 본다.", subtitleEn: "I notice similarities between different subjects.", subtitleKo: "서로 다른 분야에서도 비슷한 점이 눈에 잘 들어온다." },
  { id: 13, dichotomy: "SN", agreeSide: "S", en: "I describe events by what happened, in order.", ko: "있었던 일을 순서대로 설명하는 편이다.", subtitleEn: "I explain an event in the order things happened.", subtitleKo: "어떤 일이 먼저 일어났는지 순서대로 설명한다." },
  { id: 14, dichotomy: "SN", agreeSide: "N", en: "I describe events by what they meant or hinted at.", ko: "있었던 일이 무엇을 의미했는지로 설명하는 편이다.", subtitleEn: "I start with what an event meant, rather than when each part happened.", subtitleKo: "일을 설명할 때 일어난 순서보다 그 의미를 먼저 말한다." },
  { id: 15, dichotomy: "SN", agreeSide: "S", en: "Tradition has wisdom worth preserving.", ko: "전통은 보존할 가치가 있는 지혜를 담고 있다.", subtitleEn: "I consider why a tradition has lasted before changing it.", subtitleKo: "오래 이어진 방식은 그 이유를 살펴보고 바꾸려 한다." },
  { id: 16, dichotomy: "SN", agreeSide: "N", en: "Conventions exist to be questioned and reinvented.", ko: "관습은 질문하고 새로 만들어야 할 대상이다.", subtitleEn: "I question familiar ways of doing things and look for alternatives.", subtitleKo: "늘 하던 방식도 더 나은 방법이 있을지 살펴본다." },

  // ── T ↔ F (8) ──
  { id: 17, dichotomy: "TF", agreeSide: "T", en: "I make decisions by weighing logic and consistency.", ko: "결정은 논리와 일관성으로 판단하는 편이다.", subtitleEn: "I compare the pros and cons before deciding.", subtitleKo: "장단점을 정리한 다음 결정한다." },
  { id: 18, dichotomy: "TF", agreeSide: "F", en: "I weigh how a decision affects people and relationships.", ko: "결정이 사람과 관계에 미치는 영향을 중요하게 본다.", subtitleEn: "Before deciding, I consider how the people involved might feel.", subtitleKo: "결정하기 전에 관련된 사람들이 어떻게 느낄지 생각한다." },
  { id: 19, dichotomy: "TF", agreeSide: "T", en: "I'd rather be honest than tactful when they conflict.", ko: "정직과 배려가 부딪칠 때 정직 쪽을 택한다.", subtitleEn: "I state the facts clearly, even when they may be hard to hear.", subtitleKo: "상대가 듣기 불편하더라도 사실을 분명하게 전하려 한다." },
  { id: 20, dichotomy: "TF", agreeSide: "F", en: "Empathy comes naturally to me even with strangers.", ko: "낯선 사람에게도 공감하는 게 자연스럽다.", subtitleEn: "I can understand how someone feels even when we have just met.", subtitleKo: "처음 만난 사람의 이야기를 들어도 그 사람의 기분을 이해하는 편이다." },
  { id: 21, dichotomy: "TF", agreeSide: "T", en: "A clear principle beats a case-by-case ruling.", ko: "분명한 원칙이 사례별 판단보다 낫다.", subtitleEn: "I prefer applying the same standard across different situations.", subtitleKo: "상황마다 기준을 바꾸기보다 같은 기준으로 판단한다." },
  { id: 22, dichotomy: "TF", agreeSide: "F", en: "The right call depends on who's in front of me.", ko: "옳은 판단은 앞에 있는 사람에 따라 달라진다.", subtitleEn: "I consider each person's circumstances when deciding.", subtitleKo: "같은 문제라도 관련된 사람의 사정을 보고 판단한다." },
  { id: 23, dichotomy: "TF", agreeSide: "T", en: "I find debate energizing, not draining.", ko: "토론은 진을 빼기보다 활력을 준다.", subtitleEn: "Exchanging different views in a debate makes me feel more engaged.", subtitleKo: "서로 다른 의견을 주고받는 토론에 참여하면 활력이 생긴다." },
  { id: 24, dichotomy: "TF", agreeSide: "F", en: "Conflict between people is something I try to absorb.", ko: "사람들 사이의 갈등은 흡수하려 애쓰는 편이다.", subtitleEn: "When people disagree, I try to help them talk it through.", subtitleKo: "사람들 사이에 갈등이 생기면 중간에서 대화를 풀어보려 한다." },

  // ── J ↔ P (8) ──
  { id: 25, dichotomy: "JP", agreeSide: "J", en: "I like deciding things and having a plan in place.", ko: "정해 두고 계획대로 움직이는 게 좋다.", subtitleEn: "Leaving a decision unsettled makes me uncomfortable.", subtitleKo: "결정하지 않은 일이 남아 있으면 불편하다." },
  { id: 26, dichotomy: "JP", agreeSide: "P", en: "I keep options open as long as I can.", ko: "선택지를 가능한 한 오래 열어둔다.", subtitleEn: "I delay deciding so I can consider more options.", subtitleKo: "다른 선택지도 살펴볼 수 있도록 결정을 미룬다." },
  { id: 27, dichotomy: "JP", agreeSide: "J", en: "Deadlines help me feel grounded, not stressed.", ko: "마감이 부담이 아니라 안정감을 준다.", subtitleEn: "Knowing when something needs to be finished helps me feel at ease.", subtitleKo: "언제까지 끝내야 하는지 정해져 있으면 마음이 편하다." },
  { id: 28, dichotomy: "JP", agreeSide: "P", en: "I work best when I can improvise as I go.", ko: "그때그때 즉흥적으로 움직일 때 가장 잘 된다.", subtitleEn: "I adjust to what is happening instead of following a fixed sequence.", subtitleKo: "미리 정한 순서보다 그때 상황에 맞춰 움직인다." },
  { id: 29, dichotomy: "JP", agreeSide: "J", en: "Finishing things gives me more satisfaction than starting them.", ko: "시작보다 끝맺음에서 더 큰 만족을 느낀다.", subtitleEn: "Completing something feels more satisfying than beginning it.", subtitleKo: "일을 시작할 때보다 마칠 때 더 만족스럽다." },
  { id: 30, dichotomy: "JP", agreeSide: "P", en: "Starting new things gives me more energy than finishing them.", ko: "끝맺음보다 새로 시작할 때 에너지가 더 난다.", subtitleEn: "Beginning something new feels more exciting than finishing it.", subtitleKo: "하던 일을 마칠 때보다 새 일을 시작할 때 더 신이 난다." },
  { id: 31, dichotomy: "JP", agreeSide: "J", en: "I make to-do lists and stick to them.", ko: "할 일 목록을 만들고 그대로 지킨다.", subtitleEn: "I work through the tasks in the order I listed them.", subtitleKo: "할 일 목록에 적은 순서대로 끝내는 편이다." },
  { id: 32, dichotomy: "JP", agreeSide: "P", en: "To-do lists become suggestions within an hour.", ko: "할 일 목록은 한 시간 안에 참고사항이 된다.", subtitleEn: "I change my to-do list as soon as the situation changes.", subtitleKo: "상황이 바뀌면 할 일 목록도 바로 바꾼다." },
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
