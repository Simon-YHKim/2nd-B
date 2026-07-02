// Source-discipline guard for the M3 primitive kit (rev2 migration, P1b).
// There is no RN renderer in this jest setup (testEnvironment: node), so — like
// the deep-space source guards — these tests read each primitive's source and
// assert token discipline + a11y wiring rather than rendering.
import { readFileSync } from "node:fs";
import path from "node:path";

const M3_DIR = path.resolve(__dirname, "..");

function read(file: string): string {
  return readFileSync(path.join(M3_DIR, file), "utf8");
}

const HYGIENE_FILES = [
  "MdButton.tsx",
  "SegBtn.tsx",
  "MdCard.tsx",
  "MdChip.tsx",
  "Field.tsx",
  "MdNavBar.tsx",
  "ProgressLinear.tsx",
  "typeface.ts",
];

const INTERACTIVE = ["MdButton.tsx", "SegBtn.tsx", "MdChip.tsx", "MdNavBar.tsx"];
const TOUCH_TARGET = ["MdButton.tsx", "SegBtn.tsx", "MdChip.tsx", "Field.tsx", "MdNavBar.tsx"];

describe("M3 primitive kit — token discipline", () => {
  test.each(HYGIENE_FILES)("%s consumes m3.* tokens and holds no raw color literals", (file) => {
    const src = read(file);
    expect(src).toMatch(/from ["']@\/lib\/theme\/m3["']/);
    expect(src).toContain("m3.");
    // no hex color literals — everything routes through m3.* (DESIGN.md rule)
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    // no inline rgba — translucency comes from token colors + m3.state opacities
    expect(src).not.toMatch(/rgba\(/);
    // no legacy cosmic-pixel skin imports (m3 track is the point of P1b)
    expect(src).not.toMatch(/theme\/tokens|theme\/gameboy/);
    // no em dashes anywhere (DESIGN.md)
    expect(src).not.toContain("—");
  });
});

describe("M3 primitive kit — accessibility", () => {
  test.each(INTERACTIVE)("%s wires accessibilityRole + accessibilityState", (file) => {
    const src = read(file);
    expect(src).toContain("accessibilityRole");
    expect(src).toContain("accessibilityState");
  });

  test.each(TOUCH_TARGET)("%s declares a >=44dp touch target", (file) => {
    const src = read(file);
    expect(src).toMatch(/minHeight:\s*(4[4-9]|[5-9]\d|\d{3})/);
  });
});

describe("MdNavBar — active state is not color alone", () => {
  const src = read("MdNavBar.tsx");
  test("active tab shows a pill indicator + selected a11y state", () => {
    expect(src).toContain("accessibilityState={{ selected: on }}");
    expect(src).toMatch(/on && \{ backgroundColor/);
  });
});

describe("MdButton / MdChip — approved shapes", () => {
  test("MdButton uses the stadium (full) corner", () => {
    expect(read("MdButton.tsx")).toContain("m3.shape.full");
  });
  test("MdChip uses the 8dp (small) corner, not a pill", () => {
    const src = read("MdChip.tsx");
    expect(src).toContain("m3.shape.small");
    expect(src).not.toContain("m3.shape.full");
  });
});
