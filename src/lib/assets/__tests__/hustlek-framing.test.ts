import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HUSTLEK_EXPRESSIONS, type HustleKExpressionId } from "../hustlek";
import { HUSTLEK_HEAD_ANCHORS, HUSTLEK_PORTRAIT_FRAME, hustlekPortraitLayout } from "../hustlek-framing";

const { PNG } = require("pngjs") as { PNG: { sync: { read: (bytes: Buffer) => { width: number; height: number; data: Buffer } } } };
const root = resolve(__dirname, "../../../..");
const expressions = Object.keys(HUSTLEK_EXPRESSIONS) as HustleKExpressionId[];

test("all 48 measured anchors match the approved artwork, ignoring transparent export dust", () => {
  for (const id of expressions) {
    const png = PNG.sync.read(readFileSync(resolve(root, `assets/hustlek/png/${id}-${HUSTLEK_EXPRESSIONS[id].key}.png`)));
    let left = png.width; let right = 0; let top = png.height;
    for (let y = 0; y < 275; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        if (png.data[(y * png.width + x) * 4 + 3] < 128) continue;
        left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y);
      }
    }
    expect({ id, anchor: HUSTLEK_HEAD_ANCHORS[id] }).toEqual({ id, anchor: [(left + right) / 2, top] });
    const layout = hustlekPortraitLayout(280, id);
    // Every opaque head pixel (hair/ears/face through y=274) remains in frame.
    expect(left + layout.image.left).toBeGreaterThanOrEqual(0);
    expect(right + layout.image.left).toBeLessThanOrEqual(280);
    expect(top + layout.image.top).toBeGreaterThanOrEqual(0);
    expect(275 + layout.image.top).toBeLessThanOrEqual(280);
    // The actual head, not its padded PNG box, fills most of the avatar width.
    expect((right - left) / layout.frame.width).toBeGreaterThan(0.86);
  }
});

test.each([22, 32, 40, 48, 80, 152, 280])("%ipx expressions keep one viewport, uniform scale and stable anchors", size => {
  const original = hustlekPortraitLayout(size);
  for (const id of expressions) {
    const layout = hustlekPortraitLayout(size, id);
    expect(layout.frame).toEqual(original.frame);
    expect(layout.image.width).toBe(original.image.width);
    expect(layout.image.height).toBe(layout.image.width);
    const [centerX, top] = HUSTLEK_HEAD_ANCHORS[id];
    const scale = layout.image.width / HUSTLEK_PORTRAIT_FRAME.sourceSize;
    expect(Math.abs(centerX * scale + layout.image.left - size / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(top * scale + layout.image.top - HUSTLEK_PORTRAIT_FRAME.topInset * scale)).toBeLessThanOrEqual(0.5);
    for (const value of [layout.image.width, layout.image.height, layout.image.top, layout.image.left]) expect(Number.isInteger(value)).toBe(true);
  }
});

test("exported share cards retain the native view-shot host and the same face framing", () => {
  const source = readFileSync(resolve(root, "src/components/deepspace/ShareCard.tsx"), "utf8");
  expect(source).toContain('import { Image, StyleSheet } from "react-native"');
  expect(source).toContain('hustlekPortraitLayout(34 * k, "A02")');
  expect(source).toContain("<View style={portrait.frame}>");
  expect(source).toContain('style={portrait.image} resizeMode="contain"');
});
