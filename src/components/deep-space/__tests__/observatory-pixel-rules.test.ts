import { readFileSync } from "node:fs";
import { join } from "node:path";

const destination = readFileSync(join(__dirname, "..", "StarDestination.tsx"), "utf8");
const controls = readFileSync(join(__dirname, "..", "TelescopeControls.tsx"), "utf8");

describe("observatory PIXEL-CLAY regression", () => {
  test("the destination uses duration-scaled steps while retaining reduced motion", () => {
    expect(destination).toContain("pixelStepsFor(duration)");
    expect(destination).not.toMatch(/\bEasing\./);
    expect(destination).toMatch(/duration\s*=\s*reducedMotion\s*\?\s*0\s*:\s*active\s*\?\s*960\s*:\s*640/);
  });

  test('camera reversal releases its audio and cancels stale focus locks', () => {
    expect(destination).toContain('<CameraTransition key={`${active}:${reducedMotion}`}');
    expect(destination).toContain('if (!live || !finished) return');
    expect(destination).toContain('live = false; animation.stop()');
    expect(destination).toContain('else if (!reducedMotion) callbacks.current.lock()');
    expect(destination).not.toContain('setTimeout');
  });

  test.each([
    ["destination name", destination, "name"],
    ["telescope arrows", controls, "arrow"],
  ])("%s uses a native Galmuri multiple", (_label, source, style) => {
    const block = source.match(new RegExp(`\\b${style}:\\s*\\{([^}]+)\\}`))?.[1];
    expect(block).toMatch(/fontFamily:\s*m3\.font\.(?:brand|mono)/);
    expect(block).toMatch(/fontSize:\s*24\b/);
  });
});
