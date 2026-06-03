// Decorative Narrative-crew layer ("모모크루"). Scatters `count` ambient crew
// across the graph at seeded positions (crewLayout — biased to the lower band so
// they don't crowd the hub/ribbon). The sprite itself comes from the `renderCrew`
// slot (wired to the v3 momo-crew SVGs in NavGraph behind EXPO_PUBLIC_USE_V3_ART);
// with no slot it renders nothing, preserving the old skeleton behavior.
//
// Contract honored by the props the parent computes via useCrewCount:
//   - `count` is density + node-proportional and LOD-capped (crewCountForDensity).
//   - `visible=false` (graph offscreen / a node sheet covers it) → render nothing.
//   - `animated` is reserved for a future gentle drift; positions are static now.

import type { ReactNode } from "react";
import { View, StyleSheet } from "react-native";

import { LivingAsset } from "@/components/motion/LivingAsset";
import { crewLayout } from "@/lib/graph/crew-layout";

export interface CrewLayerProps {
  /** How many crew sprites to show (already density- + LOD-bounded). */
  count: number;
  /** Reserved: gentle drift later. Positions are static for now. */
  animated: boolean;
  /** Hide when offscreen or a sheet covers the graph. */
  visible?: boolean;
  /** Viewport, for seeded scatter positions. */
  width: number;
  height: number;
  /** Slot: render one crew sprite at the given index + px size. No slot → nothing. */
  renderCrew?: (index: number, size: number) => ReactNode;
}

export function CrewLayer({ count, animated, visible = true, width, height, renderCrew }: CrewLayerProps) {
  if (!visible || count <= 0 || !renderCrew) return null;
  const slots = crewLayout(count, width, height);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {slots.map((s, i) => (
        <View
          key={i}
          style={{ position: "absolute", left: s.x - s.size / 2, top: s.y - s.size / 2, width: s.size, height: s.size }}
        >
          {animated ? (
            <LivingAsset preset="crew" id={i} size={s.size} pointerEvents="none">
              {renderCrew(i, s.size)}
            </LivingAsset>
          ) : (
            renderCrew(i, s.size)
          )}
        </View>
      ))}
    </View>
  );
}
