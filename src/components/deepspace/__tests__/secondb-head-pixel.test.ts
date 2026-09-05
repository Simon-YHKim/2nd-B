// SecondbHead 의 PIXEL-CLAY 이식(2026-09-05)을 지킨다. 캐논 가드(secondb-head-canon)가
// "살아 있는 얼굴"을 지키고, 이 가드는 "몸통이 격자 스프라이트"임을 지킨다.
//
// 1. 베이스는 PNG 가 아니라 secondb-hull.ts 의 rect 목록이다 (expo-image 없음).
// 2. 얼굴 자리는 격자에서 온다 (0.385/0.615 같은 PNG 튜닝 상수 금지).
// 3. 머리는 평행이동만 한다: perspective / rotateX / rotateY / scale 없음
//    (번들 SbHead: "tilt 는 그리드 위반").
// 4. 표시 크기는 16 배수로 스냅한다.
// 5. 팔레트는 토큰이다 (hex 는 캐논 가드가 이미 막는다; 여기서는 어느 토큰인지 본다).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(__dirname, "../SecondbHead.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("가드가 진짜 파일을 읽는다", () => {
  test("SecondbHead.tsx", () => {
    expect(src.length).toBeGreaterThan(5000);
    expect(src).toContain("export function SecondbHead(");
  });
});

describe("1. 베이스 = 격자 rect, 이미지 없음", () => {
  test("PNG 베이스와 expo-image 가 사라졌다", () => {
    expect(src).not.toContain("secondb-head-blank.png");
    expect(src).not.toContain("HEAD_IMAGE");
    expect(src).not.toContain('from "expo-image"');
  });

  test("hull rect 를 SvgRect 로 그린다", () => {
    expect(src).toMatch(/secondbHullRects\(hull\)\.map\(\(\[x, y, w, h, fill\], i\) =>/);
    expect(src).toMatch(/<Svg width=\{size\} height=\{size\} viewBox="0 0 16 16"/);
  });
});

describe("2. 얼굴 자리는 격자에서", () => {
  test("눈 x 는 SECONDB_FACE.eyeCx, 세로는 eyeCy, 입은 mouthCy", () => {
    expect(src).toMatch(/SECONDB_FACE\.eyeCx\.map\(\(cx, i\)/);
    expect(src).toMatch(/const eyeCy = SECONDB_FACE\.eyeTop \+ SECONDB_FACE\.eyeH \/ 2;/);
    expect(src).toMatch(/top: size \* eyeCy - eyeH \/ 2/);
    expect(src).toMatch(/top: size \* SECONDB_FACE\.mouthCy - mouthBoxH \/ 2/);
  });

  test("PNG 튜닝 상수가 남아 있지 않다", () => {
    expect(src).not.toMatch(/\[0\.385, 0\.615\]/);
    expect(src).not.toMatch(/size \* 0\.655/);
    expect(src).not.toMatch(/size \* spec\.top/);
  });

  test("셀 하나가 얼굴 도형의 단위다", () => {
    expect(src).toMatch(/const cell = size \/ SECONDB_GRID;/);
    expect(src).toMatch(/const mouthStroke = cell;/);
  });
});

describe("3. 머리는 평행이동만 (tilt 는 그리드 위반)", () => {
  const start = src.indexOf("const trackStyle = useMemo(");
  const end = src.indexOf("}, [enabled, center.x", start);
  const block = src.slice(start, end);

  test("trackStyle 블록을 읽었다", () => {
    expect(start).toBeGreaterThan(-1);
    expect(block.length).toBeGreaterThan(200);
  });

  test("perspective / rotate / scale 이 없고 translate 만 있다", () => {
    for (const bad of ["perspective", "rotateX", "rotateY", "scale"]) {
      expect({ bad, present: block.includes(bad) }).toEqual({ bad, present: false });
    }
    expect(block).toMatch(/transform: \[\{ translateX: shift\(dx\) \}, \{ translateY: shift\(dy\) \}\]/);
  });
});

describe("4. 크기는 16 배수로 스냅", () => {
  test("sizeProp 을 받아 snapHeadSize 로 그린다; 추적 판정은 원래 크기", () => {
    expect(src).toMatch(/size: sizeProp = 48/);
    expect(src).toMatch(/const size = snapHeadSize\(sizeProp\);/);
    expect(src).toMatch(/track \?\? sizeProp >= BIG_HEAD_MIN/);
  });
});

describe("5. 팔레트는 캐논 램프 토큰", () => {
  test("hull 팔레트 다섯 칸이 전부 토큰이다", () => {
    expect(src).toMatch(/hull: m3\.color\.surfaceBright,/);
    expect(src).toMatch(/hullDark: m3\.color\.surfaceContainerHigh,/);
    expect(src).toMatch(/hullLight: m3\.color\.onSurfaceVariant,/);
    expect(src).toMatch(/visor: deepSpace\.bgEdge,/);
    expect(src).toMatch(/m3\.accent\.moodNeutral/);
  });
});
