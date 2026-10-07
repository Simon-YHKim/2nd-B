// 시계 줄 날씨 그림 5종 (Simon 2026-10-07: "날씨 데이터를 받아서 그림으로 표현", Q-261007-39 = GPS).
//
// 한 색짜리 PixelGlyph 와 달리 해(주황 · 노랑) · 구름(회색) · 비(파랑) · 눈(하늘색)을 함께 그리므로 층마다 색을 단다.
// 격자는 PixelGlyph 와 같다: viewBox 24 · 셀 2 · 모든 좌표 짝수(PIXEL-CLAY 규칙 1). 그래서 12 칸 설계를 2 배로 옮긴다.
// 위치는 아직 읽지 않는다 - 데이터가 null 이면 시계 줄은 시각만 보인다(법 검토 먼저, Q-261007-39).

import type { PixelRect } from "@/components/pixel/pixel-glyphs";
import type { SkyCondition } from "@/lib/dashboard/board/contract";
import { phoneIos } from "@/lib/theme/phone-ios";

export interface WeatherLayer {
  color: string;
  rects: readonly PixelRect[];
}

/** 12 칸 설계 좌표를 24 격자로(셀 2). */
const c = (x: number, y: number, w: number, h: number): PixelRect => ({ x: x * 2, y: y * 2, w: w * 2, h: h * 2 });

/** 구름: 몸통 + 왼쪽 어깨 + 위 혹 둘. dy 로 위아래만 옮긴다. */
const cloud = (dy: number): PixelRect[] => [c(1, 5 + dy, 10, 4), c(2, 4 + dy, 1, 1), c(3, 3 + dy, 4, 2), c(7, 4 + dy, 3, 1)];

export const SKY_CONDITIONS: readonly SkyCondition[] = ["clear", "partlyCloudy", "cloudy", "rain", "snow"];

export const WEATHER_LAYERS: Record<SkyCondition, readonly WeatherLayer[]> = {
  clear: [
    { color: phoneIos.yellow, rects: [c(5, 1, 2, 2), c(5, 9, 2, 2), c(1, 5, 2, 2), c(9, 5, 2, 2), c(2, 2, 1, 1), c(9, 2, 1, 1), c(2, 9, 1, 1), c(9, 9, 1, 1)] },
    { color: phoneIos.orange, rects: [c(4, 4, 4, 4)] },
  ],
  partlyCloudy: [
    { color: phoneIos.yellow, rects: [c(7, 0, 2, 1), c(11, 3, 1, 2), c(5, 2, 1, 1)] },
    { color: phoneIos.orange, rects: [c(6, 1, 4, 4)] },
    { color: phoneIos.gray2, rects: [c(0, 7, 9, 4), c(1, 6, 1, 1), c(2, 5, 4, 2), c(6, 6, 2, 1)] },
  ],
  cloudy: [
    { color: phoneIos.gray2, rects: cloud(1) },
  ],
  rain: [
    { color: phoneIos.gray2, rects: cloud(-1) },
    { color: phoneIos.blue, rects: [c(3, 9, 1, 2), c(6, 10, 1, 2), c(9, 9, 1, 2)] },
  ],
  snow: [
    { color: phoneIos.gray2, rects: cloud(-1) },
    { color: phoneIos.lightBlue, rects: [c(2, 9, 2, 2), c(5, 10, 2, 2), c(8, 9, 2, 2)] },
  ],
};
