// Pattern Link edge renderer — skeleton + parallax hook (worldview v-final).
// Renders one Graph-Network edge as a base SVG line styled by proximity
// (patternLinkStyle: closer ⇒ thicker + brighter). The textured edge sprite is
// GPT-owned — pass `renderEdge` to swap the base line for art once it exists.
//
// `usePatternLinkParallax` shifts opacity + scale with a camera-depth shared
// value (Reanimated) so near edges pop and far edges recede. Standalone for now
// (NavGraph still draws its own AnimatedLine edges); this is the ready slot for
// the GPT edge-art pass, not yet wired into the live graph.

import type { ReactNode } from "react";
import { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";

import { cosmic } from "@/lib/theme/tokens";
import { patternLinkStyle, type PatternLinkStyleOpts } from "@/lib/graph/pattern-link";

export interface PatternLinkProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0 (far) .. 1 (closest to camera/focus). Drives width / opacity / saturation. */
  proximity: number;
  /** Edge color; defaults to the active-connection mint. */
  color?: string;
  styleOpts?: PatternLinkStyleOpts;
  width?: number;
  height?: number;
  /** Slot: GPT edge art. Receives the resolved stroke width + opacity. */
  renderEdge?: (style: { strokeWidth: number; opacity: number }) => ReactNode;
}

export function PatternLink({
  x1,
  y1,
  x2,
  y2,
  proximity,
  color = cosmic.signalMint,
  styleOpts,
  width,
  height,
  renderEdge,
}: PatternLinkProps) {
  const s = patternLinkStyle(proximity, styleOpts);
  if (renderEdge) return <>{renderEdge({ strokeWidth: s.strokeWidth, opacity: s.opacity })}</>;
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={s.strokeWidth} strokeOpacity={s.opacity} />
    </Svg>
  );
}

/**
 * Parallax for a Pattern Link: near edges (depth → 1) brighten + scale up; far
 * edges (depth → 0) dim + recede. Wire `depth` to the camera zoom / proximity
 * shared value. Worklet-safe; runs on the UI thread.
 */
export function usePatternLinkParallax(depth: SharedValue<number>) {
  return useAnimatedStyle(() => {
    "worklet";
    const d = Math.max(0, Math.min(1, depth.value));
    return { opacity: 0.4 + 0.6 * d, transform: [{ scale: 0.92 + 0.12 * d }] };
  });
}
