// Rotating reflection prompts for the journal composer. Deterministic
// per-day so the prompt stays stable through the day (no "it changed
// while I was writing" surprise) but rotates across days for variety.
//
// Prompts are grounded in the validated frameworks the app cites
// (Big Five, SDT, Attachment, Erikson, VIA) - written as plain,
// non-clinical, growth-oriented invitations.

const PROMPTS_EN: string[] = [
  "What single moment from today are you still thinking about - and why?",
  "Name one feeling that came up today in one word. What triggered it?",
  "Where did you feel most yourself today?",
  "What did you notice yourself avoiding - even briefly?",
  "Who did you lean on, or wish you could?",
  "What's one thing you assumed about someone today that may not be true?",
  "If today were a chapter in your life, what would the title be?",
  "What did you learn about yourself - not about the world?",
  "What needed your attention but didn't get it?",
  "What pattern showed up today that you've seen before?",
  "What did you say no to (out loud or silently)?",
  "What would the most generous version of you have done differently?",
  "What did you make space for today that felt important?",
  "Where did you choose comfort over growth, or growth over comfort?",
  "What's one small thing you're grateful happened today?",
];

const PROMPTS_KO: string[] = [
  "오늘 자꾸 생각나는 한 장면은 무엇인가요? 왜 그럴까요?",
  "오늘 떠오른 감정 하나를 한 단어로 이름 붙여 보세요. 무엇이 그 감정을 불러왔나요?",
  "오늘 가장 '나답다' 느꼈던 순간은 언제였나요?",
  "잠깐이라도 피하고 싶었던 무언가가 있었나요?",
  "누구에게 기댔거나, 기대고 싶었나요?",
  "오늘 누군가에 대해 당연하게 생각했지만 사실이 아닐 수 있는 것이 있다면?",
  "오늘이 당신 인생의 한 챕터라면, 제목은 무엇일까요?",
  "오늘 자신에 대해 새로 알게 된 것은 무엇인가요? (세상이 아니라 자신에 대해)",
  "관심이 필요했지만 받지 못한 것은 무엇인가요?",
  "오늘 본 패턴 중 예전에도 본 것이 있다면?",
  "오늘 (소리 내어 혹은 마음속으로) 거절한 것은 무엇인가요?",
  "가장 너그러운 모습의 당신이라면 오늘 무엇을 다르게 했을까요?",
  "오늘 의미 있게 자리를 내준 것은 무엇이었나요?",
  "성장보다 편안함을 택한 순간, 혹은 그 반대의 순간이 있었나요?",
  "오늘 일어난 일 중 작게나마 감사할 만한 것은?",
];

function daysSinceEpoch(date: Date = new Date()): number {
  return Math.floor(date.getTime() / 86_400_000);
}

export function dailyPrompt(locale: "en" | "ko", date: Date = new Date()): string {
  const list = locale === "ko" ? PROMPTS_KO : PROMPTS_EN;
  const idx = daysSinceEpoch(date) % list.length;
  return list[idx];
}

/** Test hook for picking a specific prompt index. */
export function promptAt(locale: "en" | "ko", index: number): string {
  const list = locale === "ko" ? PROMPTS_KO : PROMPTS_EN;
  return list[((index % list.length) + list.length) % list.length];
}

export const PROMPT_COUNT = PROMPTS_EN.length;
