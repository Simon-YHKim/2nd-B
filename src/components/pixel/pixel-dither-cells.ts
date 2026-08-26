// SVG 안에서 쓰는 디더 — 밀도를 셀 목록으로 낸다.
//
// ## 왜 `PixelDither` 를 안 쓰는가
//
// `PixelDither.tsx` 는 RN `Image` 에 타일을 반복해 까는 방식이라 **`<Svg>` 안에서는
// 못 쓴다.** 별의 광채는 `<Svg>` 안 `<Pattern>` 이라 다른 기구가 필요하다.
// 같은 규율(알파 대신 하드에지 격자)을 SVG 쪽에서 구현한 것이 이 파일이다.
//
// ## 왜 4×4 인가
//
// 2×2 로는 밀도가 0/25/50/75/100 다섯 개뿐인데, 그중 0 은 안 보이는 것이라
// **쓸 수 있는 단이 넷**이다. 별 사다리는 L1~L5 **다섯 단**이라 한 칸이 모자란다.
// 4×4 로 올리면 16칸이라 다섯 단을 고르게 나눌 수 있다.
//
// ## 왜 베이어 배열인가
//
// 켜는 칸을 왼쪽부터 채우면 밀도가 오를 때 **덩어리**로 자란다(줄무늬가 보인다).
// 베이어 행렬은 다음 칸이 항상 가장 먼 자리에 놓이게 해서, 밀도가 올라도 눈에
// 패턴이 아니라 밝기로 읽힌다. 값은 표준 4×4 순서 디더 행렬이다.

/** 표준 4×4 베이어 순서 디더 행렬. 값이 낮을수록 먼저 켜진다. */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export const DITHER_TILE = 4;

/** 사다리 다섯 단이 켜는 칸 수 (16칸 중). 고르게 벌린 값이다. */
export const LADDER_ON_CELLS: readonly number[] = [3, 6, 9, 12, 16];

export interface DitherCell {
  x: number;
  y: number;
}

/**
 * `onCells` 개의 칸을 켠 4×4 디더의 셀 좌표.
 *
 * ⚠ 좌표는 타일 안의 정수 격자다(0..3). `patternUnits="userSpaceOnUse"` 와 함께
 *   써야 타일이 SVG 원점에 고정되고, 그래야 **별마다 격자가 어긋나지 않는다.**
 */
export function ditherCells(onCells: number): readonly DitherCell[] {
  const n = Math.max(0, Math.min(DITHER_TILE * DITHER_TILE, Math.round(onCells)));
  const out: DitherCell[] = [];
  for (let y = 0; y < DITHER_TILE; y++) {
    for (let x = 0; x < DITHER_TILE; x++) {
      if (BAYER_4X4[y][x] < n) out.push({ x, y });
    }
  }
  return out;
}

/**
 * 사다리 한 칸(1..5)이 켜는 셀 좌표.
 *
 * 범위 밖 값은 양끝으로 물린다 — 별 등급이 어긋나도 화면이 비지 않게.
 */
export function ladderDitherCells(level: number): readonly DitherCell[] {
  const idx = Math.max(0, Math.min(LADDER_ON_CELLS.length - 1, Math.round(level) - 1));
  return ditherCells(LADDER_ON_CELLS[idx]);
}
