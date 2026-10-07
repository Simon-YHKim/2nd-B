// 픽셀 계단 모서리 상자 - 인앱 핸드폰의 '픽셀 아이폰' 모양(Simon 2026-10-07).
//
// iOS 의 둥근 모서리를 곡선 없이 2px 계단으로 그린다. 바깥 배경색을 알 필요가 없도록 모서리를 '깎는' 대신
// 안쪽으로 들인 사각형 몇 개를 겹쳐(합집합) 모양을 만든다. 그래서 PIXEL-CLAY 규칙 1(정수 사각형만) · 2(반경 0)를
// 그대로 지킨다 - borderRadius 를 쓰지 않는다.
//
//   card   ··████████··      small  ·██████·      pill  ·████████·
//          ·██████████·             ████████            ██████████
//          ████████████             ████████            ██████████
//
// 테두리(border)를 주면 같은 모양을 2px 안쪽으로 한 번 더 그려 테두리만 남긴다.
//
// 층은 상자 안에서 맨 뒤(zIndex -1)로 보낸다. 웹에서는 위치가 지정된(absolute) 층이 위치 없는 내용물(SVG
// 글리프 등)보다 나중에 칠해져 글리프를 덮었다(2026-10-07 8081 캡처: 독 · 줄 머리 칸의 아이콘이 안 보임).
// 상자에 zIndex 0 을 주어 쌓임 맥락을 만들어 층이 상자 밖으로 내려가지 않게 한다.

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

export type PixelCorner = "card" | "small" | "pill";

/** [위아래 들임, 좌우 들임] 의 사각형들. 합집합이 계단 모양이다. */
const LAYERS: Record<PixelCorner, readonly (readonly [number, number])[]> = {
  card: [[8, 0], [4, 2], [2, 4], [0, 8]],
  small: [[4, 0], [2, 2], [0, 4]],
  pill: [[6, 0], [2, 2], [0, 6]],
};
const BORDER = 2;

export function pixelCornerLayers(corner: PixelCorner): readonly (readonly [number, number])[] {
  return LAYERS[corner];
}

function Layers({ corner, color, inset }: { corner: PixelCorner; color: string; inset: number }) {
  return <>{LAYERS[corner].map(([v, h]) => (
    <View key={`${v}-${h}-${inset}`} pointerEvents="none"
      style={[styles.layer, { top: v + inset, bottom: v + inset, left: h + inset, right: h + inset, backgroundColor: color }]} />
  ))}</>;
}

export interface PixelRoundRectProps extends ViewProps {
  fill: string;
  corner?: PixelCorner;
  /** 2px 계단 테두리 색. */
  border?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function PixelRoundRect({ fill, corner = "card", border, style, children, ...rest }: PixelRoundRectProps) {
  return <View {...rest} style={[styles.root, style]}>
    <Layers corner={corner} color={border ?? fill} inset={0} />
    {border ? <Layers corner={corner} color={fill} inset={BORDER} /> : null}
    {children}
  </View>;
}

const styles = StyleSheet.create({
  root: { position: "relative", zIndex: 0 },
  layer: { position: "absolute", zIndex: -1 },
});
