import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");
const tesseractV10Dir = path.join(repoRoot, "public/assets/tesseract-v10");
const soulcoreFinalArt = path.join(repoRoot, "src/components/art/SoulcoreFinalArt.tsx");

describe("tesseract v10 pattern data asset weight", () => {
  test("does not ship duplicate color PNGs for pattern data", () => {
    const files = existsSync(tesseractV10Dir) ? readdirSync(tesseractV10Dir) : [];

    expect(files.filter((name) => /^pattern_data_.*\.png$/.test(name))).toEqual([]);
  });

  test("renders v10 pattern data without static PNG requires", () => {
    const source = readFileSync(soulcoreFinalArt, "utf8");

    expect(source).not.toMatch(/tesseract-v10\/pattern_data_.*\.png/);
  });
});
