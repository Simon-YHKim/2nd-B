// 픽셀 글리프를 화면 어디서나 그리는 하나의 컴포넌트.
//
// ## 왜 이게 필요했나
//
// 이 저장소는 아이콘 그리는 컴포넌트를 **파일마다 새로 만들고 있었다.**
// `SbIcon` · `TabIcon` · `CloneIcon` · `CaptureIcon` · `NoticeIcon` · `AxisIcon` …
// 하나같이 `Record<string, string>` 레지스트리를 옆에 끼고 `SvgXml` 로 그렸다.
// 그래서 같은 아이콘이 다섯 벌 있었고, 하나를 고쳐도 나머지가 안 따라왔다.
// 규칙 1(정수 rect 만) 위반 집계도 소문자 마크업을 못 봐서 2.6배 낮게 나왔다.
//
// 좌표는 `pixel-glyphs.ts` 하나뿐이고, 그리는 컴포넌트도 이거 하나다.
//
// ## 두 가지 형태
//
// - `PixelGlyph` — `<Svg>` 까지 포함한 완성품. 대부분 이걸 쓴다.
// - `PixelGlyphRects` — `<Rect>` 들만. **이미 있는 `<Svg>` 안에** 넣을 때 쓴다
//   (예: 바깥 `<Svg>` 가 `opacity` 를 걸고 있어 그 래퍼를 남겨야 하는 자리).
//
// ⚠ `opacity` prop 을 만들지 않는다. 규칙 4(정적 불투명도 금지)를 새 API 로
//   되살리는 셈이 되기 때문이다. 흐리게 그려야 하면 **더 어두운 토큰 색**을
//   넘긴다.

import Svg, { Rect } from "react-native-svg";

import { GLYPH_BOX, glyphRects, type AnyGlyphName } from "./pixel-glyphs";

export interface PixelGlyphProps {
  name: AnyGlyphName;
  color: string;
  /** 24 의 정수배일 때 셀이 기기 픽셀에 정확히 떨어진다. */
  size?: number;
}

export function PixelGlyphRects({ name, color }: { name: AnyGlyphName; color: string }) {
  // ⚠ `resolveGlyph` 가 아니라 `canonGlyph` 로 찾는다. 둘은 **그려진 이름에
  //   대해서는 완전히 같은 값**을 돌려주지만, 그려지지 않은 이름에서 갈린다:
  //   `resolveGlyph` 는 받은 이름을 그대로 돌려줘서 `PIXEL_GLYPHS[없는이름]`
  //   이 `undefined` 가 되고 바로 아래 `.map` 이 **TypeError 로 화면을 죽인다.**
  //   `canonGlyph` 는 `sparkle` 로 떨어뜨린다.
  //
  //   타입만 보면 일어날 수 없는 일이다 — `AnyGlyphName` 이 곧 그려진 이름의
  //   합집합이니까. 그래서 위험은 **캐스팅으로 타입을 세탁한 자리에서만** 온다.
  //   실제로 그런 자리가 하나 있었다: `src/app/onboarding.tsx` 가 캐논 JSON 의
  //   `icon` 문자열을 `as AnyGlyphName` 으로 검사 없이 캐스팅해 여기로 보냈다.
  //   캐논이 이름으로 부르는데 그림이 없는 이름은 오늘 56개다.
  //
  //   그 자리는 같은 회차에서 고쳤지만, 컴포넌트는 **전역 함수여야 한다** —
  //   다음 캐스팅을 막는 것은 검사의 일이고, 그 검사가 뚫렸을 때 새 사용자의
  //   첫 화면이 죽지 않는 것은 이쪽의 일이다.
  const rects = glyphRects(name);
  return (
    <>
      {rects.map((g, i) => (
        <Rect key={i} x={g.x} y={g.y} width={g.w} height={g.h} fill={color} />
      ))}
    </>
  );
}

export function PixelGlyph({ name, color, size = 24 }: PixelGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}>
      <PixelGlyphRects name={name} color={color} />
    </Svg>
  );
}
