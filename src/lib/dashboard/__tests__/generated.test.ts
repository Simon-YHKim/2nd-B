import { buildBoard } from "../board/build";
import { withGeneratedBoard, EMPTY_GENERATED_BOARD } from "../board/generated";
import { decodeBoardResponse } from "../generation-output";
const note = { slot: "midday" as const, line: "Read a book", basis_refs: [{ kind: "routine" as const, id: "r" }], reminder_suggestions: [] };
test("generated note opens the existing summary and leaves unrelated health data alone", () => {
  const base = buildBoard(null, new Date(), false);
  const board = withGeneratedBoard(base, { ...EMPTY_GENERATED_BOARD, note });
  expect(board.parts.find((part) => part.id === "P-02")).toMatchObject({ visible: true, basis: "ai", slot: "day", line: { text: note.line } });
  expect(board.parts.find((part) => part.id === "P-06")).toEqual(base.parts.find((part) => part.id === "P-06"));
  expect(board.shelf.items.some((item) => item.id === "P-02")).toBe(false);
});
test("server summaries remain AI interpretation, including model-labelled facts", () => {
  const board = withGeneratedBoard(buildBoard(null, new Date(), false), { ...EMPTY_GENERATED_BOARD,
    summary: { headline: "Today", facts: [{ kind: "routine", title: "Read", who: null, since: null, action: null, source_ref: { kind: "routine", id: "r" } }], links: [], suggestions: [], tail_counts: {} } });
  expect(board.summary?.bubbles.map((bubble) => bubble.basis)).toEqual(["ai", "ai"]);
});
test("triage respects the returned order and only exposes the top three", () => {
  const ids = ["d", "b", "a", "c"];
  const board = withGeneratedBoard(buildBoard(null, new Date(), false), { ...EMPTY_GENERATED_BOARD,
    triage: { order: ids, items: [...ids].reverse().map((id) => ({ id, action_line: id, why: "Due" })) } });
  const part = board.parts.find((row) => row.id === "P-04");
  expect(part?.id === "P-04" && part.items.map((item) => item.id)).toEqual(["d", "b", "a"]);
});
test("wire decoder refuses external actions, health refs and malformed IDs", () => {
  expect(decodeBoardResponse({ kind: "ready", purpose: "daily_note", value: note }).ok).toBe(true);
  expect(decodeBoardResponse({ kind: "ready", purpose: "daily_note", value: { ...note, basis_refs: [{ kind: "health", id: "r" }] } }).ok).toBe(false);
  expect(decodeBoardResponse({ kind: "ready", purpose: "inbox_triage", value: { order: ["a", "a"], items: [] } }).ok).toBe(false);
  expect(decodeBoardResponse({ kind: "ready", purpose: "day_summary", value: { headline: "x", facts: [], links: [], tail_counts: {}, suggestions: [{ text: "buy", action: "https://example.com", basis: "ai", refs: [{ kind: "routine", id: "r" }] }] } }).ok).toBe(false);
});
