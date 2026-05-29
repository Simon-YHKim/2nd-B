// Walker path math for the village residents (CharacterPathLayer) — pure,
// side-effect-free, so the patrol motion has a single tested source of
// truth. Phase-E evolves the residents from "drift around one anchor" to
// "patrol back and forth along a short path" with a 2-frame walk cycle.
//
// A resident owns two anchor points (home → waypoint) expressed as
// fractions of the viewport. As a 0..1 loop value `t` advances it
// ping-pongs between them, walking out then back, so the loop wrap is
// seamless (t=0 and t=1 are the same end of the trip).

export interface PathPoint {
  x: number;
  y: number;
}

/** Triangle wave: 0→1→0 as t goes 0→0.5→1. Endpoints both map to 0 so a
 *  linear 0→1 loop produces a seamless out-and-back with no jump. */
export function pingPong(t: number): number {
  const c = ((t % 1) + 1) % 1; // wrap into [0,1)
  return c < 0.5 ? c * 2 : 2 - c * 2;
}

/** Position along the patrol leg at loop value `t`. `from`/`to` are the two
 *  anchor ends; `arc` lifts the mid-point of the trip by this many px so the
 *  walk reads as a gentle hop rather than a straight slide. */
export function walkerPosition(
  t: number,
  from: PathPoint,
  to: PathPoint,
  arc = 0,
): PathPoint {
  const p = pingPong(t);
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  // Arc peaks at the trip mid-point (p = 0.5) and is 0 at both ends.
  const lift = arc * Math.sin(p * Math.PI);
  return { x, y: y - lift };
}

/** Walk-cycle frame index (0-based) at loop value `t`. The sprite alternates
 *  every `1/(steps)` of the loop; while at rest (turn-around points) the
 *  caller can fall back to the idle frame. */
export function walkFrame(t: number, frameCount = 2, steps = 8): number {
  if (frameCount <= 1) return 0;
  const c = ((t % 1) + 1) % 1;
  return Math.floor(c * steps) % frameCount;
}

/** Horizontal facing: +1 when walking toward `to`, -1 when returning. Used
 *  to flip the sprite so it always faces its direction of travel. Returns
 *  the previous facing at the exact turn points to avoid flicker. */
export function walkerFacing(t: number, from: PathPoint, to: PathPoint): 1 | -1 {
  const c = ((t % 1) + 1) % 1;
  const movingForward = c < 0.5; // out-bound half of the trip
  const dirX = to.x - from.x;
  if (dirX === 0) return 1;
  const forwardFaces = dirX > 0 ? 1 : -1;
  return (movingForward ? forwardFaces : (-forwardFaces as 1 | -1)) as 1 | -1;
}

/** True when the resident is near a turn-around point (within `eps` of an
 *  end), so the caller can show an idle/pause frame instead of a walk frame. */
export function isResting(t: number, eps = 0.04): boolean {
  const p = pingPong(t);
  return p < eps || p > 1 - eps;
}
