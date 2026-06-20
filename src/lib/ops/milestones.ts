// Milestones manage layer (O-R3 Wave 3): the gate-0 deterministic core of
// learning_goals + career_check. The user records goals/steps and tracks status;
// periodic AI reflection (recommend.ts) sits on top later. Manual structured
// input — no Gemini call here, no new C1/C9/C3 surface. $0. One module/table
// covers both domains (domain_id distinguishes).
//
// RLS owner-only (migration 0054). Pure helpers separated from the Supabase
// calls so they are node-testable, the same discipline as ops/routines.ts.

import { getSupabaseClient } from "../supabase/client";
import type { OpsDomainId } from "./domains";

export type MilestoneStatus = "todo" | "doing" | "done";

export interface Milestone {
  id: string;
  user_id: string;
  domain_id: string;
  title: string;
  status: MilestoneStatus;
  /** YYYY-MM-DD, or null when there is no due date. */
  target_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainProgress {
  done: number;
  total: number;
  /** done / total in 0..1; 0 when there are no milestones. */
  pct: number;
}

// --- pure helpers (node-testable, no Supabase) -------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local YYYY-MM-DD key. */
export function localDayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Overdue = has a target date strictly before today AND not done. */
export function milestoneOverdue(
  m: Pick<Milestone, "status" | "target_date">,
  now: Date = new Date(),
): boolean {
  if (m.status === "done" || !m.target_date) return false;
  return m.target_date < localDayKey(now);
}

/** done / total progress for a set of milestones (already scoped to one domain). */
export function domainProgress(milestones: ReadonlyArray<Pick<Milestone, "status">>): DomainProgress {
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === "done").length;
  return { done, total, pct: total === 0 ? 0 : done / total };
}

function rowToMilestone(row: Record<string, unknown>): Milestone {
  const status =
    row.status === "doing" || row.status === "done" ? (row.status as MilestoneStatus) : "todo";
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    domain_id: String(row.domain_id),
    title: String(row.title),
    status,
    target_date: (row.target_date as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// --- Supabase-backed queries (RLS owner-only) --------------------------

export interface NewMilestone {
  title: string;
  status?: MilestoneStatus;
  target_date?: string | null;
  note?: string | null;
}

/** Create a milestone in a domain (learning_goals / career_check). */
export async function createMilestone(
  userId: string,
  domainId: OpsDomainId,
  m: NewMilestone,
): Promise<Milestone> {
  const insert = {
    user_id: userId,
    domain_id: domainId,
    title: m.title.trim(),
    status: m.status ?? "todo",
    target_date: m.target_date ?? null,
    note: m.note?.trim() ? m.note.trim() : null,
    updated_at: new Date().toISOString(),
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("ops_milestones").insert(insert).select().single();
  if (error) throw error;
  return rowToMilestone(data as Record<string, unknown>);
}

/** All milestones in a domain, newest first. */
export async function listMilestones(userId: string, domainId: OpsDomainId): Promise<Milestone[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_milestones")
    .select("*")
    .eq("user_id", userId)
    .eq("domain_id", domainId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToMilestone(r as Record<string, unknown>));
}

/** Update a milestone's status and/or details. */
export async function updateMilestone(
  userId: string,
  id: string,
  patch: { status?: MilestoneStatus; title?: string; target_date?: string | null; note?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) update.status = patch.status;
  if (typeof patch.title === "string" && patch.title.trim()) update.title = patch.title.trim();
  if (patch.target_date !== undefined) update.target_date = patch.target_date;
  if (patch.note !== undefined) update.note = patch.note?.trim() ? patch.note.trim() : null;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("ops_milestones").update(update).eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

/** Remove a milestone. */
export async function deleteMilestone(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("ops_milestones").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
