// Self-understanding star signal for recommend.ts (axis1 -> axis2 engine bridge).
// The recommendation engine grounded only on the wiki snapshot + adherence; this
// adds the user's seven-star brightness (which self-knowing seat is strong vs
// being built) so a suggestion can lean into where they are growing. Same shape
// as the adherence signal: a compact TRUSTED fact line (the user's own
// deterministic state), no LLM, no new table, best-effort "".
//
// 2026-08-25: 옛 자기이해 축에서 **새 일곱**(seven-stars)으로 이관. 원장에서
// seven: 접두사 행만 읽고, 옛 축 행(rebuild 유산, 쓰기 중지됨)은 안 본다 --
// 홈에 없는 별의 이름이 추천 근거 문장에 들어가면 안 된다.

import { getSupabaseClient } from "../supabase/client";
import { parseTierKey } from "../persona/seven-tier-history";
import { SEVEN_STARS, type SevenStarId } from "../persona/seven-stars";

// EN is the model anchor (the fact line goes into an English prompt). 홈의
// 사용자 표기(ds.star.*)와 별개인 프롬프트용 라벨이라 코드 상수가 맞다.
const EN_NAME: Record<SevenStarId, string> = {
  profile: "Profile",
  infancy: "Early childhood",
  school: "School years",
  twenties: "Twenties",
  later: "Thirties and after",
  work: "Work",
  now: "Now",
};

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * Pure: one EN fact line naming the strongest and the being-built star, or ""
 * when there is nothing to ground on (no data / all flat at L1). Levels default
 * to L1 when a star has no observation.
 */
export function lensSummaryLine(levels: Partial<Record<SevenStarId, number>>): string {
  const rows = SEVEN_STARS.map((s) => ({ name: EN_NAME[s.id], level: clampLevel(levels[s.id] ?? 1) }));
  const max = Math.max(...rows.map((r) => r.level));
  const min = Math.min(...rows.map((r) => r.level));
  if (max <= 1) return ""; // nothing recorded yet -> nothing to say
  const strongest = rows.find((r) => r.level === max);
  const building = rows.find((r) => r.level === min);
  if (!strongest || !building) return "";
  if (max === min) return `Self-understanding (L1-5): evenly at L${max} across stars.`;
  return `Self-understanding (L1-5): strongest ${strongest.name}=L${strongest.level}; building ${building.name}=L${building.level}.`;
}

/** Best-effort: latest brightness level per star -> the fact line. "" on failure. */
export async function gatherLensSignal(userId: string): Promise<string> {
  try {
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at")
      .eq("user_id", userId)
      .like("star_id", "seven:%")
      .order("recorded_at", { ascending: true });
    const rows = (data ?? []) as Array<{ star_id: string; level: number; recorded_at: string }>;
    // later rows overwrite earlier -> ends with the latest level per star.
    // parseTierKey 로 갈라 읽는다 -- 무검사 캐스팅은 유령 키를 만든다.
    const levels: Partial<Record<SevenStarId, number>> = {};
    for (const r of rows) {
      const id = parseTierKey(r.star_id);
      if (id) levels[id] = r.level;
    }
    return lensSummaryLine(levels);
  } catch {
    return "";
  }
}
