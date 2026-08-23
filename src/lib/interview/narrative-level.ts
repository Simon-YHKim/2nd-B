// Map interview Coverage to the star2 (회상 / narrative) ladder level, so the
// confidence-based drill-stop rule can consume a level for the narrative axis.
// Mirrors the CONTEXT.md value ladder as a data-quality signal: more covered
// cells => a higher level. Pure, lean v1 (no IRT, per D3); L5 is never
// auto-derived from coverage (ratification is the only path to L5, per the
// propose -> ratify loop).
//
// ⚠ 2026-08-24 — **분모가 25 고정이 아니게 됐다.**
//
// 예전 이 파일은 "25칸 = 5시기 × 5층" 을 상수로 박고 12칸 이상이면 L4 라고 했다.
// 시기가 사용자 나이에서 만들어지도록 바뀌면서(Simon 결정, `periods.ts`) 그 분모는
// 사람마다 달라졌다 -- 스물다섯 살은 4시기 20칸, 마흔여섯 살은 6시기 30칸이다.
// 25 를 그대로 뒀다면 젊은 사용자는 **채울 수 없는 칸 때문에 영영 L4 에 못 닿는다.**
//
// 그래서 절대 개수가 아니라 **비율**로 잰다. 경계는 옛 값에서 그대로 옮겼다:
// 12/25 = 0.48, 5/25 = 0.20. 즉 기존 5시기 사용자에게는 판정이 바뀌지 않는다.
//
// `periods` 를 **필수 인자로** 둔 것도 일부러다. 기본값을 주면 호출부가 옛 가정을
// 그대로 물려받고, 그건 조용히 틀린다. 이 함수는 아직 호출부가 없다 -- 등급 배선은
// 다음 작업이고, 그때 이 인자가 "누구의 시기인지"를 반드시 말하게 만든다.

import type { LadderLevel } from "../persona/brightness";
import { DRILL_LAYERS, type Coverage, type LifePeriod } from "./probe";

/** L4 문턱 (해당되는 칸 대비). 12/25 에서 옮김. */
export const L4_FILL_RATIO = 0.48;
/** L3 문턱 (해당되는 칸 대비). 5/25 에서 옮김. */
export const L3_FILL_RATIO = 0.2;

/** `periods` 안에서 답이 하나라도 들어간 칸 수. 해당 없는 시기는 세지 않는다. */
export function cellsCoveredIn(coverage: Coverage, periods: readonly LifePeriod[]): number {
  let n = 0;
  for (const p of periods) for (const l of DRILL_LAYERS) if (coverage[p][l] > 0) n += 1;
  return n;
}

/**
 * @param periods 이 사용자에게 **해당되는** 시기. `periodIdsForAge()` 가 만든다.
 *                살지 않은 시기를 넣으면 분모가 부풀어 등급이 낮게 나온다.
 */
export function narrativeStarLevel(
  coverage: Coverage,
  periods: readonly LifePeriod[],
): LadderLevel {
  const total = periods.length * DRILL_LAYERS.length;
  if (total <= 0) return 1;
  const cells = cellsCoveredIn(coverage, periods);
  if (cells <= 0) return 1; // L1: nothing gathered yet
  const ratio = cells / total;
  if (ratio >= L4_FILL_RATIO) return 4; // L4: broad cross-period / cross-layer coverage
  if (ratio >= L3_FILL_RATIO) return 3; // L3: connected across several cells
  return 2; // L2: a few tagged answers
}
