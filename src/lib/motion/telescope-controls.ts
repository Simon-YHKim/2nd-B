/** Instrument motion is expressed in viewport fractions, never node bounds. */
export const TELESCOPE_JOG_STEP = 0.12;
export const TELESCOPE_DIAL_STEP = 0.125;

export function telescopeDialAngle(x: number, y: number): number | null {
  return Math.hypot(x, y) < 16 ? null : Math.atan2(y, x);
}

export function dialTurnDelta(previous: number, next: number): number {
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return 0;
  return Math.atan2(Math.sin(next - previous), Math.cos(next - previous)) / (Math.PI * 2);
}

export function telescopeZoom(zoom: number, turns: number, maxZoom: number): number {
  if (!Number.isFinite(turns)) return zoom;
  return Math.max(1, Math.min(maxZoom, zoom * Math.pow(2, turns)));
}

export function jogTelescopeCamera(
  camera: { x: number; y: number; zoom: number },
  dx: number,
  dy: number,
  viewport: { width: number; height: number },
) {
  return {
    ...camera,
    x: camera.x + (dx * viewport.width * TELESCOPE_JOG_STEP) / camera.zoom,
    y: camera.y + (dy * viewport.height * TELESCOPE_JOG_STEP) / camera.zoom,
  };
}

/** Position of a point when the overview is scaled about its centre. */
export function telescopePointOnScreen(
  point: { x: number; y: number },
  camera: { x: number; y: number; zoom: number },
  size: { width: number; height: number },
) {
  return {
    x: size.width / 2 + (point.x - size.width / 2 - camera.x) * camera.zoom,
    y: size.height / 2 + (point.y - size.height / 2 - camera.y) * camera.zoom,
  };
}
