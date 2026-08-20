// 별 모양이 실제로 "4 방향으로 빛나는 별"인지, 그리고 PIXEL-CLAY 규칙 1(정수
// rect)을 지키는지 본다. 렌더 테스트는 이 저장소에서 막혀 있으므로(RN 0.85 +
// jest) 도형을 좌표로 검사한다 — 도형 자체가 순수 함수라 그게 가능하다.
import { pixelStarRects, pixelStarSpan } from "../pixel-star";

// 아주 작은 별부터 북극성 크기까지. 3 은 반올림이 뭉개지기 시작하는 지점이라
// 일부러 포함했다.
const RADII = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 17, 22, 30, 48];

describe("pixelStarRects — 규칙 1: 정수 좌표 rect", () => {
  it.each(RADII)("radius %d 의 모든 좌표가 정수다", (r) => {
    for (const rect of pixelStarRects(r)) {
      expect(Number.isInteger(rect.x)).toBe(true);
      expect(Number.isInteger(rect.y)).toBe(true);
      expect(Number.isInteger(rect.w)).toBe(true);
      expect(Number.isInteger(rect.h)).toBe(true);
    }
  });

  it.each(RADII)("radius %d 이 좌우·상하 대칭이다", (r) => {
    for (const rect of pixelStarRects(r)) {
      // 중심이 (0,0) 이므로 x + w/2 === 0 이어야 대칭이다.
      expect(rect.x + rect.w / 2).toBe(0);
      expect(rect.y + rect.h / 2).toBe(0);
    }
  });

  it("빈 rect 를 내지 않는다 (radius 가 아무리 작아도)", () => {
    for (let r = 1; r <= 60; r += 1) {
      for (const rect of pixelStarRects(r)) {
        expect(rect.w).toBeGreaterThan(0);
        expect(rect.h).toBeGreaterThan(0);
      }
    }
  });
});

describe("pixelStarRects — 별 모양", () => {
  // 이게 이 테스트의 핵심이다. Simon 의 조건은 "그냥 네모"가 아니라 "별 모양,
  // 4 방향으로 빛나는" 이었다. 사각형 하나로 되돌아가면 여기서 깨진다.
  it.each(RADII)("radius %d 이 4 방향으로 뻗는다 (정사각형이 아니다)", (r) => {
    const [vertical, horizontal, midV, midH] = pixelStarRects(r);

    // 광선은 뻗는 방향으로 길고 가로지르는 방향으로 얇다.
    expect(vertical.h).toBeGreaterThan(vertical.w);
    expect(horizontal.w).toBeGreaterThan(horizontal.h);

    // 광선이 중간 십자 **밖으로** 나가야 "빛난다"고 보인다. 안에 갇히면
    // 그냥 두꺼운 십자다.
    expect(vertical.h / 2).toBeGreaterThan(midV.h / 2);
    expect(horizontal.w / 2).toBeGreaterThan(midH.w / 2);

    // 그리고 중간 십자는 광선보다 두꺼워야 가운데가 밝아 보인다.
    expect(midV.w).toBeGreaterThan(vertical.w);
    expect(midH.h).toBeGreaterThan(horizontal.h);
  });

  it.each(RADII)("radius %d 의 네 방향 광선 길이가 같다", (r) => {
    const [vertical, horizontal] = pixelStarRects(r);
    expect(vertical.h).toBe(horizontal.w);
  });

  it("네 귀퉁이는 비어 있다 (별의 오목한 부분)", () => {
    const rects = pixelStarRects(24);
    const covers = (x: number, y: number) =>
      rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    // 대각선 끝 — 원이나 사각형이면 채워지지만 별이면 비어 있다.
    expect(covers(20, 20)).toBe(false);
    expect(covers(-20, 20)).toBe(false);
    // 중심과 광선 끝은 당연히 채워져 있다.
    expect(covers(0, 0)).toBe(true);
    expect(covers(0, 20)).toBe(true);
    expect(covers(20, 0)).toBe(true);
  });
});

describe("pixelStarSpan — 서열 비교용", () => {
  it("반경이 커지면 span 도 커진다 (같거나 커지되 줄지 않는다)", () => {
    let prev = 0;
    for (let r = 1; r <= 60; r += 1) {
      const span = pixelStarSpan(r);
      expect(span).toBeGreaterThanOrEqual(prev);
      prev = span;
    }
  });

  it("span 이 요청한 반경에서 1px 넘게 벗어나지 않는다", () => {
    for (const r of RADII) {
      expect(Math.abs(pixelStarSpan(r) - r)).toBeLessThanOrEqual(1);
    }
  });
});
