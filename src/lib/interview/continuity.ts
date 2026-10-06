import type { DrillLayer, InterviewTurn } from "./probe";
import { canCreditAnswer } from "./answer-gate";

// `answerDisposition` · `canCreditAnswer` 는 `answer-gate.ts` 로 옮겼다(2026-10-07, 0220).
// 인터뷰 판정 원장이 같은 문턱을 서버(openai-proxy)에서 다시 계산하므로 import 없는
// 파일 하나에 모았다. 예전 이름 그대로 다시 내보낸다 -- 부르는 쪽은 바뀌지 않는다.
export { answerDisposition, canCreditAnswer, type AnswerDisposition } from "./answer-gate";

/** Only an explicit topic change starts another scene. Old turns remain in the saved
 * transcript, but are excluded from future prompts after the user skips them. */
export function currentScene(history: readonly InterviewTurn[]): InterviewTurn[] {
  let start = 0;
  for (let i = 0; i < history.length; i++) if (history[i]?.sceneStart) start = i;
  return history.slice(start);
}

export function confirmedAnswer(
  text: string, askedLayer: DrillLayer, locale: "en" | "ko", judgedLayer: DrillLayer | null | undefined,
): boolean {
  return canCreditAnswer(text, askedLayer, locale) && judgedLayer === askedLayer;
}
