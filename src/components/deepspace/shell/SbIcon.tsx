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
  // `canonGlyph` 를 지나는 이유: 이름이 그려진 글리프로 확실히 떨어지게 한다.
  // 아이콘이 없는 것과 화면이 죽는 것은 다른 값이다.
  //
  // ⚠ 2026-09-08 정정. 여기 이렇게 적혀 있었다: *"온보딩 화면(당시 66행)이
  //   캐논 JSON 값을 `s.icon as SbIconName` 으로 검사 없이 캐스팅해 **넘긴다**"*
  //   — 그래서 이 가드가 온보딩을 지킨다는 뜻이었다. **세 군데가 틀렸다:**
  //
  //     · `as SbIconName` 은 저장소 어디에도 없다(이 주석 안을 빼면 0건).
  //     · 그 66행은 `skipLabel` 이었다. 그리고 `onboarding.tsx` 는 `<SbIcon>` 을
  //       **한 번도 그리지 않는다.**
  //
  //   (지목한 줄 번호를 여기서 **되풀이하지 않는다.** 옛 인용을 그대로 다시
  //   적으면 그것도 인용이 되고, 가리키는 줄은 이미 밀려 있다. 실제로 이
  //   정정문이 하루 만에 그렇게 낡았다.)
  //     · 실제 캐스팅은 `onboarding.tsx` 가 `as AnyGlyphName` 으로 하고, 값은
  //       `SbIcon` 이 아니라 `PixelGlyph` 로 **직접** 갔다 — 이 가드를 비껴서.
  //
  //   즉 가드는 위험이 지나지 않는 길에 서 있었고, 주석이 엉뚱한 호출자를
  //   지목한 탓에 아무도 진짜 길을 못 찾았다. 고친 자리는 두 곳이다:
  //   `onboarding.tsx` 의 캐스팅을 `canonGlyph` 로 바꿨고, `PixelGlyphRects`
  //   자체가 그려진 이름으로만 색인하도록 만들었다. 이 파일은 그대로 맞다.
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}
