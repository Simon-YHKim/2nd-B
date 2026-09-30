// 할 일 입력칸 (Simon 2026-09-30: "글자가 텍스트 박스를 초과하면 아래로 행이
// 늘어났으면 좋겠어. 아래에 있는 버튼 및 텍스트 박스와 충돌 없이.")
//
// Each to-do is a multiline field that grows with its text, so the rows below
// it and the "할 일 추가" button move down instead of being overlapped. Past
// TODO_INPUT_MAX_HEIGHT it stops growing and scrolls inside.
//
// Return/Enter does NOT insert a line break. A to-do is one item, and the save
// writes one "- item" line per to-do, so a break inside an item would split it
// into a stray line. Enter moves to the next to-do instead (and adds one when
// the current, last field has text). Pure so the rules are tested without a
// render (render tests are blocked on RN 0.85).

/** One line of the to-do font (lineHeight in the capture styles). */
export const TODO_INPUT_LINE_HEIGHT = 20;
/** Top and bottom padding inside the field: keeps pixel-font descenders off the edge on Android. */
export const TODO_INPUT_PADDING_Y = 2;
/** Lines a to-do may grow to before it scrolls inside instead of pushing the page further. */
export const TODO_INPUT_MAX_LINES = 5;
/** Platforms report content height with the padding included, so the bounds include it too. */
export const TODO_INPUT_MIN_HEIGHT = TODO_INPUT_LINE_HEIGHT + TODO_INPUT_PADDING_Y * 2;
export const TODO_INPUT_MAX_HEIGHT = TODO_INPUT_LINE_HEIGHT * TODO_INPUT_MAX_LINES + TODO_INPUT_PADDING_Y * 2;

/** Content height reported by the platform -> the field height to render (integer, clamped). */
export function clampTodoInputHeight(contentHeight: number | null | undefined): number {
  if (typeof contentHeight !== "number" || !Number.isFinite(contentHeight)) return TODO_INPUT_MIN_HEIGHT;
  const rounded = Math.ceil(contentHeight);
  return Math.min(TODO_INPUT_MAX_HEIGHT, Math.max(TODO_INPUT_MIN_HEIGHT, rounded));
}

/** The field scrolls inside only once it has reached its cap. */
export function todoInputScrolls(height: number): boolean {
  return height >= TODO_INPUT_MAX_HEIGHT;
}

const UNICODE_LINE_BREAKS = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)];
const LF = String.fromCharCode(10);

/** A to-do as it is saved: line breaks (Shift+Enter on web, paste) fold to spaces. */
export function normalizeTodoItem(value: string): string {
  let out = value;
  // U+2028 / U+2029 are built from char codes: written literally they end the line.
  for (const lineBreak of UNICODE_LINE_BREAKS) out = out.split(lineBreak).join(LF);
  return out.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** The non-empty to-dos, in order, each on one line. */
export function todoItemsForSave(todos: readonly string[]): string[] {
  return todos.map(normalizeTodoItem).filter((value) => value.length > 0);
}

export type TodoSubmitAction =
  | { kind: "focus"; index: number }
  | { kind: "append"; index: number }
  | { kind: "none" };

/**
 * What Return/Enter does in to-do field `index`: go to the next field, or add
 * one when this is the last field and it has text. An empty last field does
 * nothing, so holding Enter cannot pile up blank rows.
 */
export function todoSubmitAction(index: number, todos: readonly string[]): TodoSubmitAction {
  if (index < 0 || index >= todos.length) return { kind: "none" };
  if (index < todos.length - 1) return { kind: "focus", index: index + 1 };
  if (normalizeTodoItem(todos[index] ?? "").length === 0) return { kind: "none" };
  return { kind: "append", index: index + 1 };
}
