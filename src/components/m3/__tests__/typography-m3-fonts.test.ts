// `m3.font.*` 문자열과 `fontAssets` 키가 **문자 그대로** 짝인지 지킨다.
//
// 이 가드가 존재하는 이유는 실패가 조용하기 때문이다: RN 은 등록 안 된
// fontFamily 를 받으면 오류를 내지 않고 시스템 폰트로 그린다. 그래서 화면은
// '픽셀이 아니다' 말고는 아무 신호도 안 준다.
//
// 2026-08-20 (PIXEL-CLAY 2단계): 대상이 Roboto 에서 Galmuri 로 바뀌었다. 이 가드가
// 겨누는 것은 벤더가 아니라 **짝**이므로 규칙은 그대로고 값만 옮겼다.
import { readFileSync } from "node:fs";
import path from "node:path";

import { m3 } from "@/lib/theme/m3";

const ROOT = path.resolve(__dirname, "../../../..");

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

describe("Galmuri 등록 (src/theme/typography.ts)", () => {
  const src = read("src/theme/typography.ts");

  test("fontAssets 가 Galmuri 4종을 등록한다", () => {
    // 11 은 원래 있었고(cosmic-pixel 시절 파이프라인), 2단계가 나머지를 넓혔다.
    for (const key of ["Galmuri11", "Galmuri11Bold", "Galmuri14", "Galmuri9", "GalmuriMono11"]) {
      expect({ key, registered: src.includes(`\n  ${key}:`) }).toEqual({ key, registered: true });
    }
  });

  test("등록된 키가 m3.font 문자열과 정확히 같다", () => {
    // 어긋나면 M3 텍스트가 조용히 시스템 폰트로 떨어진다. 이 가드가 쓰인 이유다.
    const missing = [m3.font.brand, m3.font.plain, m3.font.mono, m3.font.chrome]
      .filter((family, i, all) => all.indexOf(family) === i)
      .filter((family) => !src.includes(`\n  ${family}:`));
    expect(missing).toEqual([]);
  });

  test("얼굴마다 웹은 woff2, 네이티브는 ttf 를 쓴다", () => {
    // woff2 는 네이티브에서 안 뜨고, 2.5MB ttf 를 웹으로 보내면 첫 페인트가 늦는다.
    // Metro 는 woff2 를 기본 assetExts 에 안 넣으므로 metro.config.js 도 함께 봐야
    // 한다 — 그건 `check:asset-exts` 가 본다.
    for (const key of ["Galmuri11", "Galmuri11Bold", "Galmuri14", "Galmuri9", "GalmuriMono11"]) {
      const block = src.slice(src.indexOf(`\n  ${key}:`), src.indexOf(`\n  ${key}:`) + 260);
      expect({ key, web: block.includes(`${key}-subset.woff2`) }).toEqual({ key, web: true });
      expect({ key, native: block.includes(`${key}-subset.ttf`) }).toEqual({ key, native: true });
    }
  });

  test("바이너리가 저장소에 실재한다", () => {
    // `npm run verify` 에는 번들링 단계가 없다. require() 가 가리키는 파일이 없어도
    // 여기까지는 초록이고, CI 의 web-export-smoke 에 가서야 죽는다.
    for (const key of ["Galmuri11", "Galmuri11Bold", "Galmuri14", "Galmuri9", "GalmuriMono11"]) {
      for (const ext of ["ttf", "woff2"]) {
        const file = `assets/fonts/${key}-subset.${ext}`;
        let bytes = 0;
        try {
          bytes = read(file).length;
        } catch {
          bytes = 0;
        }
        expect({ file, present: bytes > 0 }).toEqual({ file, present: true });
      }
    }
  });

  test("폰트는 번들에서 오지, 런타임에 받아오지 않는다", () => {
    // 인수 번들은 Galmuri 5종을 jsDelivr CDN 에서 받는다. RN 은 CDN 웹폰트를 못 쓰고,
    // 웹에서도 첫 렌더가 네트워크에 묶이면 안 된다.
    expect(src).not.toMatch(/cdn\.jsdelivr\.net|https?:\/\/[^"']*galmuri/i);
    expect(src).toContain("assets/fonts/");
  });
});
