// Daily board data contract (PS-DASH-001 v2.1, redesign W0).
//
// The board is a day-management surface: every part shows data and offers one
// shortcut. Nothing here decides whether a part is shown, where it sits or what
// colour it takes on the screen; those come from the declarations in parts.ts and
// the thresholds in ../sufficiency/registry.ts. The screen reads the values and
// never judges (decision 26.10.07 02:30; the LLM does not lay out the board).
//
// W0 is types, declarations and pure checks only: no reader, no writer, no LLM
// seat. daily_note / day_summary / inbox_triage are named here as the W1 seats
// that will consume the board's data, but they are NOT PromptPurpose values yet.
import { dashboardParam } from "../sufficiency/registry";

// ── basis: who stands behind a line, and therefore its tone ───────────────────

export const BASES = ["ai", "fact", "rule", "locked"] as const;
export type Basis = (typeof BASES)[number];

/** accent = teal (AI reading or suggestion) · neutral = grey (sourced fact or rule
 *  suggestion) · dashed = not connected yet / locked. The screen maps a tone to a
 *  token; it never picks a tone itself. */
export type Tone = "accent" | "neutral" | "dashed";
export const BASIS_TONE: Readonly<Record<Basis, Tone>> = {
  ai: "accent",
  fact: "neutral",
  rule: "neutral",
  locked: "dashed",
};
export function toneFor(basis: Basis): Tone {
  return BASIS_TONE[basis];
}

// ── where a part's data comes from (RD-261007-09: split by the data's nature) ──

/**
 * flow1  = descriptive text a person wrote (records, wiki, calendar import)
 * flow2  = measurement ledgers a device or a transaction left (health samples,
 *          expense ledger, CSV included). Never enters any LLM context.
 * inApp  = what the app saw the user do (reminders, routine completion)
 * device = raw content that stays on the device (notification / mail bodies, 24h)
 * public = public data (weather, air quality, FX, holidays)
 */
export type DataFlow = "flow1" | "flow2" | "inApp" | "device" | "public";

export type SourceId =
  | "records"
  | "calendar_import"
  | "app_reminders"
  | "ops_routines"
  | "ops_routine_logs"
  | "dday"
  | "health_samples"
  | "diet"
  | "ops_ledger"
  | "device_notifications"
  | "device_mail"
  | "now_playing"
  | "weather"
  | "air_quality"
  | "fx_rates"
  | "public_holidays"
  | "custom_widgets"
  | "widget_usage"
  | "daily_note"
  | "day_summary"
  | "inbox_queue";

export type Retention =
  | "server:record" // lives and dies with the user's own row
  | "server:ledger" // measurement ledger row
  | "server:aggregateOnly" // counts per (date, slot, widget); no content
  | "server:slotCache" // one generated row per (user, date, slot)
  | "cache:30m"
  | "cache:24h"
  | "device:24h"; // never uploaded

export interface SourceDecl {
  readonly id: SourceId;
  readonly flow: DataFlow;
  readonly retention: Retention;
  /** Stage that first reads this source. W2 · W3 sources stay locked until approved. */
  readonly stage: "W1" | "W2" | "W3";
}

export const SOURCES: Readonly<Record<SourceId, SourceDecl>> = {
  records: { id: "records", flow: "flow1", retention: "server:record", stage: "W1" },
  calendar_import: { id: "calendar_import", flow: "flow1", retention: "server:record", stage: "W3" },
  app_reminders: { id: "app_reminders", flow: "inApp", retention: "server:record", stage: "W1" },
  ops_routines: { id: "ops_routines", flow: "inApp", retention: "server:record", stage: "W1" },
  ops_routine_logs: { id: "ops_routine_logs", flow: "inApp", retention: "server:record", stage: "W1" },
  dday: { id: "dday", flow: "inApp", retention: "server:record", stage: "W1" },
  health_samples: { id: "health_samples", flow: "flow2", retention: "server:ledger", stage: "W1" },
  diet: { id: "diet", flow: "flow2", retention: "server:ledger", stage: "W1" },
  ops_ledger: { id: "ops_ledger", flow: "flow2", retention: "server:ledger", stage: "W1" },
  device_notifications: { id: "device_notifications", flow: "device", retention: "device:24h", stage: "W2" },
  device_mail: { id: "device_mail", flow: "device", retention: "device:24h", stage: "W3" },
  now_playing: { id: "now_playing", flow: "device", retention: "device:24h", stage: "W2" },
  weather: { id: "weather", flow: "public", retention: "cache:30m", stage: "W1" },
  air_quality: { id: "air_quality", flow: "public", retention: "cache:30m", stage: "W1" },
  fx_rates: { id: "fx_rates", flow: "public", retention: "cache:24h", stage: "W1" },
  public_holidays: { id: "public_holidays", flow: "public", retention: "cache:24h", stage: "W1" },
  custom_widgets: { id: "custom_widgets", flow: "inApp", retention: "server:record", stage: "W1" },
  widget_usage: { id: "widget_usage", flow: "inApp", retention: "server:aggregateOnly", stage: "W1" },
  daily_note: { id: "daily_note", flow: "inApp", retention: "server:slotCache", stage: "W1" },
  day_summary: { id: "day_summary", flow: "inApp", retention: "cache:30m", stage: "W1" },
  inbox_queue: { id: "inbox_queue", flow: "inApp", retention: "server:aggregateOnly", stage: "W1" },
};

// ── what the W1 seats may read (RD-261007-09 · Q14) ─────────────────────────────

export const BOARD_SEATS = ["daily_note", "day_summary", "inbox_triage"] as const;
export type BoardSeat = (typeof BOARD_SEATS)[number];

/** Every field a board seat could be handed. Anything not listed for a seat is refused. */
export type SeatInputField =
  | "schedule" // calendar events (flow1)
  | "reminders" // app reminders, D-day (inApp)
  | "routineCompletion" // done / skipped today and yesterday (inApp)
  | "weather"
  | "recordExcerpts" // record originals, only with the Q13 consent
  | "inboxCandidate.sender"
  | "inboxCandidate.title"
  | "inboxCandidate.preview200"
  // Listed so the tests can prove no seat takes them:
  | "health.values"
  | "ledger.amounts"
  | "notification.raw"
  | "mail.raw"
  | "otp";

/** Fields that never reach an LLM context, for any seat (flow2 + device raw + codes). */
export const NEVER_TO_LLM: readonly SeatInputField[] = [
  "health.values",
  "ledger.amounts",
  "notification.raw",
  "mail.raw",
  "otp",
  // RD-261007-11 = B (Simon 2026-10-07): the preview is the start of a mail or
  // notification body, so it stays out of every seat until the W2 research shows
  // inbox_triage needs it; then Simon decides whether to open it (option A).
  "inboxCandidate.preview200",
];

export const SEAT_INPUT_ALLOWLIST: Readonly<Record<BoardSeat, readonly SeatInputField[]>> = {
  // RD-261007-09: reminders and routine completion (in-app behaviour) are allowed
  // inputs for daily_note and day_summary; the 02:42 hold applies to interviews only.
  daily_note: ["schedule", "reminders", "routineCompletion", "weather", "recordExcerpts"],
  day_summary: ["schedule", "reminders", "routineCompletion", "weather", "recordExcerpts"],
  // Top five candidates, sender and title only, untrusted fence (RD-261007-11 = B).
  inbox_triage: ["inboxCandidate.sender", "inboxCandidate.title"],
};

/** Inputs that need the Q13 record-use consent on top of the general LLM consent. */
export const CONSENT_GATED_INPUTS: readonly SeatInputField[] = ["recordExcerpts"];

export function seatMayRead(seat: BoardSeat, field: SeatInputField): boolean {
  if (NEVER_TO_LLM.includes(field)) return false;
  return SEAT_INPUT_ALLOWLIST[seat].includes(field);
}

// ── lines on the board ───────────────────────────────────────────────────────────

/** What a line points at; tapping it opens the original. */
export interface BoardRef {
  readonly kind:
    | "record"
    | "reminder"
    | "routine"
    | "event"
    | "ledger"
    | "health"
    | "inbox"
    | "weather"
    | "fx"
    | "holiday";
  readonly id: string;
}

type NonEmpty<T> = readonly [T, ...T[]];

/** Fixed sentence pools used when an AI slot has no grounded output. Values are
 *  i18n key prefixes; the copy itself lives in the locale bundles. */
export type FixedPoolId = "dailyNote.morning" | "dailyNote.midday" | "dailyNote.evening" | "daySummary.headline";

/**
 * A line the AI wrote must carry at least one ref. An AI slot with nothing to
 * ground it renders a fixed-pool sentence instead, and that line is basis "rule":
 * it was picked deterministically, not interpreted.
 */
export type BoardLine =
  | { readonly basis: "ai"; readonly text: string; readonly refs: NonEmpty<BoardRef> }
  | { readonly basis: "fact"; readonly text: string; readonly ref: BoardRef }
  | { readonly basis: "rule"; readonly text: string; readonly ruleKey: string }
  | { readonly basis: "rule"; readonly pool: FixedPoolId; readonly index: number }
  | { readonly basis: "locked"; readonly lock: LockCode };

/** Deterministic pick: same seed, same sentence. */
export function pickFixedSentence(pool: FixedPoolId, poolSize: number, seed: string): BoardLine {
  if (!Number.isInteger(poolSize) || poolSize < 1) throw new Error(`empty fixed pool: ${pool}`);
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return { basis: "rule", pool, index: h % poolSize };
}

/** The only way to turn model output into a board line. */
export function aiLineOrFallback(
  text: string,
  refs: readonly BoardRef[],
  fallback: { pool: FixedPoolId; poolSize: number; seed: string },
): BoardLine {
  const trimmed = text.trim();
  if (trimmed.length > 0 && refs.length > 0) {
    return { basis: "ai", text: trimmed, refs: refs as unknown as NonEmpty<BoardRef> };
  }
  return pickFixedSentence(fallback.pool, fallback.poolSize, fallback.seed);
}

// ── empty and locked states ─────────────────────────────────────────────────────

/** sentence = show the empty-state sentence · hide = take the part off the page ·
 *  locked = dashed card with the reason and a link to the connection screen. */
export type EmptyDisplay = "sentence" | "hide" | "locked";

export interface EmptyReason {
  readonly code: string;
  readonly display: EmptyDisplay;
  /** i18n key of the sentence. */
  readonly copyKey: string;
}

/**
 * Why a part is closed regardless of data. The server enforces the minor lock
 * (notification / mail sources, S-02, payment-alert parsing); the contract only
 * names the code so the screen can show the reason.
 */
export type LockCode = "minorServerLock" | "integrationOff" | "stageLocked" | "consentOff" | "notAdult";

// ── part payloads the screen renders (W1 fills them; fixtures use them now) ─────

export type Slot = "morning" | "midday" | "evening";

/** P-03 · Q-261007-38: reason and alarm_at replace what the old agenda widget showed. */
export interface ReminderItem {
  readonly id: string;
  readonly kind: "reminder" | "routine" | "dday" | "event";
  readonly title: string;
  readonly at: string | null;
  readonly reason: string | null;
  readonly alarm_at: string | null;
  readonly state: "open" | "done" | "skipped";
  readonly basis: "fact" | "rule";
  readonly ref: BoardRef;
}

/** P-03 suggestion chip (at most two), from daily_note.reminder_suggestions. */
export interface ReminderSuggestion {
  readonly title: string;
  readonly when: string;
  readonly why: string;
  readonly source_ref: BoardRef;
}

/** P-06 · Q-261007-38: every health row says where it came from and when it last synced. */
export interface HealthRow {
  readonly metric: "sleep" | "steps" | "exercise" | "diet";
  readonly value: number | null;
  readonly unit: string;
  /** Rule comparison against the 14-day median, e.g. "40 minutes shorter". Never AI. */
  readonly usualDelta: number | null;
  readonly source: string;
  readonly synced_at: string;
  readonly basis: "fact";
}

/** P-01. Place is chosen by hand; there is no location permission. */
export interface WeatherRow {
  readonly place: string;
  readonly at: string;
  readonly condition: string;
  readonly temp_c: number | null;
  readonly air_quality: string | null;
  readonly basis: "fact";
  readonly ref: BoardRef;
}

/** P-04 card. Without the LLM consent `line` is the original title as a fact line. */
export interface InboxCard {
  readonly id: string;
  readonly source: "app" | "notification" | "mail";
  readonly sender: string | null;
  readonly title: string;
  readonly line: BoardLine;
  readonly at: string;
}

/** P-07. Flow 2: shown as numbers, never sent to a seat. */
export interface LedgerSummary {
  readonly month: string;
  readonly total: number;
  readonly currency: string;
  readonly pending: {
    readonly id: string;
    readonly merchant: string;
    readonly amount: number;
    readonly occurred_on: string;
    readonly ref: BoardRef;
  } | null;
  readonly basis: "fact";
}

/** P-08 line: only what changed, at most three. */
export interface ChangeLine {
  readonly kind: "yearsAgo" | "fx" | "nowPlaying" | "holiday";
  readonly text: string;
  readonly basis: "fact" | "rule";
  readonly ref: BoardRef;
}

/** P-09 · M-01..M-05 (Q-261007-36). The row stores the binding only. */
export interface CustomWidget {
  readonly id: string;
  readonly template: "M-01" | "M-02" | "M-03" | "M-04" | "M-05";
  readonly binding:
    | { readonly kind: "entity"; readonly entity_id: string }
    | { readonly kind: "routine"; readonly routine_id: string }
    | { readonly kind: "merchant"; readonly merchant: string }
    | { readonly kind: "tag"; readonly tag: string };
  readonly created_at: string;
  readonly pinned: boolean;
}

/** Usage signal: one aggregate row per (date, slot, widget). No content, no per-tap log. */
export interface WidgetUsageRow {
  readonly date: string;
  readonly slot: Slot;
  readonly widget_id: string;
  readonly presses: number;
  readonly hides: number;
}

/** The contract type each part renders. "none" = the part has no data payload. */
export type PayloadName =
  | "WeatherRow"
  | "DailyNote"
  | "ReminderItem"
  | "InboxCard"
  | "HealthRow"
  | "LedgerSummary"
  | "ChangeLine"
  | "CustomWidget"
  | "DaySummary"
  | "none";

export interface DailyNote {
  readonly slot: Slot;
  readonly line: string;
  readonly basis_refs: readonly BoardRef[];
  /** morning = today, evening = tomorrow, at most 2 · midday = always empty. */
  readonly reminder_suggestions: readonly ReminderSuggestion[];
}

export interface DaySummary {
  readonly headline: string;
  readonly facts: readonly {
    readonly kind: string;
    readonly title: string;
    readonly who: string | null;
    readonly since: string | null;
    readonly action: string | null;
    readonly source_ref: BoardRef;
  }[];
  readonly links: readonly { readonly text: string; readonly refs: readonly BoardRef[] }[];
  readonly suggestions: readonly {
    readonly text: string;
    readonly action: string | null;
    readonly basis: "ai" | "rule";
    readonly refs: readonly BoardRef[];
  }[];
  readonly tail_counts: Readonly<Record<string, number>>;
}

export interface InboxTriage {
  readonly order: readonly string[];
  readonly items: readonly { readonly id: string; readonly action_line: string; readonly why: string }[];
}

// Limits live in the threshold table; these names only read it.
export const DAILY_NOTE_MAX_SUGGESTIONS = dashboardParam("dash.P-03", "maxSuggestionChips");
export const DAY_SUMMARY_LIMITS = {
  facts: dashboardParam("dash.S-01", "maxFacts"),
  links: dashboardParam("dash.S-01", "maxLinks"),
  suggestions: dashboardParam("dash.S-01", "maxSuggestions"),
} as const;
export const INBOX_TRIAGE_LIMITS = {
  candidates: dashboardParam("dash.P-04", "triageCandidates"),
} as const;

/** Schema checks for seat output. A problem list, empty when the output is usable. */
export function dailyNoteProblems(note: DailyNote): string[] {
  const out: string[] = [];
  if (note.line.trim().length > 0 && note.basis_refs.length === 0) out.push("line without basis_refs");
  if (note.slot === "midday" && note.reminder_suggestions.length > 0) out.push("midday suggestions must be empty");
  if (note.reminder_suggestions.length > DAILY_NOTE_MAX_SUGGESTIONS) out.push("too many suggestions");
  return out;
}

export function daySummaryProblems(summary: DaySummary): string[] {
  const out: string[] = [];
  if (summary.facts.length > DAY_SUMMARY_LIMITS.facts) out.push("too many facts");
  if (summary.links.length > DAY_SUMMARY_LIMITS.links) out.push("too many links");
  if (summary.suggestions.length > DAY_SUMMARY_LIMITS.suggestions) out.push("too many suggestions");
  for (const link of summary.links) if (link.refs.length === 0) out.push("link without refs");
  for (const s of summary.suggestions) if (s.basis === "ai" && s.refs.length === 0) out.push("ai suggestion without refs");
  return out;
}

export function inboxTriageProblems(triage: InboxTriage, candidateIds: readonly string[]): string[] {
  const out: string[] = [];
  if (candidateIds.length > INBOX_TRIAGE_LIMITS.candidates) out.push("too many candidates");
  const known = new Set(candidateIds);
  for (const id of triage.order) if (!known.has(id)) out.push(`unknown id ${id}`);
  for (const item of triage.items) if (!known.has(item.id)) out.push(`unknown id ${item.id}`);
  return out;
}
