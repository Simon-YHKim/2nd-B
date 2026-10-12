// Which chat turns say they are AI-made, and how.
//
// Simon 2026-10-12. Placement: by every answer's name (Q-261012-64, pick 가).
// Wording: 「이 답은 AI가 만들었어요.」 (his answer to Q-261012-30, relayed 23:17).
// The two meet like an abbreviation: the first answer of a conversation spells
// the sentence out next to its mark, later answers carry the mark alone, and
// the sentence is every mark's spoken name.
//
// Only model answers are marked. A line the app wrote itself (limit hint, error)
// and the fixed safety reply (red zone: no model is called) are not AI-made, so
// saying they are would be untrue.

export interface AiMarkTurn {
  role: "user" | "secondb";
  synthetic?: boolean;
  safetyZone?: "green" | "yellow" | "red";
}

export type AiMark = "none" | "mark" | "spelled";

function modelMade(turn: AiMarkTurn | undefined): boolean {
  return turn !== undefined && turn.role === "secondb" && turn.synthetic !== true && turn.safetyZone !== "red";
}

export function aiMarkFor(turns: readonly AiMarkTurn[], index: number): AiMark {
  if (!modelMade(turns[index])) return "none";
  return turns.findIndex(modelMade) === index ? "spelled" : "mark";
}
