// The star summary (/me/<star>) draws the five drill layers as a ladder.
// One place decides the order and which rungs are lit, so the screen only draws.
import { DRILL_LAYERS, type DrillLayer } from "./probe";

export interface StarLadderRung {
  layer: DrillLayer;
  /** A real answer exists on this layer. */
  on: boolean;
}

/**
 * The rungs, top row first. The first layer talked through (fact) sits at the
 * bottom and the deepest (echo) on top, so the ladder fills upward like a gauge.
 */
export function starLadderRungs(covered: readonly DrillLayer[]): StarLadderRung[] {
  return [...DRILL_LAYERS].reverse().map((layer) => ({ layer, on: covered.includes(layer) }));
}
