// 인터뷰가 판 자리를 세션 너머로 남긴다 (0143).
//
// 이게 없어서 등급이 못 붙어 있었다. `probe.ts` 가 (시기 × 층) 행렬을 세고
// `narrative-level.ts` 가 그걸 등급으로 옮기는데, 행렬이 **화면 상태로만** 살아서
// 나갔다 들어오면 0으로 돌아갔다. 남길 데가 없으니 매길 것도 없었다.
//
// ⚠ 두 함수 다 **fail-soft** 다. 저장이 실패해도 대화는 끝나야 하고, 읽기가
// 실패하면 등급은 그냥 낮게 나온다 -- 어느 쪽도 사용자를 막지 않는다. 밝기는
// 부풀면 거짓말이고 덜 차면 그냥 덜 찬 것이다(같은 원칙이 여기서도 방향을 정한다).

import { getSupabaseClient } from "../supabase/client";
import {
  DRILL_LAYERS,
  LIFE_PERIODS,
  emptyCoverage,
  type Coverage,
  type DrillLayer,
  type LifePeriod,
} from "./probe";

const TABLE = "interview_coverage";

function isPeriod(v: string): v is LifePeriod {
  return (LIFE_PERIODS as readonly string[]).includes(v);
}
function isLayer(v: string): v is DrillLayer {
  return (DRILL_LAYERS as readonly string[]).includes(v);
}

/**
 * 이 사용자가 지금까지 판 칸 전부. 실패하면 빈 행렬 -- **막지 않는다.**
 *
 * 모르는 시기·층 이름은 조용히 버린다. union 이 늘어난 뒤 옛 행이 남아 있거나
 * 그 반대일 수 있는데, 그때 던지면 화면이 통째로 죽는다. 등급이 조금 낮게
 * 나오는 쪽이 낫다.
 */
export async function loadCoverage(userId: string): Promise<Coverage> {
  const cov = emptyCoverage();
  if (!userId) return cov;
  try {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select("period, layer, answers")
      .eq("user_id", userId);
    if (error || !data) return cov;
    for (const row of data as { period: string; layer: string; answers: number }[]) {
      if (!isPeriod(row.period) || !isLayer(row.layer)) continue;
      const n = Number(row.answers);
      if (!Number.isFinite(n) || n <= 0) continue;
      cov[row.period][row.layer] = n;
    }
    return cov;
  } catch {
    return cov;
  }
}

/**
 * 이번 세션이 판 칸을 더한다. `delta` 는 **이번 대화에서 올라간 만큼**이고,
 * 저장된 값에 얹는다(덮어쓰지 않는다) -- 여러 기기·여러 세션이 각자 판 것을
 * 서로 지우면 안 된다.
 *
 * 0 인 칸은 보내지 않는다. 빈 행을 만들 이유가 없고, 그 편이 payload 도 작다.
 */
export async function addCoverage(userId: string, delta: Coverage): Promise<void> {
  if (!userId) return;
  const rows: { user_id: string; period: string; layer: string; answers: number }[] = [];
  const stored = await loadCoverage(userId);
  for (const p of LIFE_PERIODS) {
    for (const l of DRILL_LAYERS) {
      const add = delta[p][l];
      if (!Number.isFinite(add) || add <= 0) continue;
      rows.push({ user_id: userId, period: p, layer: l, answers: stored[p][l] + add });
    }
  }
  if (rows.length === 0) return;
  try {
    await getSupabaseClient()
      .from(TABLE)
      .upsert(rows, { onConflict: "user_id,period,layer" });
  } catch {
    // 저장이 안 돼도 대화는 끝나야 한다. 다음 세션이 다시 더할 뿐이다.
  }
}
