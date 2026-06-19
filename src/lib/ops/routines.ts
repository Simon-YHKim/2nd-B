// Ops MANAGE layer (O-R3 P3). The SUGGEST engine (recommend.ts) proposes; this
// module persists an accepted recommendation as a managed routine, then tracks
// daily completions. No Gemini call lives here - a routine is the SAVE of an
// already-gated recommendation, so there is no new C1/C9/C3 surface.
//
// RLS does the authorization: every table is owner-only (migration 0048,
// auth.uid() = user_id). The explicit userId argument must equal auth.uid()
// or the policy rejects the write; it is also what scopes/indexes the reads.
//
// Pure helpers (routineDueToday, mapRecurrence, deriveReminder, weekStreak) are
// deliberately separated from the Supabase calls so they are node-testable
// without a client.

import { getSupabaseClient } from "../supabase/client";
import type { HealthSample } from "../health/HealthSource";
import type { OpsDomainId } from "./domains";
import { routinesSatisfiedBy } from "./health-link";
import type { OpsRecommendation } from "./recommend";

export type OpsRecurrence = "daily" | "weekly" | "none";

export interface OpsRoutine {
  id: string;
  user_id: string;
  domain_id: string;
  title: string;
  reason: string | null;
  recurrence: OpsRecurrence;
  /** HH:MM local wall-clock, or null when the routine has no anchored time. */
  reminder_time: string | null;
  /** 0=Sun..6=Sat, only meaningful for weekly. */
  weekday: number | null;
  duration_minutes: number | null;
  checklist: string[];
  active: boolean;
  created_at: string;
}

export interface OpsRoutineLog {
  id: string;
  routine_id: string;
  user_id: string;
  /** YYYY-MM-DD (local calendar day the user ticked the routine off). */
  completed_on: string;
  created_at: string;
}

// --- pure helpers (node-testable, no Supabase) -------------------------

/** A recommendation's recurrence collapses absent → 'none' for storage. */
export function mapRecurrence(rec: Pick<OpsRecommendation, "recurrence">): OpsRecurrence {
  return rec.recurrence === "daily" || rec.recurrence === "weekly" ? rec.recurrence : "none";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Derive the local reminder time (HH:MM) and weekday (0=Sun..6=Sat) from a
 * recommendation's ISO start. Both are null when there is no parseable start.
 * weekday is only carried for weekly routines (daily/none ignore it).
 */
export function deriveReminder(
  rec: Pick<OpsRecommendation, "startsAtIso" | "recurrence">,
): { reminder_time: string | null; weekday: number | null } {
  if (!rec.startsAtIso) return { reminder_time: null, weekday: null };
  const d = new Date(rec.startsAtIso);
  if (Number.isNaN(d.getTime())) return { reminder_time: null, weekday: null };
  const reminder_time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const weekday = mapRecurrence(rec) === "weekly" ? d.getDay() : null;
  return { reminder_time, weekday };
}

/**
 * Is this routine due on the given day?
 *   daily  → always true
 *   weekly → its weekday matches now's weekday (a weekly routine with no
 *            weekday recorded is treated as not-due to avoid daily noise)
 *   none   → false (one-off; not part of the recurring "today" list)
 */
export function routineDueToday(
  routine: Pick<OpsRoutine, "recurrence" | "weekday">,
  now: Date,
): boolean {
  if (routine.recurrence === "daily") return true;
  if (routine.recurrence === "weekly") {
    return routine.weekday !== null && routine.weekday === now.getDay();
  }
  return false;
}

/** Local YYYY-MM-DD for the completion ledger's `completed_on` date column. */
export function localDayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Count consecutive days ending today (inclusive) that have a completion log.
 * Pure: takes the set of completed_on date strings. A gap breaks the streak.
 */
export function weekStreak(
  logs: ReadonlyArray<Pick<OpsRoutineLog, "completed_on">>,
  now: Date = new Date(),
): number {
  const done = new Set(logs.map((l) => l.completed_on));
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Cap the walk so a malformed set can't spin: a "week streak" tops out at 7.
  for (let i = 0; i < 7; i++) {
    if (!done.has(localDayKey(cursor))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function rowToRoutine(row: Record<string, unknown>): OpsRoutine {
  const checklist = Array.isArray(row.checklist)
    ? (row.checklist as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    domain_id: String(row.domain_id),
    title: String(row.title),
    reason: (row.reason as string | null) ?? null,
    recurrence: (row.recurrence as OpsRecurrence) ?? "none",
    reminder_time: (row.reminder_time as string | null) ?? null,
    weekday: typeof row.weekday === "number" ? row.weekday : null,
    duration_minutes: typeof row.duration_minutes === "number" ? row.duration_minutes : null,
    checklist,
    active: row.active !== false,
    created_at: String(row.created_at),
  };
}

// --- Supabase-backed queries (RLS owner-only) --------------------------

/** Persist an accepted recommendation as a managed routine. Returns the row. */
export async function createRoutineFromRecommendation(
  userId: string,
  domainId: OpsDomainId,
  rec: OpsRecommendation,
): Promise<OpsRoutine> {
  const recurrence = mapRecurrence(rec);
  const { reminder_time, weekday } = deriveReminder(rec);
  const insert = {
    user_id: userId,
    domain_id: domainId,
    title: rec.title,
    reason: rec.reason ?? null,
    recurrence,
    reminder_time,
    weekday,
    duration_minutes: typeof rec.durationMinutes === "number" ? rec.durationMinutes : null,
    checklist: rec.checklist ?? [],
    active: true,
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("ops_routines").insert(insert).select().single();
  if (error) throw error;
  return rowToRoutine(data as Record<string, unknown>);
}

/** Every active routine for the user, newest first. */
export async function listActiveRoutines(userId: string): Promise<OpsRoutine[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_routines")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToRoutine(r as Record<string, unknown>));
}

/** Active routines that are due on `now` (daily, or weekly matching weekday). */
export async function listTodayRoutines(userId: string, now: Date = new Date()): Promise<OpsRoutine[]> {
  const active = await listActiveRoutines(userId);
  return active.filter((r) => routineDueToday(r, now));
}

/** Soft-delete: flip active=false so the routine drops out of every list. */
export async function deactivateRoutine(userId: string, routineId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("ops_routines")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("id", routineId);
  if (error) throw error;
}

/**
 * Record "I did this routine today" idempotently. The UNIQUE(routine_id,
 * completed_on) key means a double-tap upserts onto the same row instead of
 * erroring, so the optimistic check in the UI never produces a duplicate.
 *
 * `sourceSampleId` (Phase B Slice 1) records which health_samples row
 * auto-completed this routine; omitted/null = a manual tick. It writes into the
 * additive ops_routine_logs.source_sample_id column (migration 0049) without
 * changing the idempotency key, so a manual tick and a later auto-complete for
 * the same day still collapse to the one row.
 */
export async function logRoutineCompletion(
  userId: string,
  routineId: string,
  date: string = localDayKey(),
  sourceSampleId?: string | null,
): Promise<void> {
  const supabase = getSupabaseClient();
  const row: Record<string, unknown> = { user_id: userId, routine_id: routineId, completed_on: date };
  if (sourceSampleId !== undefined && sourceSampleId !== null) {
    row.source_sample_id = sourceSampleId;
  }
  const { error } = await supabase
    .from("ops_routine_logs")
    .upsert(row, { onConflict: "routine_id,completed_on", ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * Phase B Slice 1: deterministic health → routine auto-completion. Loads the
 * user's active routines, runs the pure rule mapping (health-link.ts, no LLM),
 * and logs a completion for each hit — tagged with the sample id. Idempotent on
 * (routine_id, completed_on), so re-importing the same sample is a no-op.
 * Returns the routine ids that were auto-completed.
 */
export async function applyHealthAutoComplete(
  userId: string,
  sample: { id: string; metricType: HealthSample["metricType"]; value: number; startedAt: string },
): Promise<string[]> {
  const routines = await listActiveRoutines(userId);
  const hits = routinesSatisfiedBy(
    { metricType: sample.metricType, value: sample.value, startedAt: sample.startedAt },
    routines.map((r) => ({ id: r.id, domain_id: r.domain_id })),
  );
  for (const hit of hits) {
    await logRoutineCompletion(userId, hit.routineId, hit.completedOn, sample.id);
  }
  return hits.map((h) => h.routineId);
}

/** All completion logs at/after `sinceDate` (YYYY-MM-DD), for streak/history. */
export async function listCompletionsSince(userId: string, sinceDate: string): Promise<OpsRoutineLog[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_routine_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("completed_on", sinceDate)
    .order("completed_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OpsRoutineLog[];
}
