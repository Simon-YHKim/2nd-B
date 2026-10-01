// The glare's promises. Render tests are blocked in this repo (RN 0.85), so
// these read the source; the schedule and geometry are value-tested in
// src/lib/motion/__tests__/phone-glare.test.ts.
//
// Simon 2026-09-30, twice: the glare is for the SWIPE that raises the home
// pocket phone ("핸드폰을 위로 올리는 동작(스와이프) 에만"), never for the
// bell/dashboard, and it must spread around the phone ("스마트폰 주변으로
// 눈부심이 펴져야해").
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const glare = strip(read("src/components/deep-space/PhoneGlare.tsx"));
const pocket = strip(read("src/components/deep-space/PocketPhone.tsx"));
const home = strip(read("src/components/deep-space/ConstellationHome.tsx"));
const shell = strip(read("src/components/deep-space/DeepSpaceShell.tsx"));
const dashboard = read("src/components/dashboard/DashboardPhone.tsx");

test("the bell and the dashboard never glare", () => {
  expect(dashboard).not.toMatch(/PhoneGlare|phone-glare|glare/i);
  const bell = shell.slice(shell.indexOf("onBellPress={"), shell.indexOf("onBellPress={") + 400);
  expect(bell).toContain('pathname: "/dashboard"');
  expect(bell).not.toMatch(/glare/i);
  expect(shell).not.toMatch(/glare/i);
  // The raised phone's tap opens the dashboard after stowing (which ends any glare).
  expect(home).toContain('onOpen={() => router.push({ pathname: "/dashboard", params: { overlay: "home" } })}');
});

test("only the swipe-up asks for the glare; tap, ArrowUp and a11y expand raise without it", () => {
  expect(pocket.match(/\{ glare: true \}/g)).toHaveLength(1);
  expect(pocket).toContain("if (gesture.dy < -SWIPE_THRESHOLD || gesture.vy < -0.4) settle(true, { glare: true });");
  expect(pocket).toContain("if (!expanded.current) { settle(true); return; }");
  expect(pocket).toContain("if (event.key === 'ArrowUp' && !expanded.current) { event.preventDefault(); settle(true); }");
  expect(pocket).toContain("if (actionName === 'expand') settle(true);");
  expect(pocket).toContain("const settle = useCallback((next: boolean, { glare = false }: { glare?: boolean } = {}) => {");
});

test("the glare needs a swipe that raised a collapsed phone all the way", () => {
  expect(pocket).toContain("const raising = next && !expanded.current;");
  expect(pocket).toMatch(/\.start\(\(\{ finished \}\) => \{\s*if \(!finished \|\| !raising \|\| !glare \|\| !expanded\.current\) return;/);
  expect(pocket).toContain("shouldPlayPhoneGlare({ reducedMotion, nowMs: Date.now(), lastStowedAtMs: phoneLastStowedAt() })");
});

test("every way the raised phone goes back down stows it and ends the glare", () => {
  expect(pocket).toMatch(/const stow = useCallback\(\(\) => \{\s*markPhoneStowed\(Date\.now\(\)\);\s*onGlareRef\.current\?\.\(null\);/);
  expect(pocket).toContain("if (!next && expanded.current) stow();");
  expect(pocket).toMatch(/stow\(\);\s*expanded\.current = false;\s*setIsExpanded\(false\);\s*onExpandedChangeRef\.current\(false\);\s*openRef\.current\(\);/);
  expect(pocket).toMatch(/if \(expanded\.current\) \{\s*onExpandedChangeRef\.current\(false\);\s*stow\(\);/);
  expect(home).toContain("if (!glare) { setPhoneGlare(null); return; }");
});

test("the halo is drawn over the whole home, outside every clip, measured once", () => {
  // The phone and the sky block both clip; the glare is a root-level layer.
  expect(pocket).not.toContain("<PhoneGlare");
  expect(pocket).toContain("phone: { width: POCKET_PHONE_WIDTH, height: POCKET_PHONE_HEIGHT, overflow: 'hidden' }");
  expect(home).toContain('overflow: "hidden"');
  const backdrop = home.indexOf("styles.phoneBackdrop}><PixelScrim");
  const mount = home.indexOf("<PhoneGlare ");
  expect(backdrop).toBeGreaterThan(-1);
  expect(mount).toBeGreaterThan(backdrop);
  expect(home).toMatch(/<View pointerEvents="none" style=\{styles\.phoneGlare\}>\s*<PhoneGlare key=\{phoneGlare\.run\} reducedMotion=\{reducedMotion\} frame=\{phoneGlare\.frame\} width=\{stage\.w\} height=\{stage\.h\}/);
  expect(home).toContain("phoneGlare: { ...StyleSheet.absoluteFill, zIndex: 11 }");
  expect(home).toContain("constellationRaised: { zIndex: 10 }");
  expect(home).toContain("onGlare={onPhoneGlare}");
  // One measurement per glare, never per frame (ANDROID_QA_GUIDELINES).
  expect(pocket.match(/measureInWindow/g)).toHaveLength(1);
  expect(home.match(/measureInWindow/g)).toHaveLength(1);
  expect(glare).not.toMatch(/onLayout|measure/);
});

test("a desktop mouse can swipe the phone: its artwork never starts the browser's native image drag", () => {
  // Without this a mouse drag on the <img> fires `dragstart` and the moves never
  // reach the PanResponder, so on web the phone did not rise (measured 2026-09-30:
  // dragstart 1, lift 0 without it; dragstart 0, lift -148 with it). expo-image
  // applies `draggable` to the <img> on web only, so native is unchanged; the
  // prop's existence is held by type-check.
  const artwork = pocket.slice(pocket.indexOf("function PhoneArtwork()"), pocket.indexOf("export function PocketPhone("));
  expect(artwork).toContain("require('../../../assets/images/secondb-cellphone-night.png')");
  expect(artwork).toMatch(/<Image[^>]*draggable=\{false\}/);
  expect(pocket).toContain("import { Image } from 'expo-image'");
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
