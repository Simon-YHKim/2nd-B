// Canon deep-space backdrop (Claude Design loading.dc.html / prototype.dc.html):
// a radial blue glow anchored top-of-centre fading into bgEdge, plus a sparse
// cyan starfield. Token-only, no provider/i18n/font dependency, so it is safe to
// render in the pre-context loading path (InlineLoader, LoadingScreen).
//
// Replaces the legacy CosmicBackground (violet + mint nebula + big-dipper) in the
// loading surfaces, which read off-canon against the cyan deep-space identity.

import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";

// Fractional positions (x,y in 0..1) so the field scales to any viewport.
const STARS = [
  { x: 0.18, y: 0.12, r: 1.4, o: 0.5 },
  { x: 0.82, y: 0.15, r: 1.2, o: 0.4 },
  { x: 0.5, y: 0.3, r: 1.2, o: 0.34 },
  { x: 0.3, y: 0.68, r: 1.1, o: 0.32 },
  { x: 0.72, y: 0.78, r: 1.1, o: 0.3 },
  { x: 0.12, y: 0.46, r: 1, o: 0.28 },
] as const;

export function DeepSpaceBackdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ds-backdrop-glow" cx="50%" cy="40%" r="62%">
            <Stop offset="0" stopColor={deepSpace.bgMid} stopOpacity="0.55" />
            <Stop offset="0.46" stopColor={deepSpace.bgMid} stopOpacity="0.22" />
            <Stop offset="1" stopColor={deepSpace.bgEdge} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={deepSpace.bgEdge} />
        <Rect x="0" y="0" width={width} height={height} fill="url(#ds-backdrop-glow)" />
        {/* 별 — 원이 아니라 정수 rect 다(PIXEL-CLAY 규칙 1). 흐린 정도는
            `fillOpacity` 가 아니라 **미리 합성한 색**이 낸다(규칙 4). */}
        {STARS.map((s, i) => {
          const size = s.r < 1.2 ? 2 : 3;
          return (
            <Rect
              key={i}
              x={Math.round(s.x * width - size / 2)}
              y={Math.round(s.y * height - size / 2)}
              width={size}
              height={size}
              fill={flattenAlpha(deepSpace.accentSoft, s.o, deepSpace.bgEdge)}
            />
          );
        })}
      </Svg>
    </View>
  );
}
