// 시계 줄 날씨 그림 하나. 좌표와 색은 weather-glyphs.ts 한 곳에 있다.

import Svg, { Rect } from "react-native-svg";
import { GLYPH_BOX } from "@/components/pixel/pixel-glyphs";
import type { SkyCondition } from "@/lib/dashboard/board/contract";
import { WEATHER_LAYERS } from "./weather-glyphs";
import { phoneIos } from "@/lib/theme/phone-ios";

/** 2px grid pin, with an empty centre. */
export function WeatherPin() {
  return <Svg width={24} height={24} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Rect x={8} y={2} width={8} height={2} fill={phoneIos.blue} />
    <Rect x={4} y={4} width={4} height={10} fill={phoneIos.blue} />
    <Rect x={16} y={4} width={4} height={10} fill={phoneIos.blue} />
    <Rect x={8} y={12} width={8} height={6} fill={phoneIos.blue} />
    <Rect x={10} y={18} width={4} height={4} fill={phoneIos.blue} />
  </Svg>;
}

/** size 는 24 의 정수배일 때 칸이 기기 픽셀에 정확히 떨어진다. 그림은 읽기 이름을 감싸는 쪽이 단다. */
export function WeatherGlyph({ sky, size = 24 }: { sky: SkyCondition; size?: number }) {
  return <Svg width={size} height={size} viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {WEATHER_LAYERS[sky].map((layer, index) => layer.rects.map((rect) => (
      <Rect key={`${index}-${rect.x}-${rect.y}-${rect.w}-${rect.h}`} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={layer.color} />
    )))}
  </Svg>;
}
