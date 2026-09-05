// PIXEL-CLAY 프리미티브 가드 (이주 P4).
//
// 이 저장소에는 RN 렌더러가 없다(`testEnvironment: node`, 그리고 컴포넌트 렌더
// 테스트는 RN 0.85 + jest 29 상류 문제로 막혀 있다 - 재시도 금지). 그래서 딥스페이스
// 소스 가드와 같은 방식으로 **소스를 읽어** 규율을 검사한다.
//
// 규칙을 값으로 박는 것이 아니라 **규칙이 깨질 수 있는 방식**을 박는다.
import { readFileSync } from "node:fs";
import path from "node:path";

import { m3 } from "@/lib/theme/m3";

import { pixelPressTransform, pixelStateDensity } from "../press";

const DIR = path.resolve(__dirname, "..");
const ROOT = path.resolve(__dirname, "../../../..");
const read = (f: string): string => readFileSync(path.join(DIR, f), "utf8");

const FILES = ["PixelSurface.tsx", "PixelDither.tsx", "PixelPressable.tsx", "press.ts"];

describe("절대 규칙이 프리미티브에 박혀 있다", () => {
  test.each(FILES)("%s 에 hex 리터럴이 없다 (규칙 7)", (f) => {
    expect(read(f)).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  test.each(FILES)("%s 가 색을 정한다면 m3 를 거친다", (f) => {
    const src = read(f);
    const setsColour = /backgroundColor:|\bcolor:/.test(src);
    // PixelDither 는 색을 안 정한다 - 디더 색은 타일 PNG 에 구워져 있다
    // (팔레트가 빌드타임 상수라는 결정 D2 의 결과). 그래서 m3 를 안 읽는 것이 맞다.
    // 함의지 동치가 아니다: 색을 정하면 m3 를 읽어야 하지만, 간격만 읽는 파일도 있다.
    const violation = setsColour && !src.includes("@/lib/theme/m3");
    expect({ file: f, setsColourWithoutTokens: violation }).toEqual({
      file: f,
      setsColourWithoutTokens: false,
    });
  });

  test.each(FILES)("%s 에 알파도 블러도 없다 (규칙 3·4)", (f) => {
    const src = read(f);
    // 반투명은 디더로만 낸다. rgba/opacity 가 보이면 그 규칙이 뚫린 것이다.
    expect(src).not.toMatch(/rgba\(/);
    expect(src).not.toMatch(/\bopacity:/);
    expect(src).not.toMatch(/shadowRadius|blurRadius|elevation:/);
  });

  test.each(FILES)("%s 에 라운드가 없다 (규칙 2)", (f) => {
    const src = read(f);
    // 0 을 쓰더라도 토큰(`m3.shape.*`)을 거쳐야 한다. 리터럴 숫자 반경 금지.
    expect(src).not.toMatch(/borderRadius:\s*[1-9]/);
  });

  test.each(FILES)("%s 에 곡선 이징이 없다 (규칙 5)", (f) => {
    expect(read(f)).not.toMatch(/cubic-bezier|Easing\.(ease|bezier|elastic|bounce)/);
  });
});

describe("잘린 모서리 실루엣 - 이 체계에서 제일 알아보기 쉬운 특징", () => {
  const src = read("PixelSurface.tsx");

  test("테두리를 borderWidth 로 그리지 않는다", () => {
    // RN 의 borderWidth 는 모서리를 마이터 조인으로 **채운다**. border 로 옮기면
    // 값은 같은데 실루엣이 사라진다 - 조용한 회귀라 여기서 막는다.
    expect(src).not.toMatch(/borderWidth:/);
    expect(src).not.toMatch(/borderColor:/);
  });

  test("막대 네 개가 다 있고 (규칙 6: 2변 'ㄱ'자 금지)", () => {
    for (const bar of ["edgeTop", "edgeBottom", "edgeLeft", "edgeRight"]) {
      expect({ bar, present: src.includes(`${bar}:`) }).toEqual({ bar, present: true });
    }
    for (const bar of ["innerTop", "innerBottom", "innerLeft", "innerRight"]) {
      expect({ bar, present: src.includes(`${bar}:`) }).toEqual({ bar, present: true });
    }
  });

  test("가로 막대는 양 끝에서 물러나 있다 - 그래야 모서리가 빈다", () => {
    // `left: U, right: U` 가 빠지면 막대가 끝까지 가서 모서리를 채우고,
    // 잘린 모서리가 사라진다. 이 줄이 실루엣 그 자체다.
    expect(src).toMatch(/edgeTop:\s*\{[^}]*left:\s*U,[^}]*right:\s*U/);
    expect(src).toMatch(/edgeBottom:\s*\{[^}]*left:\s*U,[^}]*right:\s*U/);
    expect(src).toMatch(/edgeLeft:\s*\{[^}]*top:\s*U,[^}]*bottom:\s*U/);
    expect(src).toMatch(/edgeRight:\s*\{[^}]*top:\s*U,[^}]*bottom:\s*U/);
  });

  test("막대 두께가 토큰 한 유닛이다", () => {
    expect(src).toContain("const U = m3.spacing.s1;");
    expect(m3.spacing.s1).toBe(2);
  });

  test("막대를 음수 위치로 바깥에 놓지 않는다", () => {
    // 안드로이드는 부모 경계 밖 자식을 잘라낸다(overflow: visible 이 안 먹는다).
    // 바깥에 놓으면 실기기에서만 테두리가 사라진다.
    expect(src).not.toMatch(/(top|bottom|left|right):\s*-/);
    expect(src).toMatch(/wrap:\s*\{\s*padding:\s*U\s*\}/);
  });
});

describe("디더 - 알파 대신 타일", () => {
  const src = read("PixelDither.tsx");

  test("세 밀도 타일을 정적 require 로 싣는다", () => {
    // 경로를 만들어 쓰면 Metro 가 번들에 안 넣는다.
    for (const d of [25, 50, 75]) {
      expect(src).toContain(`require("../../../assets/dither/dither-${d}.png")`);
    }
    expect(src).not.toMatch(/require\(`/);
  });

  test("밀도별 타일이 세 배율 전부 존재한다", () => {
    // @2x/@3x 가 없으면 RN 이 1x 를 바이리니어로 늘려서 체커 경계가 흐려진다 -
    // 규칙 3이 금지한 그 흐림이고, 실기기에서만 보인다.
    for (const d of [25, 50, 75]) {
      for (const suffix of ["", "@2x", "@3x"]) {
        const f = path.join(ROOT, "assets", "dither", `dither-${d}${suffix}.png`);
        let bytes = 0;
        try {
          bytes = readFileSync(f).length;
        } catch {
          bytes = 0;
        }
        expect({ file: `dither-${d}${suffix}.png`, present: bytes > 0 }).toEqual({
          file: `dither-${d}${suffix}.png`,
          present: true,
        });
      }
    }
  });

  test("타일을 반복으로 깐다", () => {
    // JSX 속성으로 실제로 붙어 있는지 본다. 파일 첫머리 주석에도 같은 문자열이
    // 있어서 `toContain` 만으로는 **주석만 남아도 통과**한다 - 변이 검증에서
    // 실제로 그렇게 빠져나갔다.
    expect(src).toMatch(/^\s*resizeMode="repeat"$/m);
  });

  test("터치를 막지 않는다", () => {
    // 전면을 덮는 층이라 이게 빠지면 아래 버튼이 통째로 안 눌린다.
    expect(src).toContain('pointerEvents="none"');
  });

  test("누름 변환이 정확히 한 유닛 아래다", () => {
    expect(pixelPressTransform).toEqual([{ translateY: m3.spacing.s1 }]);
  });

  test("hover 상태층을 가져오지 않는다", () => {
    // 터치에 대응물이 없다(REPO-NOTES 함정 5). 값은 있으나 press 와 같게 두고,
    // 웹 전용 hover 디더를 이식하지 않았다는 사실을 박는다.
    expect(pixelStateDensity.hovered).toBe(pixelStateDensity.pressed);
  });
});

describe("누름 - 가라앉기와 베벨 반전이 함께 간다", () => {
  const src = read("PixelPressable.tsx");
  const recordsGraph = readFileSync(
    path.join(ROOT, "src", "components", "deep-space", "RecordsGraph.tsx"),
    "utf8",
  );

  test("눌리면 변환과 베벨 반전이 둘 다 걸린다", () => {
    // 하나만 하면 흔들리거나(변환만) 납작해진다(반전만). 같은 `sunken` 하나가
    // 둘을 몰아야 어긋나지 않는다.
    expect(src).toMatch(/const sunken = held && !disabled;/);
    expect(src).toMatch(/sunken \? styles\.sunk : styles\.rest/);
    expect(src).toMatch(/pressed=\{sunken\}/);
  });

  test("함수형 Pressable prop 을 쓰지 않는다 (#680)", () => {
    // 안드로이드 Fabric 이 런타임에 버려서 실기기에서만 사라진다. 저장소 전역
    // 가드(`no-function-form-pressable-style`)와 같은 규칙을 여기서도 지역으로 박아,
    // 이 파일을 고치는 사람이 그 이유를 옆에서 보게 한다.
    expect(src).not.toMatch(/style\s*=\s*\{\s*\(/);
    expect(src).not.toMatch(/>\s*\{\s*\(\s*\{\s*pressed/);
    expect(src).toContain("onPressIn");
    expect(src).toContain("onPressOut");
  });

  test("최소 터치 규격을 지킨다", () => {
    expect(src).toContain("minHeight: m3.minTouch");
  });

  test("기본 button 역할과 disabled 상태를 한 번만 전달한다", () => {
    expect(src).toContain('accessibilityRole = "button"');
    expect(src).toContain("accessibilityRole={accessibilityRole}");
    expect(src).toContain("accessibilityState={{ ...accessibilityState, disabled }}");
    expect(src.match(/accessibilityRole=/g)).toHaveLength(1);
    expect(src.match(/accessibilityState=/g)).toHaveLength(1);
  });

  test("stateful caller의 switch 역할과 checked 상태를 보존한다", () => {
    expect(src).toContain('accessibilityRole?: PressableProps["accessibilityRole"]');
    expect(src).toContain('accessibilityState?: PressableProps["accessibilityState"]');
    expect(recordsGraph).toContain('accessibilityRole="switch"');
    expect(recordsGraph).toContain("accessibilityState={{ checked: showTagLinks }}");
  });
});

describe("레거시 cosmic-pixel 스킨과 섞이지 않는다", () => {
  test.each(FILES)("%s 는 gameboy 토큰을 읽지 않는다", (f) => {
    // 이름이 둘 다 '픽셀'이라 세션마다 섞였다. cosmic-pixel 은 폐기된 스킨이고
    // PIXEL-CLAY v4 는 새로 설계된 체계다 (MIGRATION §1).
    expect(read(f)).not.toMatch(/theme\/gameboy|gameboy-tokens|phytoncide/);
  });
});
