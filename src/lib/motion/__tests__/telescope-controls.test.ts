import { dialTurnDelta, jogTelescopeCamera, telescopeDialAngle, telescopePointOnScreen, telescopeZoom } from '../telescope-controls';

describe('telescope instruments', () => {
  test('starting in the dial centre does not invent a quarter turn', () => {
    expect(telescopeDialAngle(0, 0)).toBeNull();
    expect(telescopeDialAngle(10, 10)).toBeNull();
    expect(telescopeDialAngle(0, 32)).toBe(Math.PI / 2);
  });
  test('jog can travel beyond all graph bounds even at overview zoom', () => {
    let camera = { x: 0, y: 0, zoom: 1 };
    for (let i = 0; i < 100; i++) camera = jogTelescopeCamera(camera, -1, 1, { width: 1000, height: 1600 });
    expect(camera.x).toBe(-12000);
    expect(camera.y).toBe(19200);
  });
  test('jog slows in world space as magnification rises', () => {
    expect(jogTelescopeCamera({ x: 4, y: 8, zoom: 2 }, 1, 0, { width: 1000, height: 800 }))
      .toEqual({ x: 64, y: 8, zoom: 2 });
  });
  test('dial crosses its seam without a full revolution jump', () => {
    expect(dialTurnDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2 / (2 * Math.PI));
    expect(dialTurnDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2 / (2 * Math.PI));
    expect(dialTurnDelta(0, Number.NaN)).toBe(0);
  });
  test('zoom has instrument stops and inverse turns restore scale', () => {
    expect(telescopeZoom(2, 99, 3)).toBe(3);
    expect(telescopeZoom(2, -99, 3)).toBe(1);
    expect(telescopeZoom(telescopeZoom(1, 0.5, 3), -0.5, 3)).toBeCloseTo(1);
  });
  test('focus launch uses the current instrument position, not the original star', () => {
    expect(telescopePointOnScreen({ x: 80, y: 40 }, { x: 10, y: -20, zoom: 2 }, { width: 200, height: 100 }))
      .toEqual({ x: 40, y: 70 });
  });
});
