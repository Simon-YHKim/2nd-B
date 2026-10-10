import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const home = readFileSync(join(__dirname, '..', 'ConstellationHome.tsx'), 'utf8');
const phone = readFileSync(join(__dirname, '..', 'PocketPhone.tsx'), 'utf8');
const controls = readFileSync(join(__dirname, '..', 'TelescopeControls.tsx'), 'utf8');

test('the resting instruments clear the top of the full phone touch frame', () => {
  // Keep the whole ruler: reserving 104px horizontally would squeeze the 360px
  // screen's ruler from 170px to 58px and crowd its numbered marks.
  expect(home).toContain('const instrumentLift = instrumentHeight + POCKET_PHONE_PEEK + m3.spacing.s4;');
  expect(home).toMatch(/styles\.instrumentRow,\s*bubble\.kind === "intro" && !visualFocusId && !phoneExpanded && \{ marginTop: -instrumentLift, marginBottom: instrumentLift \}/);
  expect(home).toMatch(/styles\.phonePocket,[\s\S]*?bottom: POCKET_PHONE_PEEK - POCKET_PHONE_HEIGHT,\s*right: Math\.max\(m3\.spacing\.s4, \(\(stage\?\.w \?\? winW\) - 440\) \/ 2\),/);
});

test('clearance does not change sky height, phone travel, or the focused camera row', () => {
  expect(home).toContain('visualFocusId && { height: instrumentHeight }');
  expect(home).toContain('paddingHorizontal: m3.spacing.s4, paddingVertical: 2');
  expect(home).toContain('enabled={!visualFocusId && !returnStart}');
  expect(home).toContain('cameraMotion={cameraMotion}');
  expect(phone).toContain('export const POCKET_PHONE_WIDTH = 104');
  expect(phone).toContain('export const POCKET_PHONE_HEIGHT = 192');
  expect(phone).toContain('export const POCKET_PHONE_PEEK = 44');
  expect(phone).toContain('const PHONE_TRAVEL = POCKET_PHONE_HEIGHT - POCKET_PHONE_PEEK');
  expect(controls).toContain('const STICK_SIZE = 64');
  expect(controls).toMatch(/zoomKey: \{ width: 44, height: 44/);
  expect(controls).toMatch(/slider: \{ flex: 1, minWidth: 48, height: 52/);
});
