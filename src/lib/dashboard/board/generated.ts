import type { DailyNote, DaySummary, InboxTriage } from "../contract";
import type { BoardContract, BoardPart, SummaryBubble } from "./contract";
import { generationNotice, type GenerationStates } from "../generation-state";

export interface GeneratedBoard { note: DailyNote | null; summary: DaySummary | null; triage: InboxTriage | null; states?: GenerationStates }
export const EMPTY_GENERATED_BOARD: GeneratedBoard = { note: null, summary: null, triage: null };

/** Generated prose always keeps the AI tone, including a model's 'facts' label.
 * Suggestions navigate to the existing editor. No writer or external URL here. */
export function withGeneratedBoard(board: BoardContract, generated: GeneratedBoard): BoardContract {
  const { note, summary, triage } = generated;
  const slot = note?.slot === "midday" ? "day" : note?.slot ?? "morning";
  const parts = board.parts.map((part): BoardPart => {
    if (part.id === "P-02" && note) return { ...part, visible: true, state: "data" as const, basis: "ai" as const,
      slot, line: { text: note.line }, evidenceRoute: "/reminders", note: undefined, action: undefined };
    if (part.id === "P-02" && generated.states) return { ...part, visible: true, state: "empty", basis: "rule",
      ...generationNotice(generated.states.note, "note") };
    if (part.id === "P-03" && note) return { ...part, suggestions: note.reminder_suggestions.map((item, i) => ({
      id: `generated-${i}`, line: { text: item.title + " · " + item.why }, basis: "ai" as const, evidenceRoute: "/reminders",
    })) };
    if (part.id === "P-04" && triage?.items.length) return { ...part, visible: true, state: "data" as const, basis: "ai" as const,
      note: undefined, action: undefined, items: triage.order.slice(0, 3).flatMap((id) => {
        const item = triage.items.find((row) => row.id === id);
        return item ? [{ id, source: "app" as const, line: { text: item.action_line }, basis: "ai" as const, evidenceRoute: "/reminders" }] : [];
      }) };
    if (part.id === "P-04" && generated.states) return { ...part, visible: true, state: "empty", basis: "rule",
      ...generationNotice(generated.states.triage, "triage") };
    return part;
  });
  const bubbles: SummaryBubble[] = summary ? [
    { id: "head", kind: "head", line: { text: summary.headline }, basis: "ai", evidenceRoute: null },
    ...summary.facts.map((fact, i): SummaryBubble => ({ id: `fact-${i}`, kind: "fact", line: { text: fact.title }, basis: "ai", evidenceRoute: fact.action ?? "/ops" })),
    ...summary.links.map((link, i): SummaryBubble => ({ id: `link-${i}`, kind: "link", line: { text: link.text }, basis: "ai", evidenceRoute: "/ops" })),
    ...summary.suggestions.map((suggestion, i): SummaryBubble => ({ id: `suggestion-${i}`, kind: "suggestion", line: { text: suggestion.text }, basis: "ai", evidenceRoute: suggestion.action })),
  ] : [];
  return { ...board, parts, summary: summary ? { slot, bubbles } : generated.states
    ? { slot, bubbles: [], ...generationNotice(generated.states.summary, "summary") } : board.summary,
    shelf: { ...board.shelf, items: board.shelf.items.filter((item) => !parts.some((part) => part.id === item.id && part.visible)) } };
}
