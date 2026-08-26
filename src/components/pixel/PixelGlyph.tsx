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

import { GLYPH_BOX, PIXEL_GLYPHS, resolveGlyph, type AnyGlyphName } from "./pixel-glyphs";

export interface PixelGlyphProps {
  name: AnyGlyphName;
  color: string;
  /** 24 의 정수배일 때 셀이 기기 픽셀에 정확히 떨어진다. */
  size?: number;
}

export function PixelGlyphRects({ name, color }: { name: AnyGlyphName; color: string }) {
  const rects = PIXEL_GLYPHS[resolveGlyph(name)];
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
