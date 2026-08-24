// Weekly growth gather (impure). Reads the already-recorded data and feeds the
// pure synthesizer (weekly.ts). Best-effort: every read degrades to a safe
// default so the screen always renders. No new engine, no LLM.

import { getSupabaseClient } from "../supabase/client";
import { parseTierKey } from "../persona/seven-tier-history";
import { listCompletionsSince } from "../ops/routines";
import { listAllMilestones } from "../ops/milestones";
import { buildWeeklyGrowth, type StarObservation, type WeeklyGrowth } from "./weekly";

function dayKey(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function loadStarHistory(userId: string): Promise<StarObservation[]> {
  try {
    // 2026-08-25: /growth 는 새 일곱만 본다. 옛 축 행(rebuild 945건, 같은 PR
    // 에서 쓰기 중지)은 홈에 없는 별들이라 여기 나오면 사용자가 모르는 이름의
    // 변화를 읽게 된다. 접두사는 질의에서 거르고, 넘기기 전에 벗긴다 --
    // weekly.ts 는 순수 층이라 원장 표기법을 몰라야 한다.
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at")
      .eq("user_id", userId)
      .like("star_id", "seven:%")
      .order("recorded_at", { ascending: true });
    const rows = (data ?? []) as StarObservation[];
    const out: StarObservation[] = [];
    for (const r of rows) {
      const id = parseTierKey(r.star_id);
      if (id) out.push({ ...r, star_id: id });
    }
    return out;
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
