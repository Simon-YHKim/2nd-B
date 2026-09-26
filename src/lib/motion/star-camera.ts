type Point = { x: number; y: number };
type Viewport = { width: number; height: number };

export const STAR_CAMERA_STOPS = [0, 0.4, 0.8, 0.9, 1];

/** One world camera. Its first keyframe is exactly the current jog/dial pose. */
export function starCameraFlight(
  point: Point,
  camera: { x: number; y: number; zoom: number },
  world: Viewport,
  viewport: Viewport,
  controlsHeight: number,
  starRadius: number,
) {
  const frame = starDestinationFrame(viewport);
  const worldCentre = { x: viewport.width / 2, y: (viewport.height - controlsHeight) / 2 };
  const relative = { x: point.x - world.width / 2, y: point.y - world.height / 2 };
  const start = { x: -camera.x * camera.zoom, y: -camera.y * camera.zoom };
  const zoom = frame.radius / starRadius;
  const pan = (z: number) => ({
    x: frame.centre.x - worldCentre.x - relative.x * z,
    y: frame.centre.y - worldCentre.y - relative.y * z,
  });
  const aim = pan(camera.zoom);
  const end = pan(zoom);
  // Lens breathing stays centred: the star and its light are one physical body.
  const focusZoom = zoom * 1.025;
  const focus = pan(focusZoom);
  return {
    ...frame, worldCentre,
    origin: { x: worldCentre.x + start.x + relative.x * camera.zoom, y: worldCentre.y + start.y + relative.y * camera.zoom },
    x: [start.x, aim.x, end.x, focus.x, end.x],
    y: [start.y, aim.y, end.y, focus.y, end.y],
    zoom: [camera.zoom, camera.zoom, zoom, focusZoom, zoom],
  };
}

/** Half the old destination's diameter, not half its area. */
export function starDestinationFrame(size: Viewport) {
  const diameter = Math.max(80, Math.min(size.width - 32, size.height - 100) * 0.92) * 0.5;
  const radius = diameter / 2;
  return { diameter, radius, centre: { x: size.width / 2, y: Math.max(radius + 56, size.height / 2) } };
}

/** Distant stars move less than the target; bounded roll avoids a spinning sky. */
export function starCameraAim(origin: Point, size: Viewport) {
  const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));
  const dx = size.width / 2 - origin.x;
  const dy = size.height / 2 - origin.y;
  return { x: clamp(dx * 0.12, 18), y: clamp(dy * 0.12, 18), roll: clamp(dx * 0.025, 3) };
}
