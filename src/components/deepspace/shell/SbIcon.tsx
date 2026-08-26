// SbIcon — 딥스페이스 셸의 아이콘(내비 · 상태바 · 종 · 뒤로).
//
// **정수 rect 만 그린다**(PIXEL-CLAY 절대 규칙 1). 좌표는 이 파일에 없다 —
// components/pixel/pixel-glyphs.ts 가 정본이고, 같은 배열을 DeepSpaceDock 의
// TabIcon 도 읽는다. 아이콘을 고치는 자리가 하나다.
//
// 원래는 레퍼런스 prototype 의 Icon() 을 1:1 로 옮긴 것이었다 — 각 글리프를
// 24dp 인라인 SVG **문자열**로 들고 stroke=currentColor 로 그렸다. 그 방식이
// 남긴 두 가지 문제를 이 전환이 닫는다:
//   (1) 소문자 마크업이라 규칙 1 위반 집계에서 통째로 빠졌다(135 → 실제 304).
//   (2) 다섯 글리프가 TabIcon 과 글자까지 같은 두 벌이었다.

import { canonGlyph, type GlyphAliasName } from "@/components/pixel/pixel-glyphs";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";

// 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이고
// `glyphMarkup()` 이 문자열로 직렬화해 준다(PIXEL-CLAY 절대 규칙 1: 정수 rect 만).
//
// 전에는 이 파일이 `ICON_PATHS` 라는 이름으로 SVG **마크업 문자열**을 직접
// 들고 있었다. 소문자 &lt;path&gt; 라 &lt;Path 로 grep 하면 안 잡혀서 규칙 1 위반
// 집계에서 통째로 빠졌고(135 → 실제 304), 다섯 아이콘은 `DeepSpaceDock` 과
// **글자까지 같은 두 벌**이었다.
export type SbIconName = GlyphAliasName;

export interface SbIconProps {
  name: SbIconName;
  color: string;
  size?: number;
  /**
   * 전에는 이 값이 채움/선을 갈랐다(활성 탭 강조). rect 글리프는 언제나 채워져
   * 있어서 그 구분이 없어졌다 — 활성 강조는 **색**이 한다(호출부가 이미 그렇게
   * 넘긴다: `SbNavBar` 는 `iconColor` 를 함께 바꾼다).
   * prop 은 호출부를 건드리지 않으려고 남겨 두었고 아무 일도 하지 않는다.
   */
  fill?: boolean;
}

export function SbIcon({ name, color, size = 24 }: SbIconProps) {
  // ⚠ `canonGlyph` 를 지나는 이유: 이 컴포넌트에 **타입이 못 막는 이름이 들어온다.**
  //
  //   `src/app/onboarding.tsx:66` 이 캐논 JSON 값을 `s.icon as SbIconName` 으로
  //   **검사 없이 캐스팅**해서 넘긴다. 전에는 여기서 `GLYPH_ALIAS[name]` 이
  //   `undefined` 가 되고 `glyphMarkup` 이 `PIXEL_GLYPHS[undefined].map(...)` 을
  //   부르며 **TypeError** 로 죽었다 — 그것도 **새 사용자의 첫 화면**에서.
  //
  //   지금 캐논의 네 이름은 전부 그려져 있어 사고는 안 났지만, 캐논에 아이콘
  //   이름 한 줄을 더하는 것만으로 온보딩이 죽는 상태였다. 아이콘이 없는 것과
  //   화면이 죽는 것은 다른 값이다.
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}
