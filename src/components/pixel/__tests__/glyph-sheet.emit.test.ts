// 글리프를 한 장짜리 HTML 로 뽑는다 — **눈으로 확인하기 위한 도구**다.
//
// 아이콘은 좌표가 맞아도 "무엇인지 알아볼 수 있는가" 는 사람이 봐야 안다.
// 검사가 아니라 산출물이므로 단언은 최소한만 하고, 파일을 남기는 것이 목적이다.
//
// 실행: SHEET_OUT=<경로> npx jest glyph-sheet.emit
// SHEET_OUT 이 없으면 아무것도 쓰지 않고 지나간다(CI 에서 조용하다).
import { writeFileSync } from "node:fs";

import { PIXEL_GLYPHS, GLYPH_ALIAS, glyphMarkup } from "../pixel-glyphs";

describe("글리프 시트", () => {
  it("SHEET_OUT 이 있으면 한 장으로 뽑는다", () => {
    const out = process.env.SHEET_OUT;
    const names = Object.keys(GLYPH_ALIAS) as (keyof typeof GLYPH_ALIAS)[];
    expect(names.length).toBeGreaterThan(0);
    if (!out) return;

    const cells = names
      .map((a) => {
        const g = GLYPH_ALIAS[a];
        const svg = glyphMarkup(g, "#e4e9f5").replace("<svg", '<svg width="72" height="72"');
        return `<div class="c">${svg}<span>${a}</span><em>${PIXEL_GLYPHS[g].length} rect</em></div>`;
      })
      .join("");

    writeFileSync(
      out,
      `<!doctype html><meta charset="utf-8"><style>
body{background:#0a0e18;color:#8b96b0;font:12px system-ui;margin:0;padding:20px;
  display:grid;grid-template-columns:repeat(5,1fr);gap:16px}
.c{background:#141b2e;border:1px solid #232e4a;padding:12px;text-align:center}
.c span{display:block;margin-top:8px;font-size:11px;color:#e4e9f5}
.c em{display:block;font-size:9px;color:#6f7b96;font-style:normal}
</style>${cells}`,
      "utf8",
    );
  });
});
