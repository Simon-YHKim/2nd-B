// 꺼내기 슬롯 — 무엇을 다시 보여줄지 정하는 자리.
//
// 이 렌즈만 `slot: "todo"` 였다. 자리가 없어서가 아니라 **결정이 없어서**였다:
// `/digest` 는 이미 다시 보여주는 화면인데 `confidence DESC` 로 50개를 그냥 쏟았다.
// 고정 규칙은 결정이 아니다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RESURFACE_MAX,
  RESURFACE_HALFLIFE_DAYS,
  pendingDecay,
  planResurface,
  type ResurfaceCandidate,
} from "../plan";

const NOW = new Date("2026-08-24T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const SCREEN = readFileSync(
  join(__dirname, "..", "..", "..", "app", "digest.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("순서를 정한다", () => {
  it("신뢰도가 높은 쪽이 먼저다 (같은 시점이면)", () => {
    const c: ResurfaceCandidate[] = [
      { key: "low", confidence: 0.3, createdAt: daysAgo(0) },
      { key: "high", confidence: 0.9, createdAt: daysAgo(0) },
    ];
    expect(planResurface(c, NOW).resurfaceOrder).toEqual(["high", "low"]);
  });

  it("⚠ 오래 매달린 것은 자리를 내준다 (이 슬롯의 요점)", () => {
    // 신뢰도만 보면 stale 이 이긴다. 그러면 매일 같은 것을 보게 된다.
    const c: ResurfaceCandidate[] = [
      { key: "stale", confidence: 0.9, createdAt: daysAgo(120) },
      { key: "fresh", confidence: 0.5, createdAt: daysAgo(0) },
    ];
    expect(planResurface(c, NOW).resurfaceOrder).toEqual(["fresh", "stale"]);
  });

  it("사라지지는 않는다 — 자리만 내준다", () => {
    const c: ResurfaceCandidate[] = [
      { key: "ancient", confidence: 0.9, createdAt: daysAgo(3650) },
      { key: "new", confidence: 0.9, createdAt: daysAgo(0) },
    ];
    const plan = planResurface(c, NOW);
    expect(plan.resurfaceOrder).toContain("ancient");
    expect(plan.resurfaceOrder[0]).toBe("new");
  });

  it("동점이면 들어온 순서를 지킨다 (결정론적)", () => {
    const c: ResurfaceCandidate[] = [
      { key: "a", confidence: 0.5, createdAt: daysAgo(1) },
      { key: "b", confidence: 0.5, createdAt: daysAgo(1) },
      { key: "c", confidence: 0.5, createdAt: daysAgo(1) },
    ];
    expect(planResurface(c, NOW).resurfaceOrder).toEqual(["a", "b", "c"]);
    // 같은 입력이면 같은 출력 -- "왜 이게 위에 있나" 에 답할 수 있어야 한다.
    expect(planResurface(c, NOW)).toEqual(planResurface(c, NOW));
  });
});

describe("한 번에 몇 개를 띄우나", () => {
  it("상한이 5 다 (50개는 검토가 아니라 노역이다)", () => {
    expect(RESURFACE_MAX).toBe(5);
  });

  it("후보가 많아도 상한까지만 띄운다", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      key: `k${i}`, confidence: 0.5, createdAt: daysAgo(1),
    }));
    const plan = planResurface(many, NOW);
    expect(plan.shown).toBe(RESURFACE_MAX);
    // 순서는 전부 갖고 있되 띄우는 수만 줄인다 -- 나머지는 다음에 온다.
    expect(plan.resurfaceOrder).toHaveLength(40);
  });

  it("후보가 적으면 있는 만큼만", () => {
    expect(planResurface([{ key: "a", confidence: 1 }], NOW).shown).toBe(1);
    expect(planResurface([], NOW).shown).toBe(0);
  });
});

describe("감쇠 곡선", () => {
  it("반감기에 정확히 절반", () => {
    expect(pendingDecay(RESURFACE_HALFLIFE_DAYS)).toBeCloseTo(0.5, 6);
  });

  it("갓 온 것은 깎이지 않는다", () => {
    expect(pendingDecay(0)).toBe(1);
    expect(pendingDecay(-5)).toBe(1);
  });

  it("0 이 되지 않는다 (사라지게 하지 않는다)", () => {
    expect(pendingDecay(100000)).toBeGreaterThan(0);
  });

  it("단조 감소한다", () => {
    let prev = Infinity;
    for (const d of [0, 1, 7, 14, 30, 90, 365]) {
      const v = pendingDecay(d);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("망가진 입력에 던지지 않는다", () => {
  it("createdAt 이 없거나 이상하면 방금 온 것으로 본다", () => {
    expect(planResurface([{ key: "a", confidence: 1 }], NOW).resurfaceOrder).toEqual(["a"]);
    expect(planResurface([{ key: "a", confidence: 1, createdAt: "쓰레기" }], NOW).resurfaceOrder).toEqual(["a"]);
    expect(planResurface([{ key: "a", confidence: 1, createdAt: null }], NOW).resurfaceOrder).toEqual(["a"]);
  });

  it("confidence 가 숫자가 아니면 0 으로 본다", () => {
    const c = [
      { key: "bad", confidence: Number.NaN, createdAt: daysAgo(0) },
      { key: "ok", confidence: 0.1, createdAt: daysAgo(0) },
    ];
    expect(planResurface(c, NOW).resurfaceOrder[0]).toBe("ok");
  });

  it("빈 키는 버린다", () => {
    const c = [{ key: "", confidence: 1 }, { key: "a", confidence: 0.1 }];
    expect(planResurface(c as ResurfaceCandidate[], NOW).resurfaceOrder).toEqual(["a"]);
  });
});

describe("화면이 그 결정을 실제로 쓴다", () => {
  it("/digest 가 planResurface 로 순서를 정한다", () => {
    expect(SCREEN).toContain('import { planResurface } from "@/lib/resurface/plan"');
    expect(SCREEN).toContain("planResurface(");
    expect(SCREEN).toContain("plan.resurfaceOrder");
  });

  it("띄우는 수를 계획에서 가져온다 (화면이 따로 정하지 않는다)", () => {
    expect(SCREEN).toContain("slice(0, plan.shown)");
  });

  it("정렬된 목록을 그린다 (원본을 그대로 넘기지 않는다)", () => {
    // `setItems(rows)` 로 되돌아가면 이 슬롯은 다시 죽는다.
    expect(SCREEN).toContain("setItems(ordered)");
    expect(SCREEN).not.toContain("setItems(rows)");
  });
});
