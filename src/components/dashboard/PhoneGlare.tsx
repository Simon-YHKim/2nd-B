// The glare (눈부심) when the phone comes out of the night sky.
//
// Decision, schedule and geometry live in `src/lib/dashboard/phone-glare.ts`
// (pure, unit-tested). This file only paints the current step.
//
// Contract with `DashboardPhone`:
// * It never takes a touch. The wrapper and the Svg are `pointerEvents="none"`,
//   so taps reach the display under it, and the phone's vertical dismiss and
//   horizontal page PanResponders (on its ancestors) see every gesture as before.
// * It never holds anything up. It owns its own clock and state, so its steps
//   re-render only this layer, and the dashboard read starts on focus exactly
//   as it did without it.
// * Screen readers never see it (it is light, not content).
// * Reduced motion paints nothing, including when it turns on mid-glare.
//
// PIXEL-CLAY: brightness is dither density (no opacity), the steps are
// discrete (no easing at all), and every shape is an integer `Rect`.
import { useEffect, useId, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";

import { DITHER_TILE, ditherCells } from "@/components/pixel/pixel-dither-cells";
import {
  markPhoneStowed,
  PHONE_GLARE_CELL_DP,
  PHONE_GLARE_FULL,
  PHONE_GLARE_STEPS,
  PHONE_GLARE_TOTAL_MS,
  phoneGlareLayers,
  phoneGlareLevelAt,
  phoneLastStowedAt,
  shouldPlayPhoneGlare,
  type GlareLayer,
  type GlareScreen,
} from "@/lib/dashboard/phone-glare";
import { m3 } from "@/lib/theme/m3";

// White display, cool starlight bloom. Both are existing sky tokens.
const TONE: Record<GlareLayer["tone"], string> = {
  wash: m3.accent.skyStarWhite,
  halo: m3.accent.starFocus,
};
const TILE_DP = DITHER_TILE * PHONE_GLARE_CELL_DP;

export function PhoneGlare({ fromHomeSky, reducedMotion, screen, width, height }: {
  fromHomeSky: boolean;
  reducedMotion: boolean;
  screen: GlareScreen;
  width: number;
  height: number;
}) {
  // Decided once, when the phone appears. A later prop change cannot start a
  // second glare; only turning reduced motion on can stop this one.
  const [play] = useState(() => shouldPlayPhoneGlare({
    fromHomeSky,
    reducedMotion,
    nowMs: Date.now(),
    lastStowedAtMs: phoneLastStowedAt(),
  }));
  const [level, setLevel] = useState(() => (play ? phoneGlareLevelAt(0) : 0));
  const idBase = `phone-glare-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // Putting the phone away starts the eyes' re-adaptation window.
  useEffect(() => () => markPhoneStowed(Date.now()), []);

  useEffect(() => {
    if (!play) return;
    const startedAt = Date.now();
    // Each boundary reads the real elapsed time, so a busy JS thread skips a
    // step instead of stretching the glare, and the level can only go down.
    const tick = () => setLevel(phoneGlareLevelAt(Date.now() - startedAt));
    const timers = [...PHONE_GLARE_STEPS.slice(1).map((step) => step.atMs), PHONE_GLARE_TOTAL_MS]
      .map((atMs) => setTimeout(tick, atMs));
    return () => timers.forEach(clearTimeout);
  }, [play]);

  if (!play || reducedMotion || level === 0) return null;
  const layers = phoneGlareLayers(screen, { width, height }, level);
  if (layers.length === 0) return null;
  const patternId = (layer: GlareLayer) => `${idBase}-${layer.tone}-${layer.level}`;
  const patterned = layers.filter((layer) => layer.level < PHONE_GLARE_FULL);

  return (
    <View
      testID="dashboard-phone-glare"
      pointerEvents="none"
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          {patterned.map((layer) => (
            // userSpaceOnUse pins every tile to the Svg origin, so the halo and
            // the display share one cell grid and the nested levels line up.
            <Pattern key={patternId(layer)} id={patternId(layer)} patternUnits="userSpaceOnUse" x={0} y={0} width={TILE_DP} height={TILE_DP}>
              {ditherCells(layer.level).map((cell, i) => (
                <Rect
                  key={i}
                  x={cell.x * PHONE_GLARE_CELL_DP}
                  y={cell.y * PHONE_GLARE_CELL_DP}
                  width={PHONE_GLARE_CELL_DP}
                  height={PHONE_GLARE_CELL_DP}
                  fill={TONE[layer.tone]}
                />
              ))}
            </Pattern>
          ))}
        </Defs>
        {layers.map((layer) => (
          <Rect
            key={`${layer.tone}-${layer.level}`}
            x={layer.x}
            y={layer.y}
            width={layer.width}
            height={layer.height}
            fill={layer.level >= PHONE_GLARE_FULL ? TONE[layer.tone] : `url(#${patternId(layer)})`}
          />
        ))}
      </Svg>
    </View>
  );
}
