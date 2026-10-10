import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../SceneTransition.tsx"), "utf8");

// Device Lab round 1 (2026-10-10, Android 16 emulators): Scrap tab -> Wiki tab
// left the world route wrapper at opacity 0 (blank screen, dock invisible but
// still tappable) until the app restarted. The same order was fine on web,
// where this animation already ran on the JS driver.
test("world scenes never run on the native driver; only the phone may", () => {
  const timing = source.match(/Animated\.timing\(progress,\s*\{[\s\S]*?\}\)/);
  expect(timing).not.toBeNull();
  expect(timing![0]).toContain('useNativeDriver: resolvedScope === "phone" && Platform.OS !== "web",');
  expect(source.match(/useNativeDriver/g)).toHaveLength(1);
});

test("one mounted scene keeps one driver: the scope is fixed by its prop or its place in the tree", () => {
  expect(source).toContain('const resolvedScope = scope ?? (inPhone ? "phone" : "world");');
  expect(source).toMatch(/\}, \[active, animateOnMount, progress, reduced, resolvedScope, spec, transitionKey\]\);/);
});

test("a covered, reduced or unchanged scene is settled at full opacity without animating", () => {
  const settle = source.indexOf("if (!active || reduced || !changed)");
  const start = source.indexOf("progress.setValue(0)");
  expect(settle).toBeGreaterThan(-1);
  expect(start).toBeGreaterThan(settle);
  expect(source.slice(settle, start)).toMatch(/progress\.setValue\(1\);\s*return;/);
});
