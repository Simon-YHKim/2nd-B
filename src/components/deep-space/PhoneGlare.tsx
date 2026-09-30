// The glare (눈부심) when the pocket phone is raised into the night sky.
//
// Decision, schedule and geometry live in `src/lib/motion/phone-glare.ts`
// (pure, unit-tested). `PocketPhone` decides WHEN (a collapsed -> raised move
// that reached the top) and mounts this with a fresh key; this file only plays
// the schedule from its own mount and paints the current step.
//
// Contract with `PocketPhone`:
// * It never takes a touch. The wrapper and the Svg are `pointerEvents="none"`,
//   so the swipe PanResponder and the tap that opens the dashboard see every
//   gesture as before.
// * It owns its own clock and state, so its steps re-render only this layer.
// * Screen readers never see it (it is light, not content).
// * Reduced motion paints nothing, including when it turns on mid-glare.
//
// PIXEL-CLAY: brightness is dither density (no opacity), the steps are
// discrete (no easing at all), and every shape is an integer `Rect`.
import { useEffect, useId, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";

import { DITHER_TILE, ditherCells } from "@/components/pixel/pixel-dither-cells";
import {
  PHONE_GLARE_CELL_DP,
  PHONE_GLARE_FULL,
  PHONE_GLARE_STEPS,
  PHONE_GLARE_TOTAL_MS,
  phoneGlareLayers,
  phoneGlareLevelAt,
  type GlareLayer,
  type GlareScreen,
} from "@/lib/motion/phone-glare";
import { m3 } from "@/lib/theme/m3";

// White display, cool starlight bloom. Both are existing sky tokens.
const TONE: Record<GlareLayer["tone"], string> = {
  wash: m3.accent.skyStarWhite,
  halo: m3.accent.starFocus,
};
const TILE_DP = DITHER_TILE * PHONE_GLARE_CELL_DP;

export function PhoneGlare({ reducedMotion, screen, width, height, onDone }: {
  reducedMotion: boolean;
  screen: GlareScreen;
  width: number;
  height: number;
  /** Called once when the last step ends. */
  onDone?: () => void;
}) {
  const [level, setLevel] = useState(() => phoneGlareLevelAt(0));
  const idBase = `phone-glare-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const startedAt = Date.now();
    // Each boundary reads the real elapsed time, so a busy JS thread skips a
    // step instead of stretching the glare, and the level can only go down.
    const tick = () => setLevel(phoneGlareLevelAt(Date.now() - startedAt));
    const timers = PHONE_GLARE_STEPS.slice(1).map((step) => setTimeout(tick, step.atMs));
    timers.push(setTimeout(() => { setLevel(0); onDoneRef.current?.(); }, PHONE_GLARE_TOTAL_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  if (reducedMotion || level === 0) return null;
  const layers = phoneGlareLayers(screen, { width, height }, level);
  if (layers.length === 0) return null;
  const patternId = (layer: GlareLayer) => `${idBase}-${layer.tone}-${layer.level}`;
  const patterned = layers.filter((layer) => layer.level < PHONE_GLARE_FULL);

  return (
    <View
      testID="home-phone-glare"
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
