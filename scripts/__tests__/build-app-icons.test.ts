// The launcher / web icons are generated from the Polaris star (scripts/build-app-icons.ts).
// These checks keep the committed PNGs a faithful derived copy: if the star, its
// colours or the icon background change, the PNGs must be regenerated, not edited.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADAPTIVE_SAFE_RADIUS_FRACTION,
  POLARIS_LAYERS,
  decodePng,
  iconSpecs,
  renderIcon,
} from "../build-app-icons";

const ROOT = join(__dirname, "..", "..");
const REGENERATE = "run `npx tsx scripts/build-app-icons.ts` and commit the PNGs";

describe("app icons are the Polaris star", () => {
  it("the sign-in Polaris still stacks the layers the icons are drawn from", () => {
    const screen = readFileSync(join(ROOT, "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8");
    const layers = [...screen.matchAll(/<PolarisLayer radius=\{(\d+)\} fill=\{m3\.accent\.(\w+)\} \/>/g)].map(
      (m) => ({ radius: Number(m[1]), token: m[2] }),
    );
    // If this fails the star changed: update POLARIS_LAYERS, then regenerate.
    expect(layers).toEqual(POLARIS_LAYERS.map(({ radius, token }) => ({ radius, token })));
  });

  it.each(iconSpecs().map((spec) => [spec.path, spec] as const))(
    "%s matches what the generator renders",
    (_path, spec) => {
      const file = decodePng(readFileSync(join(ROOT, spec.path)));
      expect({ width: file.width, height: file.height }).toEqual({ width: spec.size, height: spec.size });
      // Opaque icons carry no alpha channel (the App Store rejects an alpha 1024 icon).
      expect(file.hasAlpha).toBe(spec.fill.kind !== "opaque");
      if (!file.rgba.equals(renderIcon(spec).rgba)) {
        throw new Error(`${spec.path} drifted from the Polaris source: ${REGENERATE}`);
      }
    },
  );

  it("the adaptive foreground stays inside the launcher safe circle", () => {
    for (const spec of iconSpecs().filter((s) => s.adaptiveSafeZone)) {
      const { width, rgba } = decodePng(readFileSync(join(ROOT, spec.path)));
      const centre = width / 2;
      let farthest = 0;
      for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
          if (rgba[(y * width + x) * 4 + 3] === 0) continue;
          // Farthest corner of this pixel from the centre.
          const dx = Math.max(Math.abs(x - centre), Math.abs(x + 1 - centre));
          const dy = Math.max(Math.abs(y - centre), Math.abs(y + 1 - centre));
          farthest = Math.max(farthest, Math.hypot(dx, dy));
        }
      }
      expect(farthest).toBeGreaterThan(0);
      expect(farthest).toBeLessThanOrEqual(width * ADAPTIVE_SAFE_RADIUS_FRACTION);
    }
  });
});
