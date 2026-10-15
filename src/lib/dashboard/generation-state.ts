import type { BoardAction, BoardText } from "./board/contract";

export type GenerationState = "loading" | "ready" | "empty" | "denied" | "busy" | "waiting" | "limited" | "disabled" | "unavailable";
export type GenerationStates = Record<"note" | "triage" | "summary", GenerationState>;

/** Fixed product copy only. Neither server errors nor model text are status messages. */
export function generationNotice(state: GenerationState, kind: "note" | "triage" | "summary"): { note: BoardText; action?: BoardAction } {
  const key = state === "busy" ? "loading" : state === "ready" ? "empty" : state;
  const note = { key: `phone.board.generation.${key === "empty" ? `${kind}Empty` : key}` };
  if (key === "denied") return { note, action: { label: { key: "phone.board.generation.settings" }, route: "/privacy" } };
  if (key === "empty" && kind === "summary") return { note, action: { label: { key: "phone.assistantSettings" }, route: "/ops" } };
  if (key === "unavailable") return { note, action: { label: { key: "phone.retry" }, route: "/board/retry" } };
  return { note };
}
