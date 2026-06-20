// Self-understanding lens signal for recommend.ts (axis1 → axis2 engine bridge).
// The recommendation engine grounded only on the wiki snapshot + adherence; this
// adds the user's 7-star brightness (which self-aspect is strong vs being built)
// so a suggestion can lean into a lens they're growing. Same shape as the
// adherence signal: a compact TRUSTED fact line (the user's own deterministic
// state), no LLM, no new table, best-effort "".

import { getSupabaseClient } from "../supabase/client";
import { SELF_UNDERSTANDING_STARS, type StarId } from "../persona/stars";

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * Pure: one EN fact line (EN is the model anchor) naming the strongest and the
 * being-built lens, or "" when there is nothing to ground on (no data / all flat
 * at L1). Levels default to L1 when a star has no observation.
 */
export function lensSummaryLine(levels: Partial<Record<StarId, number>>): string {
  const rows = SELF_UNDERSTANDING_STARS.map((s) => ({ name: s.nameEn, level: clampLevel(levels[s.id] ?? 1) }));
  const max = Math.max(...rows.map((r) => r.level));
  const min = Math.min(...rows.map((r) => r.level));
  if (max <= 1) return ""; // nothing recorded yet → nothing to say
  const strongest = rows.find((r) => r.level === max);
  const building = rows.find((r) => r.level === min);
  if (!strongest || !building) return "";
  if (max === min) return `Self-understanding (L1-5): evenly at L${max} across lenses.`;
  return `Self-understanding (L1-5): strongest ${strongest.name}=L${strongest.level}; building ${building.name}=L${building.level}.`;
}

/** Best-effort: latest brightness level per star → the lens fact line. "" on failure. */
export async function gatherLensSignal(userId: string): Promise<string> {
  try {
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: true });
    const rows = (data ?? []) as Array<{ star_id: string; level: number; recorded_at: string }>;
    // later rows overwrite earlier → ends with the latest level per star
    const levels: Partial<Record<StarId, number>> = {};
    for (const r of rows) levels[r.star_id as StarId] = r.level;
    return lensSummaryLine(levels);
  } catch {
    return "";
  }
}
