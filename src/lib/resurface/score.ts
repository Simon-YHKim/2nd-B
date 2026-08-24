// 꺼내기 채점 — 원장(ledger.ts)을 사람별 신호로 바꾸는 순수 함수.
//
// LLM 없음(렌즈 관문 ③: 기존 원장으로 채점 가능해야 한다). 자율도 규율과
// 같은 어휘를 쓴다: 적중(hit) = 보여준 것을 승인, 빗나감(miss) = 보여준 것을
// 거절, 방치(ignored) = 보여줬는데 판정 없음.
//
// ⚠ 이 파일은 아직 plan.ts 의 순서에 **영향을 주지 않는다.** 개인화 파라미터를
// 지어내지 않기 위해서다 — 채점 데이터가 쌓인 뒤에, 어떤 신호가 순서를 바꿀
// 자격이 있는지(예: 연속 방치 N회 = 감쇠 가속) 그 데이터로 정한다.

import type { ResurfaceLedgerRow } from "./ledger";

export interface ResurfaceScore {
  /** 노출된 (from:to) 쌍 수. */
  shownPairs: number;
  /** 보여준 것을 승인한 쌍 수. */
  hits: number;
  /** 보여준 것을 거절한 쌍 수. */
  misses: number;
  /** 보여줬는데 판정이 없는 쌍 수 (파생값 — 이벤트가 아니다). */
  ignored: number;
}

/** 쌍 단위로 접는다: 노출 여부와 마지막 판정. */
export function scoreResurface(rows: readonly ResurfaceLedgerRow[]): ResurfaceScore {
  const byPair = new Map<string, { shown: boolean; decision: "ratified" | "rejected" | null }>();
  for (const r of rows) {
    const key = `${r.from_page}\u0000${r.to_page}`;
    const cur = byPair.get(key) ?? { shown: false, decision: null };
    if (r.event === "shown") cur.shown = true;
    else cur.decision = r.event;
    byPair.set(key, cur);
  }
  let shownPairs = 0;
  let hits = 0;
  let misses = 0;
  let ignored = 0;
  for (const v of byPair.values()) {
    if (!v.shown) continue; // 노출 없이 판정만 있으면(과거 데이터) 채점 밖
    shownPairs += 1;
    if (v.decision === "ratified") hits += 1;
    else if (v.decision === "rejected") misses += 1;
    else ignored += 1;
  }
  return { shownPairs, hits, misses, ignored };
}
