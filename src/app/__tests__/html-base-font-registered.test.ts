// +html.tsx 의 웹 루트 font-family 는 **실제로 로드되는 얼굴**이어야 한다.
//
// 2026-05-29 부터 이 규칙은 "NeoDunggeunmo" 를 가리켰다. 그 얼굴은 나중에
// fontAssets(src/theme/typography.ts)에서 빠졌고, useFonts() 는 등록된 얼굴만
// @font-face 로 넣으므로 규칙은 조용히 브라우저 monospace 로 떨어졌다
// (2026-09-05 실측: ttf 파일은 assets/fonts 에 남아 있었지만 등록 0건).
// 이름을 바꿔도 등록을 안 하면 같은 일이 난다. 그래서 규칙의 첫 얼굴이 fontAssets
// 의 키인지 소스에서 읽어 확인한다. 웹 @font-face 의 family 이름 = fontAssets 키.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fontAssets } from "@/theme/typography";

const src = readFileSync(resolve(__dirname, "../+html.tsx"), "utf8").replace(/\r\n/g, "\n");

function firstFamilyOfRule(selectorStart: string): string {
  const i = src.indexOf(selectorStart);
  expect({ selectorStart, found: i > -1 }).toEqual({ selectorStart, found: true });
  const block = src.slice(i, src.indexOf("}", i));
  const m = /font-family:\s*"([^"]+)"/.exec(block);
  expect(m).not.toBeNull();
  return m![1];
}

describe("+html.tsx 루트 폰트는 등록된 얼굴이다", () => {
  const registered = Object.keys(fontAssets);

  test("가드가 진짜 파일을 읽는다", () => {
    expect(src.length).toBeGreaterThan(500);
    expect(registered.length).toBeGreaterThan(3);
  });

  test("픽셀 기본 규칙(html, body, ...)의 첫 얼굴이 fontAssets 키다", () => {
    const fam = firstFamilyOfRule("html, body, #root, #__next, button, input, textarea, select {");
    expect({ fam, registered: registered.includes(fam) }).toEqual({ fam, registered: true });
  });

  test("읽기 쉬운 글꼴 규칙(data-font=readable)의 첫 얼굴도 fontAssets 키다", () => {
    const fam = firstFamilyOfRule('html[data-font="readable"]');
    expect({ fam, registered: registered.includes(fam) }).toEqual({ fam, registered: true });
  });

  test("죽은 NeoDunggeunmo 참조가 font-family 값에 없다", () => {
    expect(src).not.toMatch(/font-family:[^;]*NeoDunggeunmo/);
  });
});
