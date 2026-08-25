// 계단 이징 — PIXEL-CLAY 절대 규칙 5.
//
// 이 검사가 지키는 것은 하나다: **애니메이션이 목표값에 닿는다.**
// 이징이 t=1 에서 1 을 안 돌려주면 화면은 안 죽고, 예외도 안 나고, 그냥
// 무언가가 영원히 도착하지 않는다. 눈으로 찾기 가장 어려운 종류의 버그다.
import { pixelSteps, PIXEL_STEP } from "../pixel-physical";

describe("pixelSteps — CSS steps(n, end) 와 같은 모양", () => {
  it("끝점이 정확하다 (t=0 → 0, t=1 → 1)", () => {
    for (const n of [1, 2, 3, 6, 12]) {
      const e = pixelSteps(n);
      expect(e(0)).toBe(0);
      expect(e(1)).toBe(1);
    }
  });

  it("구간 **끝에서** 값이 바뀐다 (end 방향 = floor)", () => {
    const e = pixelSteps(2);
    expect(e(0.0)).toBe(0);
    expect(e(0.49)).toBe(0); // 첫 칸 안 — 아직 0
    expect(e(0.5)).toBe(0.5); // 경계에서 올라간다
    expect(e(0.99)).toBe(0.5);
    expect(e(1)).toBe(1);
  });

  it("칸 수만큼만 서로 다른 값을 낸다", () => {
    for (const n of [2, 3, 6]) {
      const e = pixelSteps(n);
      const seen = new Set<number>();
      for (let i = 0; i <= 1000; i++) seen.add(e(i / 1000));
      // 0 부터 (n-1)/n 까지 n 개 + 끝의 1 = n+1
      expect(seen.size).toBe(n + 1);
    }
  });

  it("단조 증가한다 — 되돌아가는 칸이 없다", () => {
    const e = pixelSteps(6);
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const v = e(i / 1000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("범위 밖 입력에도 0..1 을 지킨다", () => {
    const e = pixelSteps(3);
    expect(e(-0.5)).toBe(0);
    expect(e(1.5)).toBe(1);
  });

  it("n 이 0 이하여도 죽지 않는다 (1칸으로 클램프)", () => {
    for (const bad of [0, -3, 0.4]) {
      const e = pixelSteps(bad);
      expect(e(0)).toBe(0);
      expect(e(0.5)).toBe(0);
      expect(e(1)).toBe(1);
    }
  });
});

describe("PIXEL_STEP — 레퍼런스 사다리 그대로", () => {
  it("지속시간과 칸수가 캐논과 같다", () => {
    // design/pixel_clay_260825/data/tokens.json:
    //   --step-1 = 60ms steps(2,end) · --step-2 = 120ms steps(3,end)
    //   --step-3 = 240ms steps(6,end)
    expect(PIXEL_STEP.fast.duration).toBe(60);
    expect(PIXEL_STEP.base.duration).toBe(120);
    expect(PIXEL_STEP.slow.duration).toBe(240);
  });

  it("각 칸이 자기 칸수만큼 끊는다", () => {
    const distinct = (e: (t: number) => number) => {
      const s = new Set<number>();
      for (let i = 0; i <= 1000; i++) s.add(e(i / 1000));
      return s.size - 1; // 끝의 1 을 뺀다
    };
    expect(distinct(PIXEL_STEP.fast.easing)).toBe(2);
    expect(distinct(PIXEL_STEP.base.easing)).toBe(3);
    expect(distinct(PIXEL_STEP.slow.easing)).toBe(6);
  });

  it("세 칸 다 목표값에 닿는다", () => {
    for (const k of ["fast", "base", "slow"] as const) {
      expect(PIXEL_STEP[k].easing(1)).toBe(1);
    }
  });
});
