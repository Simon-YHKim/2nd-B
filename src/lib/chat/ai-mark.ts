// How the chat says its answers are AI-made.
//
// Simon 2026-10-13 15:49 (Relay 1:1): the mark by every answer's name is gone. One line under
// the input says it all the time, a card says it once when the chat is first opened
// (chat/ai-first-notice.ts), and a model answer that leaves the app by copy carries a last line
// that says so. The same for every age.
// The day before (Q-261012-64, #2316) each answer carried a mark by its name and the first one
// spelled 「이 답은 AI가 만들었어요.」 out. ChatGPT and Claude say it once under the input instead.
//
// Only model answers are AI-made. A line the app wrote itself (limit hint, error) and the fixed
// safety reply (red zone: no model is called) are not, so a copy of those gets no last line.

export interface AiMarkTurn {
  role: "user" | "secondb";
  synthetic?: boolean;
  safetyZone?: "green" | "yellow" | "red";
}

export function isModelAnswer(turn: AiMarkTurn | undefined): boolean {
  return turn !== undefined && turn.role === "secondb" && turn.synthetic !== true && turn.safetyZone !== "red";
}

/** The copied text of a model answer ends with one line that says it is AI-made. */
export function withAiCopyTail(text: string, tail: string): string {
  return `${text.trimEnd()}\n\n${tail}`;
}
