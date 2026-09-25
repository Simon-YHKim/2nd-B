import { createCameraRemote, joystickInput, zoomFromPosition, zoomToPosition } from '../camera-remote';

function harness() {
  const frames = new Map<number, (time: number) => void>();
  let id = 0;
  let now = 0;
  const onMove = jest.fn();
  const onZoom = jest.fn();
  const onMotionChange = jest.fn();
  const remote = createCameraRemote({
    zoom: 1, minZoom: 0.5, maxZoom: 5, onMove, onZoom, onMotionChange,
    requestFrame: cb => { frames.set(++id, cb); return id; },
    cancelFrame: key => { frames.delete(key); },
  });
  const advance = (count = 60, ms = 1000 / 60) => {
    for (let i = 0; i < count; i++) {
      now += ms;
      const queued = [...frames.values()]; frames.clear(); queued.forEach(cb => cb(now));
    }
  };
  return { remote, onMove, onZoom, onMotionChange, frames, advance };
}

test('absolute zoom uses supplied endpoints, logarithmic spacing and round trips', () => {
  expect(zoomFromPosition(0, 0.5, 5)).toBe(0.5);
  expect(zoomFromPosition(1, 0.5, 5)).toBe(5);
  expect(zoomFromPosition(0.5, 1, 4)).toBe(2);
  for (const zoom of [0.5, 1, 2.3, 5]) expect(zoomFromPosition(zoomToPosition(zoom, 0.5, 5), 0.5, 5)).toBeCloseTo(zoom);
  expect(zoomFromPosition(4, 1, 3)).toBe(3);
  expect(zoomFromPosition(-2, 1, 3)).toBe(1);
});

test('10% dead zone is stationary, with a continuous precision response outside it', () => {
  expect(joystickInput(0.1, 0)).toEqual({ x: 0, y: 0 });
  expect(joystickInput(0.101, 0).x).toBeLessThan(0.001);
  expect(joystickInput(0.5, 0).x).toBeGreaterThan(joystickInput(0.25, 0).x);
  expect(joystickInput(0.5, 0).x).toBeLessThan(0.5);
});

test('diagonals move both axes without exceeding the radial speed limit', () => {
  const v = joystickInput(5, -5);
  expect(v.x).toBeCloseTo(Math.SQRT1_2);
  expect(v.y).toBeCloseTo(-Math.SQRT1_2);
  expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  expect(joystickInput(NaN, 0)).toEqual({ x: 0, y: 0 });
});

test('a held joystick continues moving without new pointer events, release stops immediately', () => {
  const h = harness();
  h.remote.setPanTiltVelocity(0.7, -0.5);
  h.advance(60);
  expect(h.onMove.mock.calls.length).toBe(60);
  expect(h.onMove.mock.calls[30][0]).toBeGreaterThan(h.onMove.mock.calls[0][0]);
  expect(h.onMove.mock.calls[30][1]).toBeLessThan(0);
  h.remote.stopPanTilt();
  expect(h.frames.size).toBe(0);
  h.advance();
  expect(h.onMove).toHaveBeenCalledTimes(60);
});

test('zoom settles exactly and remains at the chosen value when the joystick stops', () => {
  const h = harness();
  h.remote.setZoom(2.3);
  h.remote.setPanTiltVelocity(1, 0);
  h.advance(4);
  h.remote.stopPanTilt();
  const moves = h.onMove.mock.calls.length;
  h.advance();
  expect(h.onZoom).toHaveBeenLastCalledWith(2.3);
  expect(h.onMove).toHaveBeenCalledTimes(moves);
  expect(h.frames.size).toBe(0);
});

test('fail-safe cancels both pending motion and zoom, with no stale callbacks', () => {
  const h = harness();
  h.remote.setPanTiltVelocity(1, 1); h.remote.setZoom(5);
  h.advance(4); h.remote.stop();
  const count = h.onMove.mock.calls.length;
  const zooms = h.onZoom.mock.calls.length;
  h.advance();
  expect(h.onMove).toHaveBeenCalledTimes(count);
  expect(h.onZoom).toHaveBeenCalledTimes(zooms);
  expect(h.frames.size).toBe(0);
});

test('reset/external zoom synchronises before the next command', () => {
  const h = harness();
  h.remote.setZoom(5); h.advance(); h.remote.stop(); h.remote.syncZoom(1);
  h.onZoom.mockClear();
  h.remote.setZoom(1.1); h.advance(1);
  expect(h.onZoom.mock.calls[0][0]).toBeGreaterThan(1);
  expect(h.onZoom.mock.calls[0][0]).toBeLessThan(1.1);
});

test('hold distance is frame-rate independent and background gaps cannot teleport', () => {
  const a = harness(), b = harness();
  a.remote.setPanTiltVelocity(1, 0); b.remote.setPanTiltVelocity(1, 0);
  a.advance(120); b.advance(60, 1000 / 30);
  const sum = (h: ReturnType<typeof harness>) => h.onMove.mock.calls.reduce((n, [x]) => n + x, 0);
  expect(Math.abs(sum(a) - sum(b))).toBeLessThan(0.015);
  a.advance(1, 90000);
  expect(a.onMove.mock.calls.at(-1)![0]).toBeLessThanOrEqual(0.55 * 0.05);
});

test('motion audio follows actual frames, remains through zoom settling and stops once', () => {
  const h = harness();
  h.remote.setPanTiltVelocity(1, -1); h.remote.setZoom(3);
  expect(h.onMotionChange).not.toHaveBeenCalled();
  h.advance(3); expect(h.onMotionChange.mock.calls).toEqual([[true]]);
  h.remote.stopPanTilt(); expect(h.onMotionChange.mock.calls).toEqual([[true]]);
  h.advance(); expect(h.onMotionChange.mock.calls).toEqual([[true], [false]]);
});

test('neutral, repeated zoom and clamped zoom endpoints stay silent', () => {
  const h = harness();
  h.remote.setPanTiltVelocity(0, 0); h.remote.setZoom(1); h.advance();
  expect(h.onMotionChange).not.toHaveBeenCalled();
  h.remote.setZoom(10); h.advance(); h.onMotionChange.mockClear();
  h.remote.setZoom(6); h.advance();
  expect(h.onMotionChange).not.toHaveBeenCalled();
});

test('stop cuts loop state immediately and no later frame can restart it', () => {
  const h = harness();
  h.remote.setPanTiltVelocity(-1, 1); h.advance(4); h.remote.stop(); h.advance();
  expect(h.onMotionChange.mock.calls).toEqual([[true], [false]]);
});
