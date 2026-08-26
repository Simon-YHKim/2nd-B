// 캐논이 부르는 아이콘 이름이 **화면을 죽이지 않는가.**
//
// `canon-icon-names.test.ts` 는 "그림이 없는 이름이 몇 개인가"를 센다. 이 파일은
// 다른 것을 묻는다 — **그림이 없을 때 무슨 일이 나는가.**
//
// ## 왜 따로 있는가 (2026-08-26)
//
// 캐논 이름이 아이콘으로 흘러드는 길이 하나가 아니었다:
//
//   canonGlyph()  → 모르는 이름이면 `sparkle` 로 떨어진다        (안전)
//   gapGlyph()    → 34개 허용목록 밖이면 `sparkle` 로 떨어진다   (안전, 단 목록이 좁다)
//   SbIcon        → **폴백이 없었다**                            ← 여기가 문제였다
//
// `src/app/onboarding.tsx:66` 이 캐논 JSON 값을 `s.icon as SbIconName` 으로 검사
// 없이 캐스팅해서 `SbIcon` 에 넘긴다. 그림이 없는 이름이 오면 `GLYPH_ALIAS[name]`
// 이 `undefined` 가 되고 `glyphMarkup` 이 `PIXEL_GLYPHS[undefined].map(...)` 을
// 불러 **TypeError** 로 죽었다 — 그것도 **새 사용자의 첫 화면**에서.
//
// 그때 캐논의 네 이름은 전부 그려져 있어 사고는 안 났다. 즉 **캐논에 한 줄
// 더하는 것만으로 온보딩이 죽는 상태**였고, 아무 검사도 그걸 안 보고 있었다.
//
// 아이콘이 안 보이는 것과 화면이 죽는 것은 다른 값이다. 이 파일은 두 번째만 막는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PIXEL_GLYPHS, canonGlyph, glyphMarkup } from "../pixel-glyphs";

const ROOT = join(__dirname, "..", "..", "..", "..");

describe("모르는 아이콘 이름이 화면을 죽이지 않는다", () => {
  it("canonGlyph 는 무엇을 받아도 실재하는 글리프를 준다", () => {
    for (const name of ["", "이런 이름은 없다", "definitely_not_a_glyph", "__proto__"]) {
      const g = canonGlyph(name);
      expect(PIXEL_GLYPHS[g]).toBeDefined();
      expect(() => glyphMarkup(g, "#fff")).not.toThrow();
    }
  });

  it("SbIcon 이 폴백 없이 글리프를 찾지 않는다", () => {
    // 이 검사가 붙드는 것은 파일의 **모양**이 아니라 계약이다: 캐스팅으로 들어온
    // 이름이 그대로 색인에 쓰이면 안 된다. 렌더 테스트가 이 저장소에서 막혀 있어
    // (RN 0.85 + jest, docs 참조) 소스를 읽는다.
    const src = readFileSync(
      join(ROOT, "src", "components", "deepspace", "shell", "SbIcon.tsx"),
      "utf8",
    );
    expect(src).toMatch(/canonGlyph\(name\)/);
    // 옛 형태로 되돌아가면 빨강.
    expect(src).not.toMatch(/glyphMarkup\(\s*GLYPH_ALIAS\[name\]/);
  });

  it("온보딩이 넘기는 캐논 아이콘이 지금 전부 그려져 있다", () => {
    // 폴백이 생겼으니 이제 이건 크래시가 아니라 **품질** 문제다 — 그래도
    // 첫 화면에 대체 표시가 뜨는 것은 알고 있어야 한다.
    const flows = JSON.parse(
      readFileSync(join(ROOT, "public", "proto", "data", "screens", "flows.json"), "utf8"),
    ) as { onboardingSlides?: { icon?: string }[] };
    const icons = (flows.onboardingSlides ?? []).map((s) => s.icon ?? "");
    expect(icons.length).toBeGreaterThan(0);
    for (const name of icons) {
      // 대체 표시로 떨어지지 않고 **그 이름 자체**가 그려져 있어야 한다.
      expect(canonGlyph(name)).not.toBe("sparkle");
    }
  });
});
