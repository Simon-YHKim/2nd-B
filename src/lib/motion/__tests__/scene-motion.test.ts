import { sceneMotion, type SceneMotionKind } from "../scene-motion";

const kinds: SceneMotionKind[] = ["push", "back", "open", "home", "page-forward", "page-back", "replace", "sheet"];
const identity = { x: 0, y: 0, scale: 1, opacity: 1 };

test.each(kinds)("reduced motion shows %s immediately without fading or displacement", (kind) => {
  for (const scope of ["phone", "world"] as const) {
    expect(sceneMotion(scope, kind, true)).toMatchObject({ duration: 0, from: identity });
  }
});

test("phone opens from a smaller app surface, pushes right, and returns from the left", () => {
  expect(sceneMotion("phone", "open", false).from.scale).toBeLessThan(1);
  expect(sceneMotion("phone", "push", false).from.x).toBeGreaterThan(0);
  expect(sceneMotion("phone", "back", false).from.x).toBeLessThan(0);
  expect(sceneMotion("phone", "page-forward", false).from.x).toBeGreaterThan(0);
  expect(sceneMotion("phone", "page-back", false).from.x).toBeLessThan(0);
  expect(sceneMotion("phone", "sheet", false).from.y).toBeGreaterThan(0);
});

test.each(kinds)("phone %s settles continuously without overshooting; world moves on integer pixel steps", (kind) => {
  const phone = sceneMotion("phone", kind, false);
  const world = sceneMotion("world", kind, false);
  for (const spec of [phone, world]) {
    expect(spec.duration).toBeGreaterThan(0);
    expect(spec.duration).toBeLessThanOrEqual(360);
    expect(spec.easing(0)).toBe(0);
    expect(spec.easing(1)).toBe(1);
    let previous = 0;
    for (let frame = 0; frame <= 100; frame++) {
      const progress = spec.easing(frame / 100);
      expect(progress).toBeGreaterThanOrEqual(previous);
      expect(progress).toBeLessThanOrEqual(1);
      previous = progress;
    }
  }
  expect(phone.easing(0.5)).toBeGreaterThan(0.5);
  expect(phone.easing(0.5)).not.toBe(phone.easing(0.51));
  expect(world.easing(0.5)).toBe(world.easing(0.51));
  expect(world.from.scale).toBe(1);
  for (let frame = 0; frame <= 100; frame++) {
    const progress = world.easing(frame / 100);
    for (const origin of [world.from.x, world.from.y]) {
      const position = origin * (1 - progress);
      expect(position).toBeCloseTo(Math.round(position), 8);
    }
  }
});
