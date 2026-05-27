// Zoom math for NavGraph — pure, side-effect-free.
//
// The graph lives in screen space. A point is rendered as:
//   screenPoint = graphPoint * scale + pan
//
// Pinch / wheel zoom changes `scale`, but the user expects the point
// under their pointer (the *focal*) to stay put. We back-solve `pan`
// for the new scale to satisfy that invariant.

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function clampScale(s: number, min: number = ZOOM_MIN, max: number = ZOOM_MAX): number {
  "worklet";
  if (s < min) return min;
  if (s > max) return max;
  return s;
}

export function panForFocalZoom(
  prevScale: number,
  nextScale: number,
  focal: Point,
  prevPan: Point,
): Point {
  "worklet";
  // graphPoint = (focal - prevPan) / prevScale
  // We want focal = graphPoint * nextScale + nextPan
  //   ⇒ nextPan = focal - graphPoint * nextScale
  //             = focal - (focal - prevPan) * (nextScale / prevScale)
  const ratio = nextScale / prevScale;
  return {
    x: focal.x - (focal.x - prevPan.x) * ratio,
    y: focal.y - (focal.y - prevPan.y) * ratio,
  };
}

export function clampPan(pan: Point, scale: number, viewport: Viewport): Point {
  "worklet";
  if (scale <= 1) return { x: 0, y: 0 };
  const overflowX = viewport.width * (scale - 1);
  const overflowY = viewport.height * (scale - 1);
  const maxX = overflowX / 2;
  const maxY = overflowY / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}
