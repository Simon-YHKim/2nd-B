/** Evidence of an actual chip selection, scoped to one question and candidate. */
export interface OpenerSelection {
  questionIndex: number;
  questionText: string;
  openerIndex: number;
  text: string;
}

/** Also validates persisted selections. Never reconstruct provenance from text. */
export function isUneditedOpener(
  value: unknown,
  draft: string,
  turns: readonly { role: string; text: string }[],
  openers?: readonly string[],
): value is OpenerSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selection = value as Record<string, unknown>;
  const question = turns.at(-1);
  return Object.keys(selection).every(key => ["questionIndex", "questionText", "openerIndex", "text"].includes(key))
    && Number.isSafeInteger(selection.questionIndex) && selection.questionIndex === turns.length - 1
    && question?.role === "interviewer" && selection.questionText === question.text
    && Number.isSafeInteger(selection.openerIndex) && (selection.openerIndex as number) >= 0
    && typeof selection.text === "string" && selection.text.length > 0 && selection.text === draft
    && (openers === undefined || openers[selection.openerIndex as number] === selection.text);
}
