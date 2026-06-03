// Life-audit interview content. Blueprint §4 calls for ~20 questions per
// life period. v2 expands to 15 questions for "current" + 5 each for
// "teens" and "20s" - covering Big Five, SDT, VIA, and Attachment.
// Free-form deeper probing lives in /interview (the twenty-questions
// LLM mode); this file is the fixed framework-anchored screener.

export type AuditPeriod = "current" | "20s" | "teens";

export type Framework =
  | "big_five:openness"
  | "big_five:conscientiousness"
  | "big_five:extraversion"
  | "big_five:agreeableness"
  | "big_five:neuroticism"
  | "sdt:autonomy"
  | "sdt:competence"
  | "sdt:relatedness"
  | "via:character_strength"
  | "attachment:secure"
  | "attachment:anxiety"
  | "attachment:avoidance";

export interface AuditQuestion {
  id: string;
  period: AuditPeriod;
  framework: Framework;
  prompt: { en: string; ko: string };
}

export const AUDIT_QUESTIONS: AuditQuestion[] = [
  // ─── CURRENT - Big Five + SDT + VIA + Attachment, 15 items ───
  {
    id: "current_01",
    period: "current",
    framework: "sdt:autonomy",
    prompt: {
      en: "What's one decision you made recently that felt completely yours, with nobody else's voice in your head?",
      ko: "최근에 다른 사람의 시선 없이 온전히 당신만의 결정이라고 느낀 선택은 무엇인가요?",
    },
  },
  {
    id: "current_02",
    period: "current",
    framework: "big_five:openness",
    prompt: {
      en: "When was the last time you changed your mind about something important? What shifted it?",
      ko: "최근 중요한 무언가에 대해 마음이 바뀐 적이 있나요? 무엇이 바꿔놓았나요?",
    },
  },
  {
    id: "current_03",
    period: "current",
    framework: "sdt:relatedness",
    prompt: {
      en: "Who is one person you feel fully understood by right now? What do they see in you?",
      ko: "지금 당신을 온전히 이해해 준다고 느끼는 사람은 누구인가요? 그 사람이 당신에게서 무엇을 보고 있나요?",
    },
  },
  {
    id: "current_04",
    period: "current",
    framework: "big_five:conscientiousness",
    prompt: {
      en: "Describe one habit you've kept for at least 6 months. What keeps it going on the days you don't feel like it?",
      ko: "6개월 이상 유지하고 있는 습관 하나를 떠올려 보세요. 하기 싫은 날에도 계속하게 만드는 건 무엇인가요?",
    },
  },
  {
    id: "current_05",
    period: "current",
    framework: "via:character_strength",
    prompt: {
      en: "If a close friend had to name your strongest quality, what would they say - and would you agree?",
      ko: "가까운 친구가 당신의 가장 강한 면을 한 단어로 꼽는다면 무엇이라 말할까요? 당신은 동의하시나요?",
    },
  },
  {
    id: "current_06",
    period: "current",
    framework: "big_five:extraversion",
    prompt: {
      en: "After a draining week, what actually refills you - being with others, being alone, or moving your body?",
      ko: "고된 한 주 끝에 진짜로 당신을 채워주는 건 무엇인가요 - 사람 곁, 혼자 있는 시간, 몸을 움직이는 것?",
    },
  },
  {
    id: "current_07",
    period: "current",
    framework: "big_five:neuroticism",
    prompt: {
      en: "What's a worry that visits you most weeks? When did you first notice it?",
      ko: "거의 매주 찾아오는 걱정이 있나요? 그 걱정을 처음 의식한 건 언제였나요?",
    },
  },
  {
    id: "current_08",
    period: "current",
    framework: "big_five:agreeableness",
    prompt: {
      en: "When was the last time you said yes when you wanted to say no? What was at stake?",
      ko: "거절하고 싶었지만 승낙한 가장 최근 순간은 언제였나요? 무엇이 걸려 있었나요?",
    },
  },
  {
    id: "current_09",
    period: "current",
    framework: "sdt:competence",
    prompt: {
      en: "Name something you're noticeably better at than a year ago. How did you get there?",
      ko: "1년 전보다 눈에 띄게 잘하게 된 것 한 가지를 떠올려 보세요. 어떻게 그렇게 됐나요?",
    },
  },
  {
    id: "current_10",
    period: "current",
    framework: "attachment:anxiety",
    prompt: {
      en: "When a close person goes quiet for a while, what's the first story your mind tells you?",
      ko: "가까운 사람이 한동안 조용해지면 머릿속에 가장 먼저 떠오르는 이야기는 무엇인가요?",
    },
  },
  {
    id: "current_11",
    period: "current",
    framework: "attachment:avoidance",
    prompt: {
      en: "Is there something you've never told anyone close - not because it's shameful, but because telling feels exposing?",
      ko: "수치스러워서가 아니라 그저 말로 꺼내는 것 자체가 노출처럼 느껴져서, 가까운 누구에게도 말한 적 없는 무언가가 있나요?",
    },
  },
  {
    id: "current_12",
    period: "current",
    framework: "attachment:secure",
    prompt: {
      en: "Who can you call at 2am, and who can call you at 2am? What makes that bond possible?",
      ko: "새벽 2시에 전화할 수 있는 사람이 누구이고, 당신에게 그렇게 전화할 수 있는 사람은 누구인가요? 그 관계를 가능하게 만드는 건 무엇인가요?",
    },
  },
  {
    id: "current_13",
    period: "current",
    framework: "via:character_strength",
    prompt: {
      en: "What does 'being a good person' mean to you in practice - not in theory?",
      ko: "당신에게 '좋은 사람으로 산다'는 건 이론이 아니라 일상에서 무엇을 의미하나요?",
    },
  },
  {
    id: "current_14",
    period: "current",
    framework: "sdt:autonomy",
    prompt: {
      en: "If money and other people's opinions weren't factors for one year, what would you do differently next month?",
      ko: "돈과 타인의 시선이 1년 동안 변수가 아니라면, 다음 달부터 무엇을 다르게 하시겠어요?",
    },
  },
  {
    id: "current_15",
    period: "current",
    framework: "big_five:openness",
    prompt: {
      en: "When you imagine yourself five years older, what's the one thing you hope is still true about you?",
      ko: "5년 뒤의 자신을 떠올릴 때, 그때도 변하지 않았으면 하는 한 가지는 무엇인가요?",
    },
  },

  // ─── TEENS - 5 items ───
  {
    id: "teens_01",
    period: "teens",
    framework: "attachment:secure",
    prompt: {
      en: "Who in your teens really saw you - not the role you played, but you?",
      ko: "10대 시절, 당신이 연기하던 역할이 아니라 진짜 당신을 봐준 사람은 누구였나요?",
    },
  },
  {
    id: "teens_02",
    period: "teens",
    framework: "big_five:neuroticism",
    prompt: {
      en: "What were you most afraid of in your teens that you can talk about now?",
      ko: "10대 시절 가장 두려워했지만 이제는 말로 꺼낼 수 있는 무언가가 있다면?",
    },
  },
  {
    id: "teens_03",
    period: "teens",
    framework: "sdt:autonomy",
    prompt: {
      en: "When did teen-you first push back against something the adults expected? What did that feel like?",
      ko: "10대의 당신이 어른들의 기대를 처음으로 거슬렀던 순간은 언제였나요? 그 감정은 어땠나요?",
    },
  },
  {
    id: "teens_04",
    period: "teens",
    framework: "via:character_strength",
    prompt: {
      en: "What's something you were quietly good at as a teen that no one praised?",
      ko: "10대 때 조용히 잘했지만 아무도 칭찬해주지 않았던 무언가가 있나요?",
    },
  },
  {
    id: "teens_05",
    period: "teens",
    framework: "big_five:openness",
    prompt: {
      en: "Which song, book, or film hit you hardest in your teens - and why do you think it landed then?",
      ko: "10대 때 가장 깊이 박힌 노래·책·영화는 무엇이었고, 왜 그때 닿았다고 생각하나요?",
    },
  },

  // ─── 20s - 5 items ───
  {
    id: "20s_01",
    period: "20s",
    framework: "sdt:competence",
    prompt: {
      en: "What did you try in your 20s that you failed at - and what did failing teach you?",
      ko: "20대에 도전했다가 실패한 일은 무엇이었고, 그 실패는 무엇을 가르쳤나요?",
    },
  },
  {
    id: "20s_02",
    period: "20s",
    framework: "attachment:anxiety",
    prompt: {
      en: "What relationship in your 20s shaped how you trust (or don't trust) people now?",
      ko: "20대의 어떤 관계가 지금 당신이 사람을 믿는(혹은 못 믿는) 방식을 만들었나요?",
    },
  },
  {
    id: "20s_03",
    period: "20s",
    framework: "big_five:conscientiousness",
    prompt: {
      en: "What was a defining choice in your 20s that closed some doors and opened others?",
      ko: "20대의 결정 중에서, 어떤 문을 닫고 어떤 문을 열어준 분기점은 무엇이었나요?",
    },
  },
  {
    id: "20s_04",
    period: "20s",
    framework: "via:character_strength",
    prompt: {
      en: "Who were you trying to become in your 20s? How does that compare to who you actually became?",
      ko: "20대의 당신은 어떤 사람이 되려고 했나요? 실제로 된 자신과 비교해 보면?",
    },
  },
  {
    id: "20s_05",
    period: "20s",
    framework: "big_five:openness",
    prompt: {
      en: "What did 20s-you believe with certainty that you've since let go of?",
      ko: "20대의 당신이 확신했지만 이제는 놓아준 신념이 있다면 무엇인가요?",
    },
  },
];

export function questionsForPeriod(period: AuditPeriod): AuditQuestion[] {
  return AUDIT_QUESTIONS.filter((q) => q.period === period);
}
