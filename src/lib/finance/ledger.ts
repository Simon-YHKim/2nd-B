// Finance manage layer (O-R3 Wave 2, money_check): a deterministic manual
// ledger. This is the gate-0 core of 재정 점검 — the user records income/expense
// rows and the month summary is computed from them. No LLM, no external API
// (FX in fx.ts is optional enrichment). $0.
//
// RLS does the authorization: ops_ledger is owner-only (migration 0052,
// auth.uid() = user_id). The pure helpers (monthBucket, summarizeMonth) are
// separated from the Supabase calls so they are node-testable without a client,
// the same discipline as ops/routines.ts.

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";

export type LedgerKind = "income" | "expense";

export interface LedgerEntry {
  id: string;
  user_id: string;
  /** YYYY-MM-DD local calendar day the entry is booked on. */
  occurred_on: string;
  kind: LedgerKind;
  /** Amount in KRW (whole won; KRW has no minor unit). Always positive. */
  amount_krw: number;
  category: string;
  note: string | null;
  created_at: string;
}

export interface MonthSummary {
  /** YYYY-MM. */
  month: string;
  income: number;
  expense: number;
  /** income - expense (can be negative). */
  net: number;
  /** expense totals per category, descending by amount. */
  byCategory: Array<{ category: string; total: number }>;
}

// --- pure helpers (node-testable, no Supabase) -------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local YYYY-MM-DD for a Date. */
export function localDayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * The most one ledger row can hold: 1,000,000,000,000 won.
 *
 * R2C-16 (2026-10-05): the amount field had no ceiling. A 25-digit amount went out as
 * `amount_krw: 1e+25` (JSON exponent form) and the server answered 400, which the
 * screen showed as "try again", and trying again sent the same 400. Between 2^53 and
 * the bigint limit it was worse: no error at all, and 9999999999999999 was stored as
 * 10000000000000000. This ceiling sits far below Number.MAX_SAFE_INTEGER and the
 * bigint column (0052), so a typed amount is either stored exactly or refused. It is
 * the same ceiling the bank-CSV import already applies (import/finance-csv.ts AMOUNT_MAX).
 */
export const MAX_LEDGER_KRW = 1_000_000_000_000;
/**
 * Digits in MAX_LEDGER_KRW: the parser's digit gate.
 *
 * It is NOT the input's maxLength. A TextInput maxLength counts raw characters, separators
 * included, so maxLength 13 cut a pasted "1,000,000,000,000" (17 characters, an allowed
 * amount) to "1,000,000,000", which this parser then accepted as 1,000x less (gate
 * finding S-01 / BL-01, 2026-10-05). The field takes the whole string and this parser is
 * the only ceiling: an amount is stored as typed or refused, never shortened.
 */
export const LEDGER_AMOUNT_MAX_DIGITS = String(MAX_LEDGER_KRW).length;

/**
 * The longest amount text the parser reads at all (gate S3-02, 2026-10-07).
 *
 * The widest amount the field takes, "₩ 1,000,000,000,000 원", is 21 characters, so 64 leaves
 * room for padding and leading zeros. Longer text is refused before any pattern runs, and the
 * field never takes it in the first place (ledgerAmountEdit): nothing shortened is ever held,
 * so nothing shortened can ever be read as an amount.
 */
export const LEDGER_AMOUNT_MAX_CHARS = 64;

/**
 * What the amount field may hold (gate S-02, 2026-10-07): whole won, written as plain digits or
 * grouped by commas in threes ("12,000"), with an optional ₩ (or full-width ￦) before it, an
 * optional 원 after it, and spaces around those. KRW has no minor unit.
 *
 * The parser used to delete every character that was not a digit and read what was left, so a
 * typed amount could be stored as a different one: "-500" became 500, "1e3" became 13, "12.34"
 * became 1234, "$12" became 12 won. Anything outside the shape above is now "invalid" and is
 * never sent: a sign, a decimal point or comma, an exponent, a letter, another currency, or a
 * comma that does not split threes ("12,34", "1,2,3", "0,012").
 */
const LEDGER_AMOUNT_SHAPE = /^[₩￦]?\s*(\d+|[1-9]\d{0,2}(?:,\d{3})+)\s*원?$/;

export type LedgerAmount =
  | { kind: "empty" }
  | { kind: "ok"; value: number }
  | { kind: "tooLarge" }
  | { kind: "invalid" };

/** Read the amount field. Empty or zero is "empty" (the add button stays off, no error);
 *  text outside LEDGER_AMOUNT_SHAPE is "invalid"; above MAX_LEDGER_KRW is "tooLarge". */
export function parseLedgerAmount(raw: string): LedgerAmount {
  if (raw.length > LEDGER_AMOUNT_MAX_CHARS) return { kind: "invalid" };
  const text = raw.trim();
  if (text.length === 0) return { kind: "empty" };
  const written = LEDGER_AMOUNT_SHAPE.exec(text)?.[1];
  if (written === undefined) return { kind: "invalid" };
  const digits = written.replace(/,/g, "").replace(/^0+/, "");
  if (digits.length === 0) return { kind: "empty" };
  if (digits.length > LEDGER_AMOUNT_MAX_DIGITS) return { kind: "tooLarge" };
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value > MAX_LEDGER_KRW) return { kind: "tooLarge" };
  return { kind: "ok", value };
}

/** The amount field after one edit: the text it holds, and whether the edit was refused. */
export interface LedgerAmountEdit {
  text: string;
  overflow: boolean;
}

/**
 * Take one edit of the amount field (gate OPSFIX-A1-04, 2026-10-07).
 *
 * Text longer than LEDGER_AMOUNT_MAX_CHARS is not taken: the field keeps exactly what it held,
 * and `overflow` says the edit was refused, so the screen says so and keeps the add button off
 * until the next edit the field does take. The field used to keep the first 65 characters of
 * such text. The parser refused those, but one more edit could make them a shorter text it read:
 * "0" x 63 + "12000" pasted was cut to 63 zeros and "12", and deleting one leading zero left
 * 64 characters, read as 12 won. A cut-down paste is now never held, so no later edit can turn
 * one into an amount.
 */
export function ledgerAmountEdit(held: string, typed: string): LedgerAmountEdit {
  return typed.length > LEDGER_AMOUNT_MAX_CHARS ? { text: held, overflow: true } : { text: typed, overflow: false };
}

/** "YYYY-MM" bucket for a YYYY-MM-DD key (or a Date). */
export function monthBucket(date: string | Date): string {
  if (date instanceof Date) return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  return date.slice(0, 7);
}

/**
 * Pure: roll a set of entries (already scoped to one month, or any set — it
 * filters by the month bucket) into an income/expense/net summary with per
 * category expense totals sorted high→low.
 */
export function summarizeMonth(
  entries: ReadonlyArray<Pick<LedgerEntry, "occurred_on" | "kind" | "amount_krw" | "category">>,
  month: string,
): MonthSummary {
  let income = 0;
  let expense = 0;
  const catMap = new Map<string, number>();
  for (const e of entries) {
    if (monthBucket(e.occurred_on) !== month) continue;
    const amount = Math.max(0, Math.round(e.amount_krw));
    if (e.kind === "income") {
      income += amount;
    } else {
      expense += amount;
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + amount);
    }
  }
  const byCategory = [...catMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
  return { month, income, expense, net: income - expense, byCategory };
}

function rowToEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    occurred_on: String(row.occurred_on),
    kind: (row.kind as LedgerKind) === "income" ? "income" : "expense",
    amount_krw: typeof row.amount_krw === "number" ? row.amount_krw : Number(row.amount_krw) || 0,
    category: String(row.category ?? ""),
    note: (row.note as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

// --- Supabase-backed queries (RLS owner-only) --------------------------

export interface NewLedgerEntry {
  occurred_on?: string;
  kind: LedgerKind;
  amount_krw: number;
  category: string;
  note?: string | null;
}

/** Record a manual income/expense row. The amount must already be a whole number of won
 *  from 1 to MAX_LEDGER_KRW; anything else is refused before any write (the screen checks
 *  first with parseLedgerAmount; this is the second lock).
 *
 *  Gate S-02 (2026-10-07): this used to round and clamp first and check after, so 1.5 was
 *  stored as 2 and -500 as a 0-won row. It now checks the amount exactly as it was given. */
export async function createLedgerEntry(userId: string, entry: NewLedgerEntry): Promise<LedgerEntry> {
  const amount = entry.amount_krw;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_LEDGER_KRW) {
    throw new RangeError("ledger_amount_out_of_range");
  }
  const insert = {
    user_id: userId,
    occurred_on: entry.occurred_on ?? localDayKey(),
    kind: entry.kind,
    amount_krw: amount,
    category: entry.category.trim() || "기타",
    note: entry.note?.trim() ? entry.note.trim() : null,
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("ops_ledger").insert(insert).select().single();
  if (error) throw error;
  // A ledger row lifts the 재정 (finance) domain star; drop the stale home cache.
  invalidateDomainLevels(userId);
  return rowToEntry(data as Record<string, unknown>);
}

/**
 * Book one imported statement row (0224). `importKey` identifies the row across imports, so a
 * second import of the same statement is skipped instead of booked twice: the upsert ignores a
 * conflict on (user_id, import_key) and returns no row. Resolves to the new entry, or null when
 * the row was already booked. The amount is rounded and clamped here, then checked against
 * MAX_LEDGER_KRW (the statement reader already rounds its amounts); the hand-entry path,
 * createLedgerEntry, refuses instead of rounding (gate S-02).
 */
export async function createImportedLedgerEntry(
  userId: string,
  entry: NewLedgerEntry,
  importKey: string,
): Promise<LedgerEntry | null> {
  const amount = Math.max(0, Math.round(entry.amount_krw));
  if (!Number.isSafeInteger(amount) || amount > MAX_LEDGER_KRW) {
    throw new RangeError("ledger_amount_out_of_range");
  }
  const insert = {
    user_id: userId,
    occurred_on: entry.occurred_on ?? localDayKey(),
    kind: entry.kind,
    amount_krw: amount,
    category: entry.category.trim() || "기타",
    note: entry.note?.trim() ? entry.note.trim() : null,
    import_key: importKey,
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_ledger")
    .upsert(insert, { onConflict: "user_id,import_key", ignoreDuplicates: true })
    .select();
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  invalidateDomainLevels(userId);
  return rowToEntry(rows[0] as Record<string, unknown>);
}

/** All entries booked within the given YYYY-MM month, newest first. */
export async function listEntriesForMonth(userId: string, month: string): Promise<LedgerEntry[]> {
  const supabase = getSupabaseClient();
  // Upper bound = first day of the NEXT month (exclusive). Never build `${month}-31`:
  // for Feb/Apr/Jun/Sep/Nov that is an invalid calendar date, and Postgres raises
  // 22008 (date/time field out of range) instead of clamping, so the query throws.
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("ops_ledger")
    .select("*")
    .eq("user_id", userId)
    .gte("occurred_on", `${month}-01`)
    .lt("occurred_on", `${nextMonth}-01`)
    .order("occurred_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToEntry(r as Record<string, unknown>));
}

/** Delete one entry (RLS guarantees it must be the owner's). */
export async function deleteLedgerEntry(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("ops_ledger").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
