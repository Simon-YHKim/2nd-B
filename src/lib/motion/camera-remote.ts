type Vector = { x: number; y: number };
const ZERO = { x: 0, y: 0 };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Lens spacing: absolute position, not an accumulating wheel command. */
export function zoomFromPosition(position: number, minZoom: number, maxZoom: number) {
  return minZoom * Math.pow(maxZoom / minZoom, clamp01(position));
}
export function zoomToPosition(zoom: number, minZoom: number, maxZoom: number) {
  return maxZoom <= minZoom ? 0 : clamp01(Math.log(zoom / minZoom) / Math.log(maxZoom / minZoom));
}

/** Radial dead zone avoids diagonal overspeed and a jump at the neutral edge. */
export function joystickInput(x: number, y: number): Vector {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return ZERO;
  const distance = Math.hypot(x, y);
  if (distance <= 0.1) return ZERO;
  const speed = Math.pow((Math.min(1, distance) - 0.1) / 0.9, 1.7);
  return { x: x / distance * speed, y: y / distance * speed };
}

/** Local viewport adapter, not hardware/network communication.
 * Movement is in viewport fractions/second. Injected clock makes stop/hold testable.
 */
export function createCameraRemote(options: {
  zoom: number; minZoom: number; maxZoom: number;
  onZoom: (zoom: number) => void;
  onMove: (dx: number, dy: number) => void;
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
}) {
  let currentZoom = options.zoom, targetZoom = options.zoom;
  let zoomPending = false;
  let velocity = ZERO, target = ZERO;
  let frame: number | null = null, previousTime: number | null = null;
  const moving = () => target.x !== 0 || target.y !== 0;
  const cancel = () => {
    if (frame !== null) options.cancelFrame(frame);
    frame = null; previousTime = null;
  };
  const schedule = () => { if (frame === null) frame = options.requestFrame(step); };
  function step(time: number) {
    frame = null;
    const dt = previousTime === null ? 1 / 60 : Math.max(0, Math.min(0.05, (time - previousTime) / 1000));
    previousTime = time;
    if (moving()) {
      const alpha = 1 - Math.exp(-dt / 0.07);
      velocity = { x: velocity.x + (target.x - velocity.x) * alpha, y: velocity.y + (target.y - velocity.y) * alpha };
      options.onMove(velocity.x * 0.55 * dt, velocity.y * 0.55 * dt);
    }
    if (zoomPending) {
      currentZoom += (targetZoom - currentZoom) * (1 - Math.exp(-dt / 0.045));
      if (Math.abs(targetZoom - currentZoom) < 0.001) { currentZoom = targetZoom; zoomPending = false; }
      options.onZoom(currentZoom);
    }
    if (moving() || zoomPending) schedule(); else previousTime = null;
  }
  const stopPanTilt = () => {
    target = ZERO; velocity = ZERO;
    if (!zoomPending) cancel();
  };
  return {
    setZoom(value: number) {
      if (!Number.isFinite(value)) return;
      targetZoom = Math.max(options.minZoom, Math.min(options.maxZoom, value));
      zoomPending = true; schedule();
    },
    syncZoom(value: number) { if (!zoomPending) currentZoom = targetZoom = value; },
    setPanTiltVelocity(x: number, y: number) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) { stopPanTilt(); return; }
      const magnitude = Math.max(1, Math.hypot(x, y));
      target = { x: x / magnitude, y: y / magnitude };
      if (moving()) schedule(); else stopPanTilt();
    },
    stopPanTilt,
    stop() {
      cancel(); target = ZERO; velocity = ZERO;
      targetZoom = currentZoom; zoomPending = false;
    },
  };
}

/** Unbounded pan at constant screen-space speed regardless of magnification. */
export function moveTelescopeCamera(
  camera: { x: number; y: number; zoom: number }, dx: number, dy: number,
  viewport: { width: number; height: number },
) {
  return { ...camera, x: camera.x + dx * viewport.width / camera.zoom, y: camera.y + dy * viewport.height / camera.zoom };
}
