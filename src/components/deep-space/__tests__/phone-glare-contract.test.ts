// The glare's promises. Render tests are blocked in this repo (RN 0.85), so
// these read the source; the schedule and geometry are value-tested in
// src/lib/motion/__tests__/phone-glare.test.ts.
//
// Simon 2026-09-30: the glare is for RAISING the home pocket phone ("핸드폰을
// 스와이프로 위로 올렸을때"), not for opening the dashboard.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const glare = strip(read("src/components/deep-space/PhoneGlare.tsx"));
const pocket = read("src/components/deep-space/PocketPhone.tsx");
const pocketCode = strip(pocket);
const dashboard = read("src/components/dashboard/DashboardPhone.tsx");

test("the dashboard plays no glare: the phone dazzles once per take-out, on the raise", () => {
  expect(dashboard).not.toMatch(/PhoneGlare|phone-glare|glare/i);
});

test("only a collapsed -> raised move that reaches the top starts it", () => {
  expect(pocketCode).toContain("const raising = next && !expanded.current;");
  expect(pocketCode).toMatch(/\.start\(\(\{ finished \}\) => \{\s*if \(!finished \|\| !raising \|\| !expanded\.current\) return;/);
  expect(pocketCode).toContain("shouldPlayPhoneGlare({ reducedMotion, nowMs: Date.now(), lastStowedAtMs: phoneLastStowedAt() })");
  // Every way to raise the phone goes through settle(true): swipe, tap, ArrowUp, a11y expand.
  expect(pocketCode).toContain("if (gesture.dy < -SWIPE_THRESHOLD || gesture.vy < -0.4) settle(true)");
  expect(pocketCode).toContain("if (!expanded.current) { settle(true); return; }");
  expect(pocketCode).toContain("if (event.key === 'ArrowUp' && !expanded.current) { event.preventDefault(); settle(true); }");
  expect(pocketCode).toContain("if (actionName === 'expand') settle(true);");
  expect(pocketCode.match(/setGlareRun\(glareSeq\.current\)/g)).toHaveLength(1);
});

test("every way the raised phone goes back down stows it and ends the glare", () => {
  expect(pocketCode).toMatch(/const stow = useCallback\(\(\) => \{\s*markPhoneStowed\(Date\.now\(\)\);\s*setGlareRun\(null\);/);
  // swipe/tap lowering through settle(false)
  expect(pocketCode).toContain("if (!next && expanded.current) stow();");
  // the tap that opens the dashboard
  expect(pocketCode).toMatch(/stow\(\);\s*expanded\.current = false;\s*setIsExpanded\(false\);\s*onExpandedChangeRef\.current\(false\);\s*openRef\.current\(\);/);
  // the home losing focus
  expect(pocketCode).toMatch(/if \(expanded\.current\) \{\s*onExpandedChangeRef\.current\(false\);\s*stow\(\);/);
});

test("the glare is an untouchable sibling of the clipped phone, riding the same slide", () => {
  const phoneEnd = pocketCode.indexOf("</Animated.View>");
  const mount = pocketCode.indexOf("<PhoneGlare");
  expect(phoneEnd).toBeGreaterThan(-1);
  expect(mount).toBeGreaterThan(phoneEnd);
  expect(pocketCode).toMatch(/<Animated\.View pointerEvents="none" style=\{\[styles\.glare, \{ transform: \[\{ translateY: slide \}\] \}\]\}>/);
  expect(pocketCode).toContain("key={glareRun}");
  expect(pocketCode).toContain("reducedMotion={reducedMotion}");
  expect(pocketCode).toContain("glare: { position: 'absolute', ...GLARE.box }");
  expect(pocketCode).toContain("phone: { width: POCKET_PHONE_WIDTH, height: POCKET_PHONE_HEIGHT, overflow: 'hidden' }");
});

test("it never takes a touch", () => {
  expect(glare).toMatch(/<View[^>]*pointerEvents="none"/);
  expect(glare).toMatch(/<Svg[^>]*pointerEvents="none"/);
  expect(glare).not.toMatch(/\bon(Press|Responder|StartShouldSet|MoveShouldSet)\w*/);
  expect(glare).not.toContain("PanResponder");
});

test("screen readers never see it", () => {
  expect(glare).toContain("aria-hidden");
  expect(glare).toContain("accessibilityElementsHidden");
  expect(glare).toContain('importantForAccessibility="no-hide-descendants"');
  expect(glare).toContain("accessible={false}");
});

test("reduced motion paints nothing, even if it turns on mid-glare", () => {
  expect(glare).toMatch(/if \(reducedMotion \|\| level === 0\) return null;/);
});

test("PIXEL-CLAY: dither density and discrete steps, no alpha, no easing, no curves, no hex", () => {
  expect(glare).not.toMatch(/\bopacity\b/i);
  expect(glare).not.toContain("Animated");
  expect(glare).not.toContain("Easing");
  expect(glare).not.toMatch(/<(Path|Circle|Ellipse|Polyline|Polygon)\b/);
  expect(glare).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(glare).not.toMatch(/rgba?\(/);
  expect(glare).toContain("ditherCells(layer.level)");
  expect(glare).toContain('patternUnits="userSpaceOnUse"');
  expect(glare).toContain("setTimeout(tick, step.atMs)");
  expect(glare).toContain("timers.forEach(clearTimeout)");
});
