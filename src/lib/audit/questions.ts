// Life-audit interview content. Blueprint §4 calls for ~20 questions per
// life period. v1 ships with a 5-question MVP for the "current" period to
// validate the flow end-to-end; the full bank lands in Sprint 2.5.
//
// Each question is mapped to a Big Five / SDT / VIA dimension so the
// Inference Engine can build a coarse persona without running a full LLM
// extraction pass. Mapping comes from the blueprint's "validated frameworks"
// list (§9).

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
  | "via:character_strength";

export interface AuditQuestion {
  id: string;
  period: AuditPeriod;
  framework: Framework;
  prompt: { en: string; ko: string };
}

export const AUDIT_QUESTIONS: AuditQuestion[] = [
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
      en: "If a close friend had to name your strongest quality, what would they say — and would you agree?",
      ko: "가까운 친구가 당신의 가장 강한 면을 한 단어로 꼽는다면 무엇이라 말할까요? 당신은 동의하시나요?",
    },
  },
];

export function questionsForPeriod(period: AuditPeriod): AuditQuestion[] {
  return AUDIT_QUESTIONS.filter((q) => q.period === period);
}
