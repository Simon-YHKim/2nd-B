// ECR-S — Experiences in Close Relationships Short Form (Wei, Russell,
// Mallinckrodt & Vogel, 2007). 12 items, 7-point Likert. Two subscales:
//   - Anxiety (6 items, all positive-keyed)
//   - Avoidance (6 items, 4 reverse-keyed)
//
// Style classification via median-split (midpoint of 1-7 scale = 4):
//   - Low Anxiety + Low Avoidance  → Secure
//   - High Anxiety + Low Avoidance → Preoccupied
//   - Low Anxiety + High Avoidance → Dismissing
//   - High Anxiety + High Avoidance → Fearful
//
// Reference: Wei, M., Russell, D. W., Mallinckrodt, B., & Vogel, D. L.
//   (2007). The Experiences in Close Relationships Scale (ECR)-Short Form:
//   Reliability, validity, and factor structure. Journal of Personality
//   Assessment, 88(2), 187-204.

export type AttachmentDimension = "anxiety" | "avoidance";

export type AttachmentStyle = "secure" | "preoccupied" | "dismissing" | "fearful";

export interface EcrItem {
  id: number;
  dimension: AttachmentDimension;
  reverse: boolean;
  en: string;
  ko: string;
  /** One-line concrete example shown under the stem. Does not affect scoring. */
  subtitleEn: string;
  subtitleKo: string;
}

export const ECR_ITEMS: readonly EcrItem[] = [
  // Anxiety subscale — all positive-keyed.
  { id: 1, dimension: "anxiety", reverse: false, en: "I worry about being abandoned.", ko: "나는 버림받을까 봐 걱정한다.", subtitleEn: "Quiet from someone close pulls your mind to worst-case.", subtitleKo: "가까운 사람의 침묵이 최악의 시나리오로 끌고 간다." },
  { id: 2, dimension: "anxiety", reverse: false, en: "I worry a lot about my close relationships.", ko: "나는 가까운 관계에 대해 자주 걱정한다.", subtitleEn: "Relationship state is on your mind more days than not.", subtitleKo: "관계 상태가 머릿속에 있는 날이 더 많다." },
  { id: 3, dimension: "anxiety", reverse: false, en: "I worry that close others won't care about me as much as I care about them.", ko: "가까운 사람들이 내가 그들을 아끼는 만큼 나를 아끼지 않을까 봐 걱정된다.", subtitleEn: "You count the gap between how much you give and receive.", subtitleKo: "내가 주는 것과 받는 것의 차이를 세어보게 된다." },
  { id: 4, dimension: "anxiety", reverse: false, en: "My desire to be very close sometimes scares people away.", ko: "가까워지고 싶은 내 욕구가 가끔 사람들을 밀어내는 것 같다.", subtitleEn: "When you reach hard, you can feel them step back.", subtitleKo: "강하게 다가갈 때 상대가 물러서는 게 느껴진다." },
  { id: 5, dimension: "anxiety", reverse: false, en: "I need a lot of reassurance that I am loved by the people close to me.", ko: "가까운 사람들이 나를 사랑한다는 확인이 자주 필요하다.", subtitleEn: "Words of love help more than once a week.", subtitleKo: "사랑한다는 말이 일주일에 한 번으론 부족하다." },
  { id: 6, dimension: "anxiety", reverse: false, en: "I find that close others don't want to get as close as I would like.", ko: "가까운 사람들이 내가 원하는 만큼 가까워지길 원하지 않는 것 같다.", subtitleEn: "The closeness you want is more than they offer.", subtitleKo: "원하는 가까움이 상대가 주는 것보다 더 크다." },
  // Avoidance subscale — 4 reverse-keyed + 2 positive-keyed.
  { id: 7, dimension: "avoidance", reverse: true, en: "It helps to turn to close others in times of need.", ko: "힘들 때 가까운 사람에게 의지하는 것이 도움이 된다.", subtitleEn: "Asking for help feels like relief, not weakness.", subtitleKo: "도움 요청이 약함이 아니라 안도감이 된다." },
  { id: 8, dimension: "avoidance", reverse: true, en: "I usually discuss my problems and concerns with close others.", ko: "내 고민이나 걱정을 보통 가까운 사람과 나눈다.", subtitleEn: "Worry shrinks once you've said it out loud.", subtitleKo: "걱정은 말로 꺼내야 줄어든다." },
  { id: 9, dimension: "avoidance", reverse: true, en: "It's easy for me to be affectionate with close others.", ko: "가까운 사람에게 애정을 표현하는 것이 어렵지 않다.", subtitleEn: "Hugs, words of love, small touches — they flow.", subtitleKo: "포옹 · 사랑한다는 말 · 작은 접촉이 자연스럽다." },
  { id: 10, dimension: "avoidance", reverse: true, en: "I feel comfortable depending on close others.", ko: "가까운 사람에게 기대는 것이 편안하다.", subtitleEn: "Leaning on someone isn't owing them.", subtitleKo: "기대는 게 빚이 되지 않는다." },
  { id: 11, dimension: "avoidance", reverse: false, en: "I don't feel comfortable opening up to close others.", ko: "가까운 사람에게 마음을 여는 것이 편하지 않다.", subtitleEn: "Sharing the inside takes more effort than it gives back.", subtitleKo: "속을 보이는 게 얻는 것보다 더 힘들다." },
  { id: 12, dimension: "avoidance", reverse: false, en: "I prefer not to show close others how I feel deep down.", ko: "마음 깊은 곳의 감정을 가까운 사람에게도 잘 보이지 않는다.", subtitleEn: "Deep feelings stay yours, even with the closest.", subtitleKo: "가장 가까운 사람에게도 깊은 감정은 내 안에 둔다." },
] as const;

export type EcrResponses = Partial<Record<number, number>>;

export interface AttachmentResult {
  anxiety: number;
  avoidance: number;
  /** Style classification using midpoint 4 as the split. */
  style: AttachmentStyle | null;
  answered: number;
  complete: boolean;
}

function reverseScore(value: number): number {
  return 8 - value;
}

export function scoreEcr(responses: EcrResponses): AttachmentResult {
  let anxSum = 0,
    anxCount = 0,
    avoSum = 0,
    avoCount = 0,
    answered = 0;
  for (const item of ECR_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 7 || !Number.isFinite(raw)) continue;
    answered += 1;
    const value = item.reverse ? reverseScore(raw) : raw;
    if (item.dimension === "anxiety") {
      anxSum += value;
      anxCount += 1;
    } else {
      avoSum += value;
      avoCount += 1;
    }
  }
  const anxiety = anxCount > 0 ? anxSum / anxCount : 0;
  const avoidance = avoCount > 0 ? avoSum / avoCount : 0;
  const complete = answered === ECR_ITEMS.length;

  let style: AttachmentStyle | null = null;
  if (complete) {
    const highAnx = anxiety > 4;
    const highAvo = avoidance > 4;
    if (!highAnx && !highAvo) style = "secure";
    else if (highAnx && !highAvo) style = "preoccupied";
    else if (!highAnx && highAvo) style = "dismissing";
    else style = "fearful";
  }

  return { anxiety, avoidance, style, answered, complete };
}

export const STYLE_LABEL: Record<"en" | "ko", Record<AttachmentStyle, string>> = {
  en: {
    secure: "Secure",
    preoccupied: "Preoccupied",
    dismissing: "Dismissing",
    fearful: "Fearful",
  },
  ko: {
    secure: "안정형",
    preoccupied: "몰입형",
    dismissing: "거리두기형",
    fearful: "혼란형",
  },
};

export const STYLE_DESCRIPTION: Record<"en" | "ko", Record<AttachmentStyle, string>> = {
  en: {
    secure: "Comfortable with closeness AND with independence. Trusts others; trusts yourself when alone.",
    preoccupied: "Wants closeness but worries about losing it. Reassurance helps; signals of distance feel sharper than they are.",
    dismissing: "Independent and self-reliant. Closeness can feel like a constraint; opening up takes effort.",
    fearful: "Wants closeness AND fears it. The pull-push pattern shows up; trust comes back slowly.",
  },
  ko: {
    secure: "가까움과 독립 모두에 편안. 타인을 신뢰하고, 혼자 있을 때 자신을 신뢰합니다.",
    preoccupied: "가까움을 원하지만 잃을까 걱정해요. 확인이 도움이 되고, 거리의 신호가 실제보다 더 크게 느껴집니다.",
    dismissing: "독립적이고 자기 충족적. 가까움이 제약처럼 느껴질 수 있고, 마음을 여는 데 시간이 필요해요.",
    fearful: "가까움을 원하면서도 두려워합니다. 끌어당기다 밀어내는 패턴이 보이고, 신뢰는 천천히 회복돼요.",
  },
};
