// 픽셀 글리프 — PIXEL-CLAY 절대 규칙 1.
//
// 이 검사가 지키는 것 셋:
//  ① 좌표가 **짝수 격자** 위에 있다. 홀수면 렌더 크기가 24 의 배수여도 셀이
//    기기 픽셀 경계에 안 떨어지고 안티에일리어싱이 생긴다 — 규칙 3이 금지한
//    바로 그 흐림이고, 코드에서는 안 보이고 실기기에서만 보인다.
//  ② 상자를 넘지 않는다. 넘으면 잘려서 아이콘이 뜻을 잃는다.
//  ③ 문자열 직렬화가 배열과 **같은 것**을 낸다. 두 벌이 갈라지는 것이 이
//    파일을 만든 이유다.
import { PIXEL_GLYPHS, GLYPH_BOX, glyphMarkup, isOnGrid, type PixelGlyphName } from "../pixel-glyphs";

const NAMES = Object.keys(PIXEL_GLYPHS) as PixelGlyphName[];

describe("픽셀 글리프", () => {
  it("아홉 개가 다 있다 (독 탭 + 2차 자리)", () => {
    expect(NAMES.sort()).toEqual(
      ["account", "capture", "chat", "home", "iden", "lens", "ops", "settings", "wiki"].sort(),
    );
  });

  it.each(NAMES)("%s — 좌표가 짝수 격자 위에 있다", (name) => {
    const bad = PIXEL_GLYPHS[name].filter(
      (g) => ![g.x, g.y, g.w, g.h].every((v) => Number.isInteger(v) && v % 2 === 0),
    );
    expect(bad).toEqual([]);
    expect(isOnGrid(PIXEL_GLYPHS[name])).toBe(true);
  });

  it.each(NAMES)("%s — 상자(0..24) 안에 들어간다", (name) => {
    for (const g of PIXEL_GLYPHS[name]) {
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.y).toBeGreaterThanOrEqual(0);
      expect(g.w).toBeGreaterThan(0);
      expect(g.h).toBeGreaterThan(0);
      expect(g.x + g.w).toBeLessThanOrEqual(GLYPH_BOX);
      expect(g.y + g.h).toBeLessThanOrEqual(GLYPH_BOX);
    }
  });

  it.each(NAMES)("%s — 빈 글리프가 아니다", (name) => {
    expect(PIXEL_GLYPHS[name].length).toBeGreaterThan(0);
  });

  it("서로 다른 글리프다 — 복붙으로 같아진 것이 없다", () => {
    const seen = new Map<string, PixelGlyphName>();
    for (const n of NAMES) {
      const key = JSON.stringify(PIXEL_GLYPHS[n]);
      const prev = seen.get(key);
      expect(prev === undefined || `${n} 와 ${prev} 가 같다`).toBe(true);
      seen.set(key, n);
    }
  });
});

describe("문자열 직렬화 — 두 벌이 갈라지지 않는다", () => {
  it.each(NAMES)("%s — rect 수가 배열과 같다", (name) => {
    const xml = glyphMarkup(name, "#fff");
    expect((xml.match(/<rect /g) ?? []).length).toBe(PIXEL_GLYPHS[name].length);
  });

  it("crispEdges 를 켠다 — 이게 없으면 브라우저가 경계를 흐린다", () => {
    expect(glyphMarkup("home", "#fff")).toContain('shape-rendering="crispEdges"');
  });

  it("viewBox 가 격자와 같다", () => {
    expect(glyphMarkup("home", "#fff")).toContain(`viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}"`);
  });

  it("색을 그대로 싣는다 — 아이콘이 배경색을 알 필요가 없다(규칙 7)", () => {
    expect(glyphMarkup("ops", "#5b8def")).toContain('fill="#5b8def"');
  });
});
