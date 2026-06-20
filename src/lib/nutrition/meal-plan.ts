// Weekly meal plan manage layer (O-R3 Wave 2, weekly_meals / simple_meals).
// Pairs with the MFDS nutrition source (foods.ts): a food idea is placed into a
// (day, slot) cell and persisted. Manual structured input — no Gemini call, no
// new C1/C9/C3 surface. $0.
//
// RLS owner-only (migration 0055). Pure helpers (week math + grid build) are
// separated from the Supabase calls so they are node-testable, the same
// discipline as ops/routines.ts and finance/ledger.ts.

import { getSupabaseClient } from "../supabase/client";

export type MealSlot = "breakfast" | "lunch" | "dinner";
export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export interface MealEntry {
  id: string;
  user_id: string;
  /** YYYY-MM-DD. */
  plan_date: string;
  slot: MealSlot;
  title: string;
  kcal: number | null;
  created_at: string;
  updated_at: string;
}

export interface DayPlan {
  date: string; // YYYY-MM-DD
  breakfast: MealEntry | null;
  lunch: MealEntry | null;
  dinner: MealEntry | null;
}

// --- pure helpers (node-testable, no Supabase) -------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse a YYYY-MM-DD key to a local Date (midnight). */
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Monday-anchored week start (YYYY-MM-DD) for the week containing `date`. */
export function weekStartKey(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return dayKey(d);
}

/** The 7 day keys (Mon..Sun) of the week starting at `weekStart`. */
export function weekDayKeys(weekStart: string): string[] {
  const start = parseDayKey(weekStart);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(dayKey(d));
  }
  return out;
}

/** Build a 7-day × 3-slot grid for the week, filling cells from `entries`. */
export function buildWeekGrid(weekStart: string, entries: ReadonlyArray<MealEntry>): DayPlan[] {
  const byCell = new Map<string, MealEntry>();
  for (const e of entries) byCell.set(`${e.plan_date}|${e.slot}`, e);
  return weekDayKeys(weekStart).map((date) => ({
    date,
    breakfast: byCell.get(`${date}|breakfast`) ?? null,
    lunch: byCell.get(`${date}|lunch`) ?? null,
    dinner: byCell.get(`${date}|dinner`) ?? null,
  }));
}

function rowToEntry(row: Record<string, unknown>): MealEntry {
  const slot = row.slot === "lunch" || row.slot === "dinner" ? (row.slot as MealSlot) : "breakfast";
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    plan_date: String(row.plan_date),
    slot,
    title: String(row.title),
    kcal: typeof row.kcal === "number" ? row.kcal : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// --- Supabase-backed queries (RLS owner-only) --------------------------

/** Plan (or replan) a single (day, slot) cell. Idempotent on (user, day, slot). */
export async function setMeal(
  userId: string,
  planDate: string,
  slot: MealSlot,
  title: string,
  kcal?: number | null,
): Promise<MealEntry> {
  const row = {
    user_id: userId,
    plan_date: planDate,
    slot,
    title: title.trim(),
    kcal: typeof kcal === "number" ? Math.max(0, Math.round(kcal)) : null,
    updated_at: new Date().toISOString(),
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_meal_plan")
    .upsert(row, { onConflict: "user_id,plan_date,slot" })
    .select()
    .single();
  if (error) throw error;
  return rowToEntry(data as Record<string, unknown>);
}

/** All planned cells for the week starting at `weekStart` (Mon..Sun). */
export async function listWeek(userId: string, weekStart: string): Promise<MealEntry[]> {
  const days = weekDayKeys(weekStart);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_meal_plan")
    .select("*")
    .eq("user_id", userId)
    .gte("plan_date", days[0])
    .lte("plan_date", days[6])
    .order("plan_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToEntry(r as Record<string, unknown>));
}

/** Clear one (day, slot) cell. */
export async function clearMeal(userId: string, planDate: string, slot: MealSlot): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("ops_meal_plan")
    .delete()
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .eq("slot", slot);
  if (error) throw error;
}
