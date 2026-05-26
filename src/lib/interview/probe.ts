// "Twenty Questions" interview helper. Drives a stepwise, locale-aware,
// age-period-anchored interview that gradually goes deeper without
// pressing past the user's comfort.
//
// Architecture:
//   - The screen owns the message list.
//   - Each user answer triggers nextProbe(period, history) which asks
//     Gemini for ONE next question grounded in the running history.
//   - First question is a seed (no LLM call needed) so the interview
//     can start instantly even when mock-LLM is the backend.
//
// The probe is intentionally short on summarization or interpretation —
// the goal is to elicit, not to advise. Interpretation lives in
// /persona which reads the saved transcript later.

import { callGemini } from "../llm/gemini";

export type LifePeriod = "childhood" | "teens" | "twenties" | "thirties" | "current";

export interface InterviewTurn {
  role: "interviewer" | "user";
  text: string;
}

export const PERIOD_LABEL: Record<"en" | "ko", Record<LifePeriod, string>> = {
  en: {
    childhood: "Childhood (under 12)",
    teens: "Teens (12–19)",
    twenties: "Twenties (20–29)",
    thirties: "Thirties (30–39)",
    current: "Right now",
  },
  ko: {
    childhood: "어린 시절 (12세 이전)",
    teens: "10대 (12–19세)",
    twenties: "20대 (20–29세)",
    thirties: "30대 (30–39세)",
    current: "지금 이 시기",
  },
};

const SEED_QUESTION: Record<"en" | "ko", Record<LifePeriod, string>> = {
  en: {
    childhood: "Picture yourself at 8 or 9. What's the first scene that comes up?",
    teens: "Of your high-school years, what's the moment you still come back to in your head?",
    twenties: "What's something from your twenties that you almost never tell anyone?",
    thirties: "What did you think 'being thirty' would feel like vs. how it actually went?",
    current: "What's the thing you'd say first if I asked, 'what's really going on for you right now?'",
  },
  ko: {
    childhood: "여덟, 아홉 살 무렵의 자신을 떠올려 보세요. 가장 먼저 떠오르는 장면이 뭔가요?",
    teens: "고등학생 시절 중에서, 머릿속에 여전히 자주 돌아오는 한 장면은?",
    twenties: "20대에 거의 누구에게도 말하지 않은 무언가가 있다면 무엇인가요?",
    thirties: "30대가 어떨 거라고 생각했던 것과, 실제로 어땠는지를 비교해 보면?",
    current: "'지금 진짜로 어떻게 지내?' 라고 물으면 가장 먼저 떠오르는 한마디는?",
  },
};

export function seedQuestion(period: LifePeriod, locale: "en" | "ko"): string {
  return SEED_QUESTION[locale][period];
}

function buildSystemPrompt(period: LifePeriod, locale: "en" | "ko"): string {
  const periodLabel = PERIOD_LABEL[locale][period];
  if (locale === "ko") {
    return [
      "당신은 노련한 인터뷰어입니다. 사용자가 자신의 속마음을 단계적으로 더 깊이 드러낼 수 있도록 돕습니다.",
      `이번 인터뷰의 시기 초점: ${periodLabel}.`,
      "규칙:",
      "1) 한 번에 한 가지 질문만 합니다. 짧고, 구체적이고, 부드럽게.",
      "2) 사용자의 마지막 답에 직접 이어붙입니다 — 답의 어느 부분을 더 듣고 싶은지 명확히 합니다.",
      "3) 진단·조언·해석은 절대 하지 않습니다. 그저 더 듣는 다음 질문만.",
      "4) 사용자가 '그만' 같은 신호를 보내면, '여기서 멈춰도 좋아요'로 마무리합니다.",
      "5) 위기 신호(자해·자살·학대)가 보이면 즉시 한국 1393 안내로 전환합니다.",
      "출력: 다음 질문 한 줄만. 다른 텍스트는 출력하지 않습니다.",
    ].join("\n");
  }
  return [
    "You are a skilled interviewer. Help the user reveal their inner experience one careful step deeper.",
    `Period in focus: ${periodLabel}.`,
    "Rules:",
    "1) ONE question at a time. Short, specific, gentle.",
    "2) Anchor directly on the user's last answer — make clear which part you want to hear more about.",
    "3) NEVER diagnose, advise, or interpret. Just the next question that elicits more.",
    "4) If the user signals 'stop' or 'enough', close warmly: 'It's okay to pause here.'",
    "5) If you detect crisis signals (self-harm, suicide, abuse), pivot immediately to US 988 hotline guidance.",
    "Output: the next question on a single line. No other text.",
  ].join("\n");
}

function buildUserPrompt(history: InterviewTurn[]): string {
  return history.map((t) => (t.role === "interviewer" ? `Q: ${t.text}` : `A: ${t.text}`)).join("\n");
}

export interface ProbeResult {
  question: string;
  zone: "green" | "yellow" | "red";
}

export async function nextProbe(
  userId: string,
  locale: "en" | "ko",
  period: LifePeriod,
  history: InterviewTurn[],
): Promise<ProbeResult> {
  const res = await callGemini({
    userId,
    locale,
    purpose: "interview_probe",
    system: buildSystemPrompt(period, locale),
    user: buildUserPrompt(history),
  });
  const cleaned = res.text.trim().split("\n")[0]?.trim() ?? "";
  return {
    question: cleaned.length > 0
      ? cleaned
      : (locale === "ko" ? "조금 더 말해 줄 수 있을까요?" : "Can you say a little more about that?"),
    zone: res.safety.zone,
  };
}
