// Decorative Narrative-crew layer ("모모크루") — skeleton. The crew pixel
// sprites are owned by the GPT art workstream; until they land this renders
// nothing. The count + animation/visibility contract is real now, so wiring the
// sprites later is a one-line swap inside the map below (pass `renderCrew`).
//
// Performance + accessibility contract (already honored by the props the parent
// computes via useCrewCount):
//   - `count` is density + node-proportional and LOD-capped (crewCountForDensity),
//     so the parent never asks for an unbounded number of sprites.
//   - `animated=false` (prefers-reduced-motion) → render static idle poses, no
//     ticker subscription.
//   - `visible=false` (graph offscreen, or a node sheet covers it) → render
//     nothing and drop any animation subscription so off-screen crew cost ~0.

import type { ReactNode } from "react";
import { View, StyleSheet } from "react-native";

export interface CrewLayerProps {
  /** How many crew sprites to show (already density- + LOD-bounded). */
  count: number;
  /** Walk-cycle animation on? false under prefers-reduced-motion → static. */
  animated: boolean;
  /** Hide + unsubscribe when offscreen or a sheet covers the graph. */
  visible?: boolean;
  /** Slot: provided once the GPT crew sprites exist. Receives the sprite index
   *  and whether it should animate. */
  renderCrew?: (index: number, animated: boolean) => ReactNode;
}

export function CrewLayer({ count, animated, visible = true, renderCrew }: CrewLayerProps) {
  if (!visible || count <= 0) return null;
  // Assets pending: with no `renderCrew` slot wired yet, draw nothing.
  if (!renderCrew) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>{renderCrew(i, animated)}</View>
      ))}
    </View>
  );
}
