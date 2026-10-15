import { z } from "zod";
import { BOARD_SEATS, INBOX_TRIAGE_LIMITS, seatMayRead, type BoardRef, type BoardSeat } from "./contract";
import { INJECTION_GUARD, wrapUntrusted } from "../llm/untrusted";

export interface BoardInputConsent {
  readonly llm: boolean;
  readonly recordExcerpts: boolean;
}
export interface PreparedBoardInput {
  readonly seat: BoardSeat;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly refs: readonly BoardRef[];
  readonly candidateIds: readonly string[];
  readonly prompt: string;
}
export type PreparedInputResult =
  | { readonly ok: true; readonly value: PreparedBoardInput }
  | { readonly ok: false; readonly reason: "consent_off" | "invalid_input" | "no_evidence" };

// Transport bounds, not sufficiency thresholds. No truncation can turn one ID
// into another or silently remove the end of evidence.
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const text = z.string().trim().min(1).max(2_000);
const instant = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dailyInput = z.object({
  schedule: z.array(z.object({ id, title: text, at: instant })).max(64).optional(),
  reminders: z.array(z.object({
    id, kind: z.enum(["reminder", "routine", "dday"]), title: text,
    at: instant.nullable(), state: z.enum(["open", "done", "skipped"]),
  })).max(64).optional(),
  routineCompletion: z.array(z.object({
    id, state: z.enum(["done", "skipped"]), date: day,
  })).max(128).optional(),
  weather: z.object({
    condition: text, temp_c: z.number().finite().min(-150).max(100).nullable(),
    at: instant, air_quality: text.nullable(),
  }).optional(),
  recordExcerpts: z.array(z.object({ id, text })).max(20).optional(),
});
const inboxInput = z.object({
  inboxCandidates: z.array(z.object({
    id, source: z.literal("app"), sender: text.nullable(), title: text,
  })).max(INBOX_TRIAGE_LIMITS.candidates),
});
const invalid: PreparedInputResult = { ok: false, reason: "invalid_input" };

/**
 * Accept an owner-scoped reader snapshot, never a prompt supplied by a client.
 * Only fresh schema-projected fields reach the prompt. A title is still authored
 * text: this is not a semantic detector for amounts embedded in arbitrary prose.
 */
export function prepareBoardInput(
  seat: BoardSeat, source: unknown, consent: BoardInputConsent,
): PreparedInputResult {
  if (consent?.llm !== true) return { ok: false, reason: "consent_off" };
  if (!BOARD_SEATS.includes(seat) || !source || typeof source !== "object" || Array.isArray(source)) return invalid;
  const raw = source as Record<string, unknown>;
  let payload: Record<string, unknown>;
  const refs: BoardRef[] = [];
  let candidateIds: string[] = [];
  if (seat === "inbox_triage") {
    if (!seatMayRead(seat, "inboxCandidate.sender") || !seatMayRead(seat, "inboxCandidate.title")) return invalid;
    const parsed = inboxInput.safeParse({ inboxCandidates: raw.inboxCandidates });
    if (!parsed.success) return invalid;
    candidateIds = parsed.data.inboxCandidates.map((candidate) => candidate.id);
    if (new Set(candidateIds).size !== candidateIds.length) return invalid;
    // Source validates the W1 gate locally; it is not extra content for the seat.
    payload = { inboxCandidates: parsed.data.inboxCandidates.map(({ id, sender, title }) => ({ id, sender, title })) };
    refs.push(...candidateIds.map((id): BoardRef => ({ kind: "inbox", id })));
  } else {
    const selected: Record<string, unknown> = {};
    for (const field of ["schedule", "reminders", "routineCompletion", "weather", "recordExcerpts"] as const) {
      if (!seatMayRead(seat, field) || (field === "recordExcerpts" && consent.recordExcerpts !== true)) continue;
      if (Object.hasOwn(raw, field)) selected[field] = raw[field];
    }
    const parsed = dailyInput.safeParse(selected);
    if (!parsed.success) return invalid;
    const data = parsed.data;
    payload = data;
    for (const row of data.schedule ?? []) refs.push({ kind: "event", id: row.id });
    for (const row of data.reminders ?? []) refs.push({ kind: row.kind === "routine" ? "routine" : "reminder", id: row.id });
    for (const row of data.routineCompletion ?? []) refs.push({ kind: "routine", id: row.id });
    for (const row of data.recordExcerpts ?? []) refs.push({ kind: "record", id: row.id });
    if (data.weather) refs.push({ kind: "weather", id: "current" });
  }
  if (refs.length === 0) return { ok: false, reason: "no_evidence" };
  const allowedRefs = [...new Map(refs.map((ref) => [ref.kind + ":" + ref.id, ref])).values()];
  const serialized = JSON.stringify({ data: payload, allowed_refs: allowedRefs });
  if (serialized.length > 16_000) return invalid;
  return {
    ok: true,
    value: {
      seat, payload, candidateIds,
      refs: allowedRefs,
      prompt: INJECTION_GUARD.en + "\n" + wrapUntrusted("dashboard." + seat, serialized),
    },
  };
}
