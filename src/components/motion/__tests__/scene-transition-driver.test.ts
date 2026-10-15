import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../SceneTransition.tsx"), "utf8");

// Device Lab round 1 (2026-10-10, Android 16 emulators): Scrap tab -> Wiki tab
// left the world route wrapper at opacity 0 (blank screen, dock invisible but
// still tappable) until the app restarted. The same order was fine on web,
// where this animation already ran on the JS driver.
test("every scene transition runs on the JS driver: one value, one writer", () => {
  const timing = source.match(/Animated\.timing\(progress,\s*\{[\s\S]*?\}\)/);
  expect(timing).not.toBeNull();
  expect(timing![0]).toMatch(/useNativeDriver:\s*false,/);
  expect(source.match(/useNativeDriver/g)).toHaveLength(1);
  expect(source.match(/Animated\.(timing|spring|decay)\(/g)).toHaveLength(1);
});

test("the driver does not depend on the platform, the scope or anything else computed per render", () => {
  expect(source).not.toMatch(/\bPlatform\b/);
  expect(source).not.toMatch(/useNativeDriver:\s*(?!false,)\S/);
});

test("a covered, reduced or unchanged scene is settled at full opacity without animating", () => {
  const settle = source.indexOf("if (!active || reduced || !changed)");
  const start = source.indexOf("progress.setValue(0)");
  expect(settle).toBeGreaterThan(-1);
  expect(start).toBeGreaterThan(settle);
  expect(source.slice(settle, start)).toMatch(/progress\.setValue\(1\);\s*return;/);
});
