import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PILOT_DIR = path.join(process.cwd(), "public", "assets", "multimodal-pilots", "soul-core-symbol-pilot");

function pngSize(filePath: string) {
  const data = readFileSync(filePath);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

describe("Soul Core symbol pilot asset pack", () => {
  test("keeps the pilot review-only and semantically centered on the internal symbol", () => {
    const manifest = JSON.parse(readFileSync(path.join(PILOT_DIR, "manifest.json"), "utf8"));
    const direction = JSON.parse(readFileSync(path.join(PILOT_DIR, "style_direction.pilot.json"), "utf8"));
    const spec = JSON.parse(readFileSync(path.join(PILOT_DIR, "pixy.spec.json"), "utf8"));

    expect(manifest.status).toBe("pilot_for_simon_review");
    expect(manifest.replaces).toContain("does not replace production assets yet");
    expect(manifest.semantic_read_order.slice(0, 2)).toEqual(["living soul flame", "heart core"]);

    expect(direction.status).toBe("pilot_for_simon_review");
    expect(direction.composition_ratio.living_soul_heart).toBe("70%+");
    expect(direction.composition_ratio.tesseract_halo).toBe("30%-");
    expect(direction.batch_rule).toContain("until this pilot is approved");

    expect(spec.canvas).toEqual({ width: 128, height: 128 });
    expect(spec.scale).toBe(4);
    expect(spec.interpretation_ratio.internal_symbol).toBeGreaterThan(spec.interpretation_ratio.tesseract_support);
  });

  test("ships source, export, and mobile readability previews at the expected dimensions", () => {
    const requiredFiles = [
      "README.md",
      "pixy.spec.json",
      "soul_core_symbol_pilot.pix",
      "soul_core_symbol_pilot.png",
      "soul_core_symbol_pilot_preview_black.png",
      "soul_core_symbol_pilot_readability_strip.png",
    ];

    for (const fileName of requiredFiles) {
      expect(existsSync(path.join(PILOT_DIR, fileName))).toBe(true);
    }

    expect(pngSize(path.join(PILOT_DIR, "soul_core_symbol_pilot.png"))).toEqual({ width: 512, height: 512 });
    expect(pngSize(path.join(PILOT_DIR, "soul_core_symbol_pilot_preview_black.png"))).toEqual({ width: 512, height: 512 });

    const strip = pngSize(path.join(PILOT_DIR, "soul_core_symbol_pilot_readability_strip.png"));
    expect(strip.width).toBeGreaterThan(512);
    expect(strip.height).toBeGreaterThan(512);
  });
});
