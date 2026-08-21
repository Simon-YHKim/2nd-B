// 별 하나를 react-native-svg 로 그린다 (PIXEL-CLAY 규칙 1: 정수 rect).
//
// 도형 자체는 `pixel-star.ts` 가 만들고 여기서는 자리만 옮긴다. 별자리 홈과
// 기록 그래프가 같은 별을 써야 해서 컴포넌트를 나눠 뒀다 — 두 곳이 각자
// 그리면 "북극성"이 화면마다 달라 보인다.
import { G, Rect } from "react-native-svg";

import { pixelStarRects } from "./pixel-star";

export function PixelStarSvg({
  cx,
  cy,
  r,
  fill,
  opacity,
  onPress,
  accessibilityLabel,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const x = Math.round(cx);
  const y = Math.round(cy);
  return (
    // `<G opacity>` 로 묶는 이유: rect 4장이 서로 겹치는데 각 rect 에 opacity 를
    // 주면 겹친 자리만 진해져서 십자 이음매가 드러난다. 그룹으로 한 번 합성한
    // 뒤 투명도를 먹여야 이음매가 없다.
    <G opacity={opacity} onPress={onPress} accessibilityLabel={accessibilityLabel}>
      {pixelStarRects(r).map((rect, i) => (
        <Rect key={i} x={x + rect.x} y={y + rect.y} width={rect.w} height={rect.h} fill={fill} />
      ))}
    </G>
  );
}

/**
 * 별이 아닌 노드(위키 문서, 개별 기록 …)의 도형. 정수 사각형이다.
 *
 * 별과 사각형을 갈라 놓는 것이 이 파일의 요점이다 — 규칙 1 은 둘 다 rect 를
 * 요구하지만, **별처럼 보여야 하는 것은 7개 도메인과 북극성뿐**이다. 문서
 * 노드까지 광선을 달면 별자리 은유가 묽어진다(Visual Tier).
 */
export function PixelNodeSvg({
  cx,
  cy,
  r,
  fill,
  stroke,
  strokeWidth,
  onPress,
  accessibilityLabel,
}: {
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const half = Math.max(1, Math.round(r));
  return (
    <Rect
      x={Math.round(cx) - half}
      y={Math.round(cy) - half}
      width={half * 2}
      height={half * 2}
      fill={fill ?? "none"}
      stroke={stroke}
      strokeWidth={strokeWidth}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
