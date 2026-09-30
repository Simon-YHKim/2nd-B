// 할 일 입력칸 (2026-09-30): grows with its text, Return moves on instead of
// breaking the line. The rules live in lib/capture/todo-input.ts.
import {
  TODO_INPUT_LINE_HEIGHT,
  TODO_INPUT_MAX_HEIGHT,
  TODO_INPUT_MAX_LINES,
  TODO_INPUT_MIN_HEIGHT,
  TODO_INPUT_PADDING_Y,
  clampTodoInputHeight,
  normalizeTodoItem,
  todoInputScrolls,
  todoItemsForSave,
  todoSubmitAction,
} from "../todo-input";

describe("to-do field height", () => {
  test("one line of text is the floor and five lines the ceiling, padding included", () => {
    expect(TODO_INPUT_MIN_HEIGHT).toBe(TODO_INPUT_LINE_HEIGHT + TODO_INPUT_PADDING_Y * 2);
    expect(TODO_INPUT_MAX_HEIGHT).toBe(TODO_INPUT_LINE_HEIGHT * TODO_INPUT_MAX_LINES + TODO_INPUT_PADDING_Y * 2);
  });

  test("grows with the reported content and snaps to whole pixels", () => {
    expect(clampTodoInputHeight(0)).toBe(TODO_INPUT_MIN_HEIGHT);
    expect(clampTodoInputHeight(TODO_INPUT_MIN_HEIGHT)).toBe(TODO_INPUT_MIN_HEIGHT);
    expect(clampTodoInputHeight(44.2)).toBe(45);
    expect(clampTodoInputHeight(64)).toBe(64);
  });

  test("stops at the ceiling, and only then scrolls inside", () => {
    expect(clampTodoInputHeight(10_000)).toBe(TODO_INPUT_MAX_HEIGHT);
    expect(todoInputScrolls(TODO_INPUT_MAX_HEIGHT)).toBe(true);
    expect(todoInputScrolls(TODO_INPUT_MAX_HEIGHT - 1)).toBe(false);
  });

  test("a missing or broken measurement falls back to one line", () => {
    for (const bad of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampTodoInputHeight(bad as number | null | undefined)).toBe(TODO_INPUT_MIN_HEIGHT);
    }
  });
});

describe("to-do text as saved", () => {
  const U2028 = String.fromCharCode(0x2028);

  test("line breaks fold to a single space so one to-do stays one list line", () => {
    expect(normalizeTodoItem("  buy milk \n and eggs  ")).toBe("buy milk and eggs");
    expect(normalizeTodoItem("a\r\n\r\nb")).toBe("a b");
    expect(normalizeTodoItem(`a${U2028}b`)).toBe("a b");
    expect(normalizeTodoItem("keeps  inner  spacing")).toBe("keeps  inner  spacing");
  });

  test("blank to-dos are dropped and the order is kept", () => {
    expect(todoItemsForSave(["first", "  ", "", "second\nline"])).toEqual(["first", "second line"]);
  });
});

describe("Return in a to-do", () => {
  test("moves to the next field when there is one", () => {
    expect(todoSubmitAction(0, ["a", ""])).toEqual({ kind: "focus", index: 1 });
    expect(todoSubmitAction(0, ["", ""])).toEqual({ kind: "focus", index: 1 });
  });

  test("adds a field after the last one only when it has text", () => {
    expect(todoSubmitAction(1, ["a", "b"])).toEqual({ kind: "append", index: 2 });
    expect(todoSubmitAction(1, ["a", "   "])).toEqual({ kind: "none" });
  });

  test("an index outside the list does nothing", () => {
    expect(todoSubmitAction(-1, ["a"])).toEqual({ kind: "none" });
    expect(todoSubmitAction(3, ["a"])).toEqual({ kind: "none" });
  });
});
