// 픽셀 글리프 정본 — PIXEL-CLAY 절대 규칙 1(정수 rect 만).
//
// ── 왜 배열이고, 왜 여기 하나인가 ──────────────────────────────────────────
//
// 이 저장소는 같은 아이콘을 **두 가지 방법으로** 그리고 있었다:
//
//   (a) JSX  — `<Path d="M12 3c.5 3.8…"/>`  (DeepSpaceDock 의 TabIcon)
//   (b) 문자열 — `'<path d="M12 3c…"/>'` 를 SvgXml 에 넘김 (shell/SbIcon 의 레지스트리)
//
// 그래서 `<Path` 로 grep 하면 (b)가 통째로 안 잡힌다 — 규칙 1 위반을 135건으로
// 세었는데 문자열 마크업까지 세면 **304건**이었다(2026-08-26 실측). 게다가
// star_shine · add_circle · forum · inventory_2 · tune 다섯은 두 곳에 **글자까지
// 같은 두 벌**로 있었다.
//
// 그래서 좌표를 **데이터로** 한 곳에 둔다. JSX 쪽은 `<Rect>` 로 그리고, 문자열 쪽은
// 같은 배열을 직렬화한다. 아이콘을 고치는 자리가 하나가 된다.
//
// ── 격자 ──────────────────────────────────────────────────────────────────
//
// viewBox 24 · 셀 2. **모든 좌표가 짝수**여야 한다 — 렌더 크기가 24 의 정수배일 때
// 셀이 기기 픽셀에 정확히 떨어지고, 그래야 계단이 흐려지지 않는다(규칙 1의 목적).
// 홀수 좌표를 쓰면 안티에일리어싱이 생기고, 그건 규칙 3이 금지한 흐림과 같다.

import { pixelStarRects, type PixelRect } from "./pixel-star";

export type { PixelRect };

/** viewBox 한 변. 렌더 크기는 이 값의 정수배여야 격자가 픽셀에 떨어진다. */
export const GLYPH_BOX = 24;

/** 모든 좌표가 짝수인지 — 검사가 이걸 본다. */
export function isOnGrid(rects: readonly PixelRect[]): boolean {
  return rects.every((r) => [r.x, r.y, r.w, r.h].every((v) => Number.isInteger(v) && v % 2 === 0));
}

const r = (x: number, y: number, w: number, h: number): PixelRect => ({ x, y, w, h });

// 별자리 — 4방향으로 빛나는 별(Simon 결정 2026-08-21). 이미 있는 정본을 쓴다.
// pixelStarRects 는 중심 기준 좌표를 주므로 상자 가운데(12,12)로 옮긴다.
const STAR: PixelRect[] = pixelStarRects(GLYPH_BOX / 2).map((s) => ({
  x: s.x + GLYPH_BOX / 2,
  y: s.y + GLYPH_BOX / 2,
  w: s.w,
  h: s.h,
}));

// 사각 프레임 — 담기·반쯤밝은이 공유한다.
const FRAME: PixelRect[] = [r(2, 2, 20, 2), r(2, 20, 20, 2), r(2, 4, 2, 16), r(20, 4, 2, 16)];

export const PIXEL_GLYPHS = {
  /** 별자리 (홈). */
  home: STAR,

  /** 담기 — 프레임 + 십자. */
  capture: [...FRAME, r(10, 6, 4, 12), r(6, 10, 12, 4)],

  /**
   * 세컨비 — 말풍선 하나 + 말줄 둘 + 꼬리.
   * ⚠ 원래 forum 글리프는 말풍선 **두 개**가 겹친 모양이었다. 18~24dp 에서 겹침을
   * rect 로 표현하려면 뒷장을 패널색으로 뚫어야 하는데, 그러면 아이콘이 배경색을
   * 알아야 한다(규칙 7 위반). 하나로 줄이면 뜻은 그대로고 규칙과 안 싸운다.
   */
  chat: [
    r(2, 2, 20, 2), r(2, 14, 20, 2), r(2, 4, 2, 10), r(20, 4, 2, 10),
    r(6, 6, 12, 2), r(6, 10, 8, 2),
    r(6, 16, 4, 2), r(6, 18, 2, 2),
  ],

  /** 비서 — 목록 세 줄. */
  ops: [r(4, 4, 16, 2), r(4, 10, 16, 2), r(4, 16, 10, 2)],

  /** 위키 — 보관함. */
  wiki: [
    r(2, 4, 20, 4),
    r(4, 8, 2, 12), r(18, 8, 2, 12), r(4, 18, 16, 2),
    r(10, 10, 4, 2),
  ],

  /** 나 — 사람. */
  account: [r(8, 4, 8, 8), r(6, 14, 12, 2), r(4, 16, 16, 6)],

  /** 렌즈 — 프레임 + 오른쪽 절반 채움(반쯤 밝은). */
  lens: [...FRAME, r(12, 2, 10, 20)],

  /** IDEN — 신분증. */
  iden: [
    r(2, 4, 20, 2), r(2, 18, 20, 2), r(2, 6, 2, 12), r(20, 6, 2, 12),
    r(6, 8, 4, 4), r(4, 14, 8, 2),
    r(14, 8, 6, 2), r(14, 12, 6, 2),
  ],

  /** 설정 — 슬라이더 둘. */
  settings: [
    r(2, 6, 20, 2), r(2, 16, 20, 2),
    r(14, 4, 4, 6), r(6, 14, 4, 6),
  ],
} as const satisfies Record<string, readonly PixelRect[]>;

export type PixelGlyphName = keyof typeof PIXEL_GLYPHS;

/**
 * 같은 배열을 SVG 마크업 문자열로. `SvgXml` 에 넘기는 레지스트리가 쓴다 —
 * 두 벌을 만들지 않기 위해서다.
 */
export function glyphMarkup(name: PixelGlyphName, fill: string): string {
  const body = PIXEL_GLYPHS[name]
    .map((g) => `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="${fill}"/>`)
    .join("");
  return `<svg viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${body}</svg>`;
}
