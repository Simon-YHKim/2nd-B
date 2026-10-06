import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SKY_DEPTH, SKY_PARALLAX_MARGIN, skyParallax } from '../sky-parallax';

test('a centred camera leaves the sky where it was', () => {
  expect(skyParallax({ x: 0, y: 0, zoom: 1 }, SKY_DEPTH.neural, false)).toEqual({ x: 0, y: 0, scale: 1 });
});

test('the sky follows the camera less than the stars, nearer layers more than farther ones', () => {
  const camera = { x: 100, y: -60, zoom: 1 };
  const far = skyParallax(camera, SKY_DEPTH.starfield, false);
  const near = skyParallax(camera, SKY_DEPTH.neural, false);
  // The world moves by -camera.x * zoom = -100; the sky moves the same way, by less.
  expect(far.x).toBe(-7);
  expect(near.x).toBe(-14);
  expect(near.y).toBe(8);
  expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x));
});

test('the shift never leaves the margin, stays on whole pixels, and only zooms in', () => {
  const big = skyParallax({ x: 5000, y: -5000, zoom: 3 }, SKY_DEPTH.neural, false);
  expect(big.x).toBe(-SKY_PARALLAX_MARGIN);
  expect(big.y).toBe(SKY_PARALLAX_MARGIN);
  expect(Number.isInteger(skyParallax({ x: 33.3, y: 1.7, zoom: 1.37 }, SKY_DEPTH.starfield, false).x)).toBe(true);
  expect(skyParallax({ x: 0, y: 0, zoom: 0.5 }, SKY_DEPTH.neural, false).scale).toBe(1);
  expect(skyParallax({ x: 0, y: 0, zoom: 2 }, SKY_DEPTH.neural, false).scale).toBeCloseTo(1.07);
});

test('reduced motion keeps the sky still', () => {
  expect(skyParallax({ x: 120, y: 80, zoom: 2.5 }, SKY_DEPTH.neural, true)).toEqual({ x: 0, y: 0, scale: 1 });
});

test('the home draws both sky layers oversized by the margin and shifts them by their depth', () => {
  const home = readFileSync(resolve(__dirname, '..', 'ConstellationHome.tsx'), 'utf8').replace(/\r\n/g, '\n');
  expect(home).toContain('const nearSky = skyParallax(camera, SKY_DEPTH.neural, reducedMotion);');
  expect(home).toContain('const farSky = skyParallax(camera, SKY_DEPTH.starfield, reducedMotion);');
  expect(home).toContain('<NeuralFieldBackdrop w={stage.w + 2 * SKY_PARALLAX_MARGIN} h={stage.h + 2 * SKY_PARALLAX_MARGIN} />');
  expect(home).toContain('skyLayer: { position: "absolute", top: -SKY_PARALLAX_MARGIN, left: -SKY_PARALLAX_MARGIN, right: -SKY_PARALLAX_MARGIN, bottom: -SKY_PARALLAX_MARGIN }');
});
