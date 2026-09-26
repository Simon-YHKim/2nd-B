import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const controls = readFileSync(join(__dirname, '..', 'TelescopeControls.tsx'), 'utf8');
const home = readFileSync(join(__dirname, '..', 'ConstellationHome.tsx'), 'utf8');
const style = (name: string) => controls.match(new RegExp(`\\b${name}:\\s*\\{([^}]+)\\}`))?.[1] ?? '';

test('direction and absolute zoom occupy one compact row, not stacked panels', () => {
  expect(style('root')).toContain("flexDirection: 'row'");
  expect(style('root')).toContain("alignItems: 'center'");
  expect(controls).toContain('const STICK_SIZE = 64');
  expect(controls).toContain('const TRAVEL = (STICK_SIZE - THUMB_SIZE) / 2');
  expect(style('zoomGroup')).toContain('flex: 1');
  expect(style('slider')).toContain('height: 44');
});

test('reset shares the zoom readout and buttons preserve 44px touch targets', () => {
  expect(controls).toMatch(/accessibilityLabel=\{t\('telescope.reset'\)\}[\s\S]+?telescope-zoom-readout[\s\S]+?<\/PixelPressable>/);
  expect(style('zoomKey')).toContain('width: 40'); // PixelSurface adds a 2px bevel on each side.
  expect(style('zoomKey')).toContain('minHeight: 40');
  expect(home).not.toMatch(/instrumentRow:.*minHeight: 140/);
  expect(home).toContain('useState(110)');
});
