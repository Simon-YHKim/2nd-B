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

/** Record a manual income/expense row. Amount is clamped to a positive integer. */
export async function createLedgerEntry(userId: string, entry: NewLedgerEntry): Promise<LedgerEntry> {
  const insert = {
    user_id: userId,
    occurred_on: entry.occurred_on ?? localDayKey(),
    kind: entry.kind,
    amount_krw: Math.max(0, Math.round(entry.amount_krw)),
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

/** All entries booked within the given YYYY-MM month, newest first. */
export async function listEntriesForMonth(userId: string, month: string): Promise<LedgerEntry[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_ledger")
    .select("*")
    .eq("user_id", userId)
    .gte("occurred_on", `${month}-01`)
    .lte("occurred_on", `${month}-31`)
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
