import { sampleTelescopeMotion } from '../telescope-preview';

const track = { stops: [0, 0.4, 0.8, 1], x: [0, 100, 100, 100], y: [0, 0, 0, 0], zoom: [1, 1, 3, 3] };

test('jog moves during aiming and centres at each camera phase boundary', () => {
  expect(sampleTelescopeMotion(track, 0, 0)).toMatchObject({ x: 0, y: 0, zoom: 1 });
  expect(sampleTelescopeMotion(track, 0.2, 0.1).x).toBe(-18);
  expect(sampleTelescopeMotion(track, 0.4, 0.3).x).toBe(0);
  expect(sampleTelescopeMotion(track, 0.2, 0.3).x).toBe(18);
});

test('dial follows the camera zoom while the jog remains neutral for pure zoom', () => {
  expect(sampleTelescopeMotion(track, 0.6, 0.5)).toMatchObject({ x: 0, y: 0 });
  expect(sampleTelescopeMotion(track, 0.6, 0.5).zoom).toBeCloseTo(2);
  expect(sampleTelescopeMotion(track, 1, 0.9)).toMatchObject({ x: 0, zoom: 3 });
});
