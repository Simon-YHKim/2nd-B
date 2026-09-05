// 세컨비 실루엣 데이터가 번들 원본(px-primitives SbHead / sbHeadURI)과 같은지 지킨다.
// 좌표를 바꾸면 세컨비가 아니다. 렌더 없이 좌표만 검사한다.

import {
  SECONDB_EYES,
  SECONDB_FACE,
  SECONDB_GRID,
  SECONDB_MOUTH,
  SECONDB_VISOR,
  secondbHullRects,
  snapHeadSize,
  type HullPalette,
} from "../secondb-hull";

const P: HullPalette = { hull: "hull", hullDark: "dark", hullLight: "light", visor: "visor", antenna: "mood" };

describe("secondbHullRects: 번들 sbHeadURI(blank) 와 같은 11개 rect", () => {
  const R = secondbHullRects(P);

  test("개수와 순서 (안테나2 정수리2 머리통1 포드2 바이저1 턱3)", () => {
    expect(R).toHaveLength(11);
    expect(R.map((r) => r.slice(0, 4))).toEqual([
      [7, 0, 2, 1], [7, 1, 2, 1],
      [4, 2, 8, 1], [3, 3, 10, 1],
      [2, 4, 12, 7],
      [1, 5, 1, 4], [14, 5, 1, 4],
      [3, 5, 10, 5],
      [3, 11, 10, 1], [4, 12, 8, 1], [5, 13, 6, 1],
    ]);
  });

  test("색은 자리마다 팔레트에서 온다", () => {
    expect(R[0][4]).toBe("mood");
    expect(R[1][4]).toBe("light");
    expect(R[4][4]).toBe("hull");
    expect(R[5][4]).toBe("dark");
    expect(R[7][4]).toBe("visor");
  });

  test("모든 셀은 정수이고 16 격자 안에 있다", () => {
    for (const [x, y, w, h] of R) {
      expect([x, y, w, h].every(Number.isInteger)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(SECONDB_GRID);
      expect(y + h).toBeLessThanOrEqual(SECONDB_GRID);
    }
  });
});

describe("얼굴 자리는 바이저 안이다", () => {
  test("눈 두 개는 바이저 안, 입은 바이저 바로 아래 몸통 행이다 (번들 원본의 배치)", () => {
    const inVisor = (x: number, y: number, w: number, h: number) =>
      x >= SECONDB_VISOR.x && y >= SECONDB_VISOR.y && x + w <= SECONDB_VISOR.x + SECONDB_VISOR.w && y + h <= SECONDB_VISOR.y + SECONDB_VISOR.h;
    expect(inVisor(SECONDB_EYES.leftX, SECONDB_EYES.top, SECONDB_EYES.w, SECONDB_EYES.h)).toBe(true);
    expect(inVisor(SECONDB_EYES.rightX, SECONDB_EYES.top, SECONDB_EYES.w, SECONDB_EYES.h)).toBe(true);
    // sbHeadURI: 바이저 (3,5,10,5) 는 5..9행이고 입 (6,10,4,1) 은 그 바로 아래 10행에
    // 그려진다. 그래서 RN 의 옛 입 위치 0.655 가 10.5/16 과 맞아떨어졌다.
    expect(SECONDB_MOUTH.y).toBe(SECONDB_VISOR.y + SECONDB_VISOR.h);
    expect(SECONDB_MOUTH.x).toBeGreaterThanOrEqual(SECONDB_VISOR.x);
    expect(SECONDB_MOUTH.x + SECONDB_MOUTH.w).toBeLessThanOrEqual(SECONDB_VISOR.x + SECONDB_VISOR.w);
  });

  test("분율은 격자에서 계산된다 (눈 중심 5/16, 11/16)", () => {
    expect(SECONDB_FACE.eyeCx).toEqual([5 / 16, 11 / 16]);
    expect(SECONDB_FACE.eyeTop).toBe(6 / 16);
    expect(SECONDB_FACE.eyeW).toBe(2 / 16);
    expect(SECONDB_FACE.mouthCy).toBe(10.5 / 16);
  });
});

describe("snapHeadSize: 16 배수로 내림, 최소 16", () => {
  test.each([
    [72, 64],
    [48, 48],
    [158, 144],
    [92, 80],
    [16, 16],
    [10, 16],
  ])("%i -> %i", (input, expected) => {
    expect(snapHeadSize(input)).toBe(expected);
  });
});
