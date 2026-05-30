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

// Free pan with soft bounds (closeout-v3 #3): let the user drift out past the
// village into empty cosmic space — at least `slack` viewport-widths beyond
// the content overflow in every direction, even at scale <= 1. Not a hard
// village clamp; just a generous limit so the map can't be lost entirely.
export function clampPanFree(pan: Point, scale: number, viewport: Viewport, slack = 1.2): Point {
  "worklet";
  const overflowX = viewport.width * Math.max(0, scale - 1);
  const overflowY = viewport.height * Math.max(0, scale - 1);
  const maxX = overflowX / 2 + viewport.width * slack;
  const maxY = overflowY / 2 + viewport.height * slack;
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

// Distance of the camera from the home view (pan 0,0 / scale 1), used to fade
// in the "원래대로" reset button (closeout-v3 #4).
export function cameraOffHome(pan: Point, scale: number): { dist: number; off: boolean } {
  "worklet";
  const dist = Math.sqrt(pan.x * pan.x + pan.y * pan.y);
  const off = dist > 280 || scale < 0.72 || scale > 1.9;
  return { dist, off };
}
