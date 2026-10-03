// The opening's pixel fade-in from the right. Schedule and geometry live in
// `src/lib/motion/opening-fade.ts` (pure, unit-tested); this only paints the
// current bands. It never takes a touch and screen readers never see it.
//
// PIXEL-CLAY: the cover thins by dither density (no opacity), the steps are
// discrete, and every shape is an integer `Rect`.
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";

import { DITHER_TILE, ditherCells } from "@/components/pixel/pixel-dither-cells";
import { OPENING_FADE_CELL_DP, openingFadeBands } from "@/lib/motion/opening-fade";
import { deepSpace } from "@/lib/theme/tokens";

const TILE_DP = DITHER_TILE * OPENING_FADE_CELL_DP;
const FULL = DITHER_TILE * DITHER_TILE;

export function OpeningFade({ elapsedMs, width, height, reducedMotion }: { elapsedMs: number; width: number; height: number; reducedMotion: boolean }) {
  const idBase = `opening-fade-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (reducedMotion) return null;
  const bands = openingFadeBands(width, height, elapsedMs);
  if (bands.length === 0) return null;
  const levels = [...new Set(bands.map(band => band.level).filter(level => level < FULL))];
  return (
    <View testID="opening-fade" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Svg width={Math.ceil(width)} height={Math.ceil(height)} pointerEvents="none">
        <Defs>
          {levels.map(level => (
            // userSpaceOnUse pins every tile to the Svg origin, so neighbouring
            // bands share one cell grid.
            <Pattern key={level} id={`${idBase}-${level}`} patternUnits="userSpaceOnUse" x={0} y={0} width={TILE_DP} height={TILE_DP}>
              {ditherCells(level).map((cell, i) => (
                <Rect key={i} x={cell.x * OPENING_FADE_CELL_DP} y={cell.y * OPENING_FADE_CELL_DP} width={OPENING_FADE_CELL_DP} height={OPENING_FADE_CELL_DP} fill={deepSpace.bgEdge} />
              ))}
            </Pattern>
          ))}
        </Defs>
        {bands.map(band => (
          <Rect key={band.x} x={band.x} y={band.y} width={band.width} height={band.height} fill={band.level >= FULL ? deepSpace.bgEdge : `url(#${idBase}-${band.level})`} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ layer: { zIndex: 6 } });
