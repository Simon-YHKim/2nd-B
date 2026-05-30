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

/** Pose of a resident travelling a CLOSED multi-waypoint route (a patrol that
 *  visits several villages and loops). Distinct from the single-leg ping-pong
 *  helpers above: here the route is a ring (the last point connects back to the
 *  first), travel is CONSTANT speed (time on a leg ∝ its length, so a worker
 *  never sprints down a long road), and an optional `dwell` parks the worker at
 *  each stop so it reads as pausing to work before moving on. Pure in `t`, so a
 *  global-clock driver keeps motion continuous across remounts. */
export interface RoutePose {
  x: number;
  y: number;
  /** Horizontal facing of travel: +1 rightward, -1 leftward. */
  facing: 1 | -1;
  /** True while parked at a stop (dwell), so the caller can show an idle pose. */
  resting: boolean;
  /** Index of the leg being walked, or the leg just arrived from while resting. */
  seg: number;
}

function legFacing(ax: number, bx: number): 1 | -1 {
  if (bx === ax) return 1; // purely vertical leg keeps a stable facing
  return bx > ax ? 1 : -1;
}

export function walkerRoutePose(
  t: number,
  route: readonly PathPoint[],
  opts: { arc?: number; dwell?: number } = {},
): RoutePose {
  const n = route.length;
  if (n === 0) return { x: 0, y: 0, facing: 1, resting: true, seg: 0 };
  if (n === 1) return { x: route[0].x, y: route[0].y, facing: 1, resting: true, seg: 0 };

  const arc = opts.arc ?? 0;

  // Leg lengths around the closed ring (leg i: route[i] → route[(i+1)%n]).
  const legLen: number[] = new Array(n);
  let totalLen = 0;
  for (let i = 0; i < n; i++) {
    const a = route[i];
    const b = route[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    legLen[i] = d;
    totalLen += d;
  }
  if (totalLen === 0) return { x: route[0].x, y: route[0].y, facing: 1, resting: true, seg: 0 };

  // Dwell is sized in the same px-units as travel (a fraction of the average
  // leg) so one normalized cycle covers walking + resting at a single scale.
  const dwellLen = Math.max(0, opts.dwell ?? 0) * (totalLen / n);
  const cycleLen = totalLen + dwellLen * n;

  // Where we are within the cycle, in px-units.
  const c = (((t % 1) + 1) % 1) * cycleLen;

  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = route[i];
    const b = route[(i + 1) % n];
    // Walking leg i.
    if (c < acc + legLen[i]) {
      const p = legLen[i] === 0 ? 0 : (c - acc) / legLen[i];
      const lift = arc * Math.sin(p * Math.PI);
      return {
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p - lift,
        facing: legFacing(a.x, b.x),
        resting: false,
        seg: i,
      };
    }
    acc += legLen[i];
    // Resting at the arrival vertex b.
    if (dwellLen > 0 && c < acc + dwellLen) {
      return { x: b.x, y: b.y, facing: legFacing(a.x, b.x), resting: true, seg: i };
    }
    acc += dwellLen;
  }

  // Numerical guard (c === cycleLen): wrap to the route start.
  return { x: route[0].x, y: route[0].y, facing: legFacing(route[0].x, route[1].x), resting: false, seg: 0 };
}
