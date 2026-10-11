import { z } from "zod";
import { containsAnalysisForbidden, containsForbiddenLexicon } from "../safety/classifier";
import {
  dailyNoteProblems, daySummaryProblems, inboxTriageProblems, DAILY_NOTE_MAX_SUGGESTIONS,
  DAY_SUMMARY_LIMITS, INBOX_TRIAGE_LIMITS,
  type BoardRef, type DailyNote, type DaySummary, type InboxTriage, type Slot,
} from "./contract";
import type { PreparedBoardInput } from "./generation-input";

export type ValidatedBoardOutput =
  | { readonly ok: true; readonly seat: "daily_note"; readonly value: DailyNote }
  | { readonly ok: true; readonly seat: "day_summary"; readonly value: DaySummary }
  | { readonly ok: true; readonly seat: "inbox_triage"; readonly value: InboxTriage }
  | { readonly ok: false; readonly reason: "invalid_output" };

// All generated display text shares this gate, including nullable/nested fields.
// Use the canonical matcher in both languages regardless of the UI locale.
const text = z.string().trim().min(1).max(2_000).refine((value) =>
  containsForbiddenLexicon(value, "en").length === 0 &&
  containsForbiddenLexicon(value, "ko").length === 0 &&
  containsAnalysisForbidden(value, "en").length === 0 &&
  containsAnalysisForbidden(value, "ko").length === 0);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const ref = z.object({
  kind: z.enum(["record", "reminder", "routine", "event", "weather", "inbox"]), id,
}).strict();
const refs = z.array(ref).min(1).max(128);
// These are existing internal destinations only, never model-selected external URLs.
const action = z.enum(["/reminders", "/capture", "/ops"]).nullable();
const noteSchema = z.object({
  slot: z.enum(["morning", "midday", "evening"]),
  line: text, basis_refs: refs,
  reminder_suggestions: z.array(z.object({
    title: text, when: z.string().datetime({ offset: true }), why: text, source_ref: ref,
  }).strict()).max(DAILY_NOTE_MAX_SUGGESTIONS),
}).strict();
const summarySchema = z.object({
  headline: text,
  facts: z.array(z.object({
    kind: text, title: text, who: text.nullable(), since: text.nullable(), action, source_ref: ref,
  }).strict()).max(DAY_SUMMARY_LIMITS.facts),
  links: z.array(z.object({ text, refs }).strict()).max(DAY_SUMMARY_LIMITS.links),
  suggestions: z.array(z.object({
    text, action, basis: z.literal("ai"), refs,
  }).strict()).max(DAY_SUMMARY_LIMITS.suggestions),
  // Totals belong to the deterministic reader, not to generated text. The
  // renderer can attach reader counts after validating the generated portion.
  tail_counts: z.object({}).strict(),
}).strict();
const inboxSchema = z.object({
  order: z.array(id).max(INBOX_TRIAGE_LIMITS.candidates),
  items: z.array(z.object({ id, action_line: text, why: text }).strict()).max(INBOX_TRIAGE_LIMITS.candidates),
}).strict();
const invalid: ValidatedBoardOutput = { ok: false, reason: "invalid_output" };

/** Decode the authenticated server response on the app. Evidence ownership has
 * already been checked by the server; this still rejects malformed cache/wire data. */
export function decodeBoardResponse(value: unknown): ValidatedBoardOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid;
  const row = value as Record<string, unknown>;
  if (row.kind !== "ready") return invalid;
  let refs: BoardRef[] = []; let candidateIds: string[] = []; let slot: Slot | undefined;
  if (row.purpose === "daily_note") {
    const parsed = noteSchema.safeParse(row.value); if (!parsed.success) return invalid;
    refs = [...parsed.data.basis_refs, ...parsed.data.reminder_suggestions.map((s) => s.source_ref)]; slot = parsed.data.slot;
  } else if (row.purpose === "day_summary") {
    const parsed = summarySchema.safeParse(row.value); if (!parsed.success) return invalid;
    refs = [...parsed.data.facts.map((f) => f.source_ref), ...parsed.data.links.flatMap((l) => l.refs), ...parsed.data.suggestions.flatMap((s) => s.refs)];
  } else if (row.purpose === "inbox_triage") {
    const parsed = inboxSchema.safeParse(row.value); if (!parsed.success) return invalid;
    candidateIds = parsed.data.order; refs = candidateIds.map((id) => ({ kind: "inbox", id }));
  } else return invalid;
  return validateBoardOutput({ seat: row.purpose, payload: {}, prompt: "", refs, candidateIds }, row.value, slot);
}

/** Decode untrusted JSON before passing a typed value to the W0 checks/UI.
 * A referenced row must have been supplied; that does not prove the generated
 * sentence true. Suggestions still need a user action and the existing writer.
 */
export function validateBoardOutput(
  input: PreparedBoardInput, output: unknown, slot?: Slot,
): ValidatedBoardOutput {
  const known = new Set(input.refs.map((item) => item.kind + ":" + item.id));
  const grounded = (items: readonly BoardRef[]) =>
    items.every((item) => known.has(item.kind + ":" + item.id));
  switch (input.seat) {
    case "daily_note": {
      const parsed = noteSchema.safeParse(output);
      if (!parsed.success) return invalid;
      const note = parsed.data;
      if (note.slot !== slot || dailyNoteProblems(note).length ||
          !grounded(note.basis_refs) || !grounded(note.reminder_suggestions.map((s) => s.source_ref))) return invalid;
      return { ok: true, seat: input.seat, value: note };
    }
    case "day_summary": {
      const parsed = summarySchema.safeParse(output);
      if (!parsed.success) return invalid;
      const summary = parsed.data;
      if (daySummaryProblems(summary).length ||
          !grounded(summary.facts.map((fact) => fact.source_ref)) ||
          !grounded(summary.links.flatMap((link) => link.refs)) ||
          !grounded(summary.suggestions.flatMap((suggestion) => suggestion.refs))) return invalid;
      return { ok: true, seat: input.seat, value: summary };
    }
    case "inbox_triage": {
      const parsed = inboxSchema.safeParse(output);
      if (!parsed.success) return invalid;
      const triage = parsed.data;
      const count = input.candidateIds.length;
      if (!count || new Set(input.candidateIds).size !== count ||
          triage.order.length !== count || triage.items.length !== count ||
          new Set(triage.order).size !== count || new Set(triage.items.map((item) => item.id)).size !== count ||
          inboxTriageProblems(triage, input.candidateIds).length) return invalid;
      return { ok: true, seat: input.seat, value: triage };
    }
    default:
      return invalid;
  }
}
