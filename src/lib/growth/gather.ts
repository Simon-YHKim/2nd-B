// Weekly growth gather (impure). Reads the already-recorded data and feeds the
// pure synthesizer (weekly.ts). Best-effort: every read degrades to a safe
// default so the screen always renders. No new engine, no LLM.

import { getSupabaseClient } from "../supabase/client";
import { listCompletionsSince } from "../ops/routines";
import { listAllMilestones } from "../ops/milestones";
import { buildWeeklyGrowth, type StarObservation, type WeeklyGrowth } from "./weekly";

function dayKey(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function loadStarHistory(userId: string): Promise<StarObservation[]> {
  try {
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: true });
    return (data ?? []) as StarObservation[];
  } catch {
    return [];
  }
}

async function countRecordsSince(userId: string, sinceIso: string): Promise<number> {
  try {
    const { count } = await getSupabaseClient()
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sinceIso);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Gather + synthesize the weekly growth summary for the user. */
export async function gatherWeeklyGrowth(userId: string, now: Date = new Date(), windowDays = 7): Promise<WeeklyGrowth> {
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - windowDays);
  const sinceKey = dayKey(weekStart);
  const sinceIso = weekStart.toISOString();

  const [history, completions, milestones, recordsCount] = await Promise.all([
    loadStarHistory(userId),
    listCompletionsSince(userId, sinceKey).catch(() => []),
    listAllMilestones(userId).catch(() => []),
    countRecordsSince(userId, sinceIso),
  ]);

  const milestonesDoneThisWeek = milestones.filter(
    (m) => m.status === "done" && m.updated_at >= sinceIso,
  ).length;

  return buildWeeklyGrowth({
    history,
    completions: completions.map((c) => ({ completed_on: c.completed_on })),
    recordsCount,
    milestonesDoneThisWeek,
    now,
    windowDays,
  });
}
