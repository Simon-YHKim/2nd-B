// 시계 줄 날씨 그림 하나. 좌표와 색은 weather-glyphs.ts 한 곳에 있다.

import Svg, { Rect } from "react-native-svg";
import { GLYPH_BOX } from "@/components/pixel/pixel-glyphs";
import type { SkyCondition } from "@/lib/dashboard/board/contract";
import { WEATHER_LAYERS } from "./weather-glyphs";

/** size 는 24 의 정수배일 때 칸이 기기 픽셀에 정확히 떨어진다. 그림은 읽기 이름을 감싸는 쪽이 단다. */
export function WeatherGlyph({ sky, size = 24 }: { sky: SkyCondition; size?: number }) {
  return <Svg width={size} height={size} viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {WEATHER_LAYERS[sky].map((layer, index) => layer.rects.map((rect) => (
      <Rect key={`${index}-${rect.x}-${rect.y}-${rect.w}-${rect.h}`} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={layer.color} />
    )))}
  </Svg>;
}
