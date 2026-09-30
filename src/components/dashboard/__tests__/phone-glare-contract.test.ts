// The glare layer's promises to the phone. Render tests are blocked in this
// repo (RN 0.85), so these read the source; the schedule itself is value-tested
// in src/lib/dashboard/__tests__/phone-glare.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const glare = read("src/components/dashboard/PhoneGlare.tsx");
const phone = read("src/components/dashboard/DashboardPhone.tsx");
const code = glare.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the dashboard mounts the glare on top of the phone, decided by the home-sky entry and reduced motion", () => {
  const home = phone.indexOf("style={[styles.homeButton, frame.homeButton]}");
  const mount = phone.indexOf("<PhoneGlare ");
  expect(home).toBeGreaterThan(-1);
  // Last child inside the framed fragment: it paints over the display and the bezel.
  expect(mount).toBeGreaterThan(home);
  expect(phone.indexOf("</> : null}", mount)).toBeGreaterThan(mount);
  expect(phone).toContain('fromHomeSky={overlay === "home"}');
  expect(phone).toContain("reducedMotion={reducedMotion}");
  expect(phone).toContain("const reducedMotion = useReducedMotionPref();");
});

test("it never takes a touch, so taps, the dismiss pull and the page swipe pass through", () => {
  expect(code).toMatch(/<View[^>]*pointerEvents="none"/);
  expect(code).toMatch(/<Svg[^>]*pointerEvents="none"/);
  expect(code).not.toMatch(/\bon(Press|Responder|StartShouldSet|MoveShouldSet)\w*/);
  expect(code).not.toContain("PanResponder");
});

test("screen readers never see it", () => {
  expect(code).toContain("aria-hidden");
  expect(code).toContain("accessibilityElementsHidden");
  expect(code).toContain('importantForAccessibility="no-hide-descendants"');
  expect(code).toContain("accessible={false}");
});

test("reduced motion paints nothing, even if it turns on mid-glare", () => {
  expect(code).toContain("shouldPlayPhoneGlare({");
  expect(code).toMatch(/if \(!play \|\| reducedMotion \|\| level === 0\) return null;/);
});

test("PIXEL-CLAY: dither density and discrete steps, no alpha, no easing, no curves, no hex", () => {
  expect(code).not.toMatch(/\bopacity\b/i);
  expect(code).not.toContain("Animated");
  expect(code).not.toContain("Easing");
  expect(code).not.toMatch(/<(Path|Circle|Ellipse|Polyline|Polygon)\b/);
  expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(code).not.toMatch(/rgba?\(/);
  expect(code).toContain("ditherCells(layer.level)");
  expect(code).toContain('patternUnits="userSpaceOnUse"');
});

test("it does not hold up the dashboard read", () => {
  // The glare owns its clock; the dashboard's focus read never waits on it.
  const load = phone.slice(phone.indexOf("void loadDashboard("), phone.indexOf("void loadDashboard(") + 400);
  expect(load).not.toMatch(/glare/i);
  expect(code).not.toContain("loadDashboard");
  expect(code).toContain("setTimeout(tick, atMs)");
  expect(code).toContain("timers.forEach(clearTimeout)");
});
