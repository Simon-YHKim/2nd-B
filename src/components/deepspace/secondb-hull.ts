// 세컨비 머리 실루엣: PIXEL-CLAY 번들(design/pixel_clay_260825/app-offline.html, 모듈
// px-primitives)의 `SbHead` / `sbHeadURI` 16x16 rect 스프라이트를 그대로 옮긴 데이터.
//
// 왜 데이터 모듈인가: SecondbHead.tsx 는 얼굴(눈·입·깜빡임·시선)을 RN 애니메이션으로
// 그리고, 이 모듈은 그 아래 깔리는 **얼굴 없는 몸통**(번들의 `head-blank`)만 준다.
// 색은 인자로 받는다: 컴포넌트가 토큰(borderHi/border/onSurfaceVariant/visor/mood*)을
// 넣고, 이 파일은 좌표만 안다. 그래서 렌더 없이도 좌표를 검사할 수 있다
// (secondb-hull.test.ts). 좌표는 번들 원본과 문자 그대로 같다: 바꾸면 세컨비가 아니다.
//
// 격자 규율(PIXEL-CLAY): 셀은 정수, 표시 크기는 16 의 배수로 스냅한다. 72px 상자에
// 16 격자를 그대로 늘리면 셀이 4.5px 이 되어 웹에서 셀마다 4/5px 로 흔들린다.

export const SECONDB_GRID = 16;

export interface HullPalette {
  /** 머리통·정수리·턱 (캐논 c03) */
  hull: string;
  /** 사이드 포드·아래턱 (캐논 c02) */
  hullDark: string;
  /** 정수리 하이라이트·안테나 기둥 (캐논 c04) */
  hullLight: string;
  /** 바이저 (얼굴이 그려지는 검은 화면) */
  visor: string;
  /** 안테나 끝: 무드 색 */
  antenna: string;
}

/** [x, y, w, h, fill] in 16-grid cells. */
export type HullRect = readonly [x: number, y: number, w: number, h: number, fill: string];

/** 바이저 (5..9행): 눈은 이 안에, 입은 바로 아래 10행(몸통 띠)에 그린다. 번들 원본의 배치다. */
export const SECONDB_VISOR = { x: 3, y: 5, w: 10, h: 5 } as const;

/** 번들 SbHead 의 neutral 눈: 왼쪽 x=4, 오른쪽 x=10, 위 y=6, 2x3 셀. 시선은 1 셀 스냅. */
export const SECONDB_EYES = { leftX: 4, rightX: 10, top: 6, w: 2, h: 3 } as const;

/** 번들 SbHead 의 neutral 입: (6,10) 부터 4 셀. */
export const SECONDB_MOUTH = { x: 6, y: 10, w: 4 } as const;

/**
 * 얼굴 없는 몸통 11개 rect (번들 `sbHeadURI(..., blank=true)` 순서 그대로).
 * 안테나 2 · 정수리 2 · 머리통 1 · 사이드 포드 2 · 바이저 1 · 턱 3.
 */
export function secondbHullRects(p: HullPalette): HullRect[] {
  const R: HullRect[] = [];
  const add = (x: number, y: number, w: number, h: number, fill: string) => R.push([x, y, w, h, fill]);
  add(7, 0, 2, 1, p.antenna); add(7, 1, 2, 1, p.hullLight); /* 안테나 */
  add(4, 2, 8, 1, p.hullLight); add(3, 3, 10, 1, p.hull); /* 정수리 */
  add(2, 4, 12, 7, p.hull); /* 머리통 */
  add(1, 5, 1, 4, p.hullDark); add(14, 5, 1, 4, p.hullDark); /* 사이드 포드 */
  add(SECONDB_VISOR.x, SECONDB_VISOR.y, SECONDB_VISOR.w, SECONDB_VISOR.h, p.visor); /* 바이저 */
  add(3, 11, 10, 1, p.hull); add(4, 12, 8, 1, p.hullDark); /* 턱 */
  add(5, 13, 6, 1, p.hullDark);
  return R;
}

/**
 * RN 오버레이가 쓰는 얼굴 자리, 머리 상자 크기에 대한 0..1 분율.
 * 전에는 3D 렌더 PNG 의 바이저에 맞춘 상수(눈 cx 0.385/0.615)였다. 이제 격자다.
 */
export const SECONDB_FACE = {
  eyeCx: [(SECONDB_EYES.leftX + SECONDB_EYES.w / 2) / SECONDB_GRID, (SECONDB_EYES.rightX + SECONDB_EYES.w / 2) / SECONDB_GRID] as const,
  eyeTop: SECONDB_EYES.top / SECONDB_GRID,
  eyeW: SECONDB_EYES.w / SECONDB_GRID,
  eyeH: SECONDB_EYES.h / SECONDB_GRID,
  mouthCy: (SECONDB_MOUTH.y + 0.5) / SECONDB_GRID,
  mouthW: SECONDB_MOUTH.w / SECONDB_GRID,
} as const;

/** 표시 크기를 16 의 배수로 내림 스냅한다 (상자보다 커지지 않게). 최소 16. */
export function snapHeadSize(size: number): number {
  return Math.max(SECONDB_GRID, Math.floor(size / SECONDB_GRID) * SECONDB_GRID);
}
