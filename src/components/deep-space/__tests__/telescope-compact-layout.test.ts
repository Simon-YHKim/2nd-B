import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stepPolyline } from '@/components/pixel/pixel-line';

const controls = readFileSync(join(__dirname, '..', 'TelescopeControls.tsx'), 'utf8');
const home = readFileSync(join(__dirname, '..', 'ConstellationHome.tsx'), 'utf8');
const phone = readFileSync(join(__dirname, '..', 'PocketPhone.tsx'), 'utf8');
const dialSource = readFileSync(join(__dirname, '..', '..', '..', 'lib', 'motion', 'telescope-dial.ts'), 'utf8');
const style = (name: string) => controls.match(new RegExp(`\\b${name}:\\s*\\{([^}]+)\\}`))?.[1] ?? '';
const homeStyle = (name: string) => home.match(new RegExp(`\\b${name}:\\s*\\{([^}]+)\\}`))?.[1] ?? '';

test('direction and absolute zoom occupy one compact row, not stacked panels', () => {
  expect(style('root')).toContain("flexDirection: 'row'");
  expect(style('root')).toContain("alignItems: 'center'");
  expect(controls).toContain('const STICK_SIZE = 64');
  expect(controls).toContain('const THUMB_SIZE = 16');
  expect(controls).toContain('const TRAVEL = 22');
  expect(style('zoomGroup')).toContain("flexDirection: 'row'");
  expect(style('slider')).toContain('height: 52');
  expect(style('zoomReadout')).toContain("position: 'absolute'");
  expect(style('zoomThumb')).toContain('width: 2');
  expect(style('thumb')).toContain('borderWidth: 1');
  expect(controls).not.toContain('<Circle');
  expect(controls).not.toContain('<Path');
});

test('an unmoved joystick tap returns to origin without a separate reset button', () => {
  expect(controls).toContain('stickDragged.current = false');
  expect(controls).toContain('if (stickCanceled.current || stickDragged.current) stopStick();');
  expect(controls).toContain('else resetView();');
  expect(controls).toContain('actions.current.onReset();');
  expect(controls).toContain("{ name: 'activate', label: t('telescope.reset') }");
  expect(controls).not.toContain('telescope.resetShort');
  expect(controls).toMatch(/testID="telescope-zoom-indicator"[\s\S]+?styles.zoomReadout[\s\S]+?telescope-zoom-readout/);
  expect(style('zoomKey')).toContain('width: 44');
  expect(style('zoomKey')).toContain('height: 44');
  expect(home).not.toMatch(/instrumentRow:.*minHeight: 140/);
  expect(home).toContain('useState(74)');
});

test('W and T have separate tap and continuous hold paths with fail-safe cleanup', () => {
  expect(controls).toContain('delayLongPress={350}');
  expect(controls).toContain('onLongPress={() => holdZoom(-1)}');
  expect(controls).toContain('onLongPress={() => holdZoom(1)}');
  expect(controls).toContain('onPressOut={() => { stopQuickZoom(); setHudMotion(false); }}');
  expect(controls).toContain('quickZoomTimer.current = setInterval(advance, 50)');
  expect(controls).toContain('if (quickZoomTimer.current !== null) clearInterval(quickZoomTimer.current)');
  expect(controls).toContain('stopQuickZoom(); remote.stop();');
});

test('jog ring is mirrored on both axes and stays square', () => {
  const path = controls.match(/const quadrant = stepPolyline\(\[([\s\S]*?)\], 2\)/)?.[1] ?? '';
  const points = [...path.matchAll(/\[(\d+),\s*(\d+)\]/g)].map(([, x, y]) => [Number(x), Number(y)] as const);
  expect(points.length).toBeGreaterThan(8);
  expect(points.every(([x, y], index) => index === 0 || x === points[index - 1][0] || y === points[index - 1][1])).toBe(true);
  const ring = new Set<string>();
  for (const { x, y } of stepPolyline(points, 2)) {
    for (const mirrorX of [x, 62 - x]) for (const mirrorY of [y, 62 - y]) ring.add(`${mirrorX},${mirrorY}`);
  }
  const [first] = ring;
  const reached = new Set([first]);
  const queue = [first];
  for (const key of queue) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const neighbor = `${x + dx},${y + dy}`;
      if (ring.has(neighbor) && !reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
    }
  }
  expect(reached.size).toBe(ring.size);
  expect(controls).toContain('x={31} y={8} width={2} height={2}');
  expect(controls).toContain('x={54} y={31} width={2} height={2}');
  expect(controls).toContain('direction.x > 0 ? m3.accent.starCore');
  expect(controls).toContain('STICK_SIZE - 2 - cell.x');
  expect(controls).toContain('STICK_SIZE - 2 - cell.y');
  expect(style('joystick')).toContain('aspectRatio: 1');
  expect(controls).not.toContain('Math.cos(');
});

test('zoom index is fixed while the extended tick and landmark band translates beneath it', () => {
  // 2026-09-30: the band geometry moved to the pure `telescopeDial` (src/lib/motion/telescope-dial.ts)
  // so its values can be tested; the band width and offset formulas are unchanged and are pinned there.
  // What changed is the range: it no longer stretches to a star flight's peak (see telescope-dial.test.ts).
  expect(dialSource).toContain('const bandWidth = railWidth * 3');
  expect(dialSource).toContain('const offset = Math.round(railWidth / 2 - origin - position * rangeWidth)');
  expect(controls).toContain('const dial = telescopeDial({ railWidth, zoom: displayZoom, minZoom, maxZoom,');
  expect(controls).toContain('testID="telescope-dial-band"');
  expect(controls).toContain('transform: [{ translateX: dial.offset }]');
  expect(controls).toContain('left: Math.round(railWidth / 2) - 1');
  expect(controls).toContain('dragZoomPosition.current - gesture.dx / Math.max(1, rail.current.width * DIAL_RANGE_RATIO)');
  expect(controls).not.toContain('event.nativeEvent.locationX / rail.current.width');
  expect(controls).toContain('fill={dialColor(screenFraction, hudActive)}');
  expect(controls).toContain('const edge = Math.min(fraction, 1 - fraction)');
  expect(controls).toContain('if (edge < 0.12)');
  expect(style('slider')).toContain("overflow: 'hidden'");
  expect(style('root')).not.toContain('backgroundColor');
  expect(style('root')).not.toContain('borderWidth');
  expect(style('zoomKeyFace')).toContain('width: 20');
  expect(style('zoomKeyFace')).not.toContain('borderWidth');
  expect(style('zoomKeyFaceStart')).toContain('borderRightWidth: 1');
  expect(style('zoomKeyFaceEnd')).toContain('borderLeftWidth: 1');
  expect(style('zoomThumb')).toContain('top: 18');
  expect(style('zoomThumb')).toContain('width: 2');
  // 2026-09-30: was `zoomToPosition(value, minZoom, displayMaxZoom)`. The display max was
  // `Math.max(maxZoom, ...cameraMotion.track.zoom)`, which re-scaled the ruler during a star tap.
  expect(dialSource).toContain('zoomToPosition(value, minZoom, maxZoom)');
  expect(controls).not.toContain('displayMaxZoom');
  expect(controls).not.toMatch(/Math\.max\(maxZoom,/);
});

test('the home dial and the star tap share one 1x..10x scale (Simon 2026-09-30)', () => {
  expect(home).toContain('minZoom={SKY_ZOOM_MIN}');
  expect(home).toContain('maxZoom={SKY_ZOOM_MAX}');
  expect(home).toContain('zoomStops={SKY_ZOOM_STOPS}');
  expect(home).not.toMatch(/maxZoom=\{\d/);
  // The reticle follows the flight's landing frame, which is smaller than the viewport frame
  // only when the 10x ceiling holds a tap back on a wide window.
  expect(home).toContain('frame={flight}');
  expect(controls).toContain('max: maxZoom * 100');
});

test('backdrop has stepped rounded corners and fades in opaque pixel bands', () => {
  expect(controls).toContain('const BACKDROP_EDGE = flattenAlpha');
  expect(controls).toContain('const BACKDROP_SOFT = flattenAlpha');
  expect(controls).toContain('const BACKDROP_MID = flattenAlpha');
  expect(controls).toContain('const BACKDROP_CORE = flattenAlpha');
  expect(controls).toContain('function backdropRects(width: number, height: number)');
  expect(controls).toContain('inset + 12');
  expect(controls).toContain('inset + 6');
  expect(controls).toContain('inset + 10');
  expect(controls).toContain('<Svg pointerEvents="none"');
  expect(style('backdrop')).toContain("position: 'absolute'");
  expect(style('backdrop')).not.toContain('borderRadius');
  expect(style('root')).not.toContain('backgroundColor');
});

test('origin and star flights keep the controls visible and follow the camera track', () => {
  expect(home).toContain('duration: CAMERA_RETURN[0].duration');
  expect(home).toContain('easing: pixelStepsFor(CAMERA_RETURN[0].duration)');
  expect(home).toContain('enabled={!visualFocusId && !returnStart}');
  expect(home).toContain('cameraMotion={cameraMotion}');
  expect(home).toContain('setReturnStart(camera)');
  expect(home).toContain('returnProgress.stopAnimation();');
  expect(controls).toContain('sampleTelescopeMotion(cameraMotion.track, value, previous)');
  expect(controls).toContain('const displayZoom = previewZoom ?? zoom');
});

test('active HUD settles to token-based idle colors and clears its timer on unmount', () => {
  expect(controls).toContain('const HUD_IDLE_DELAY_MS = 1200');
  expect(controls).toContain('onMotionChange: active => { sound.current(active); setHudMotion(active); }');
  expect(controls).toContain('setTimeout(() => { setHudActive(false); hudIdleTimer.current = null; }, HUD_IDLE_DELAY_MS)');
  expect(controls).toContain('if (hudIdleTimer.current !== null) clearTimeout(hudIdleTimer.current)');
  expect(controls).toContain('hudActive && styles.readoutActive');
  expect(controls).toContain('hudActive && styles.zoomThumbActive');
  expect(controls).not.toContain('opacity:');
});

test('dialogue sits above an unclipped camera row and the supplied phone peeks above the dialogue', () => {
  expect(style('root')).toContain('maxWidth: 440');
  expect(style('root')).toContain('paddingVertical: 2');
  expect(home).toContain('paddingHorizontal: m3.spacing.s4, paddingVertical: 2');
  expect(home).toContain('bottom: POCKET_PHONE_PEEK - POCKET_PHONE_HEIGHT');
  expect(home.indexOf('<View style={[styles.instrumentRow')).toBeGreaterThan(home.indexOf('<View testID="home-dialogue-stage"'));
  expect(homeStyle('instrumentRow')).not.toContain('position: "absolute"');
  expect(home).toContain('visualFocusId && { height: instrumentHeight }');
  expect(home).toContain('skySize, 0, starRadius');
  expect(home).toContain('top: (skySize.height - boxH) / 2');
  expect(phone).toContain("require('../../../assets/images/secondb-cellphone-night.png')");
  expect(phone).toContain("import { Image } from 'expo-image'");
  expect(phone).toContain('contentFit="fill"');
  expect(phone).toContain('onMoveShouldSetPanResponder');
  // 2026-09-30: the swipe-up alone also asks for the glare (눈부심); the gesture itself is unchanged.
  expect(phone).toContain('if (gesture.dy < -SWIPE_THRESHOLD || gesture.vy < -0.4) settle(true, { glare: true })');
  expect(phone).toContain('if (!expanded.current) { settle(true); return; }');
});

test('the visible phone asset fits entirely inside its animated touch frame', () => {
  const artwork = phone.match(/artwork: \{ position: 'absolute', width: (\d+), height: (\d+), left: (-?\d+), top: (-?\d+) \}/);
  expect(artwork).not.toBeNull();
  const [, width, height, left, top] = artwork!.map(Number);
  const frameWidth = Number(phone.match(/POCKET_PHONE_WIDTH = (\d+)/)?.[1]);
  const frameHeight = Number(phone.match(/POCKET_PHONE_HEIGHT = (\d+)/)?.[1]);
  // Alpha bounds measured from the supplied 1083×1452 PNG (alpha > 64).
  const visibleLeft = left + 250 / 1083 * width;
  const visibleTop = top + 159 / 1452 * height;
  const visibleRight = left + 842 / 1083 * width;
  const visibleBottom = top + 1308 / 1452 * height;
  expect(visibleLeft).toBeGreaterThanOrEqual(0);
  expect(visibleTop).toBeGreaterThanOrEqual(0);
  expect(visibleRight).toBeLessThanOrEqual(frameWidth);
  expect(visibleBottom).toBeLessThanOrEqual(frameHeight);
});

test('SecondB launcher sits next to the bell inside the top bar', () => {
  const row = home.indexOf('<View style={styles.topBarStart}>');
  const bell = home.indexOf('<View style={styles.bell}>', row);
  const secondb = home.indexOf('testID="secondb-dialogue-launcher"', row);
  const ticker = home.indexOf('<NoticeTicker', row);
  expect(row).toBeGreaterThanOrEqual(0);
  expect(bell).toBeGreaterThan(row);
  expect(secondb).toBeGreaterThan(bell);
  expect(secondb).toBeLessThan(ticker);
  expect(homeStyle('secondbLauncher')).not.toContain('position: "absolute"');
  expect(homeStyle('secondbLauncher')).toContain('width: 40');
});
