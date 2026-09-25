import { starCameraAim, starDestinationFrame, starCameraFlight } from '../star-camera';
import { telescopePointOnScreen } from '../telescope-controls';

describe('selected-star camera', () => {
  test.each([[320, 480], [425, 570], [768, 700], [320, 160]])(
    'the settled diameter is exactly half the previous size at %ix%i', (width, height) => {
      const frame = starDestinationFrame({ width, height });
      const previousDiameter = Math.max(80, Math.min(width - 32, height - 100) * 0.92);
      expect(frame.diameter).toBe(previousDiameter / 2);
      expect(frame.centre.x).toBe(width / 2);
      expect(frame.centre.y - frame.radius).toBeGreaterThanOrEqual(56);
      expect(frame.centre.y + frame.radius).toBeLessThanOrEqual(height);
    },
  );

  test('aiming shifts the distant sky opposite the target and limits camera roll', () => {
    const size = { width: 425, height: 570 };
    const right = starCameraAim({ x: 1000, y: 1000 }, size);
    const left = starCameraAim({ x: -1000, y: -1000 }, size);
    expect(right).toEqual({ x: -18, y: -18, roll: -3 });
    expect(left).toEqual({ x: 18, y: 18, roll: 3 });
    expect(starCameraAim({ x: 212.5, y: 285 }, size)).toEqual({ x: 0, y: 0, roll: 0 });
  });

  test.each([{ x: 0, y: 0, zoom: 1 }, { x: 100, y: -70, zoom: 2.4 }, { x: -45, y: 40, zoom: 1.5 }])(
    'flies from the actual instrument viewpoint %j and centres the same physical star', (camera) => {
      const world = { width: 380, height: 366 };
      const viewport = { width: 425, height: 565 };
      const point = { x: 310, y: 180 };
      const flight = starCameraFlight(point, camera, world, viewport, 140, 13);
      const previous = telescopePointOnScreen(point, camera, world);
      expect(flight.origin.x).toBeCloseTo(previous.x + (viewport.width - world.width) / 2);
      expect(flight.origin.y).toBeCloseTo(previous.y + (viewport.height - 140 - world.height) / 2);
      expect(flight.zoom[0]).toBe(camera.zoom);
      expect(flight.x[0]).toBe(-camera.x * camera.zoom);
      expect(flight.y[0]).toBe(-camera.y * camera.zoom);
      for (const i of [1, 2, 3]) {
        expect(flight.worldCentre.x + flight.x[i] + (point.x - world.width / 2) * flight.zoom[i]).toBeCloseTo(flight.centre.x);
        expect(flight.worldCentre.y + flight.y[i] + (point.y - world.height / 2) * flight.zoom[i]).toBeCloseTo(flight.centre.y);
      }
      expect(26 * flight.zoom[3]).toBeCloseTo(starDestinationFrame(viewport).diameter);
    },
  );

  test('opposite targets pan in opposite directions, without resetting the starting zoom', () => {
    const world = { width: 380, height: 366 };
    const viewport = { width: 425, height: 565 };
    const camera = { x: 40, y: 0, zoom: 2 };
    const left = starCameraFlight({ x: 80, y: 180 }, camera, world, viewport, 140, 13);
    const right = starCameraFlight({ x: 310, y: 180 }, camera, world, viewport, 140, 13);
    expect(left.x[1] - left.x[0]).toBeGreaterThan(0);
    expect(right.x[1] - right.x[0]).toBeLessThan(0);
    expect(left.zoom[0]).toBe(2);
    expect(right.zoom[0]).toBe(2);
  });
});
