// What assets/legacy-art may bundle (2026-10-04, qa261004 D-14 · L4-09 · L4-10 · L2-24 · L2-25 · L3-05 · L4-11).
//
// Metro bakes every static require()/import of an image into every web/APK/IPA
// bundle, whichever branch a screen renders. Before this guard, 48 of the 69
// legacy-art PNGs in the release APK were never drawn by the shipped deep-space
// build (about 12 MB), and 106 more images sat in the repo with no consumer at all.
// The dead requires were cut and 146 images (plus 6 pack docs) moved to
// E:/Legacy/2ndB (MANIFEST.jsonl, batch qa261004-art).
//
// Nothing else would notice a regression here: jest maps image requires to a
// file mock and tsc does not resolve them, so a require left pointing at a moved
// file only fails at bundle time, and a dead require or an orphan file fails
// nowhere. These three checks close that.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");
const legacyArtRoot = path.join(repoRoot, "assets/legacy-art");
const srcRoot = path.join(repoRoot, "src");

function walk(dir: string, keep: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

const toPosix = (p: string) => p.split(path.sep).join("/");
// Product code only: tests (this file included) quote require strings as data.
const sourceFiles = walk(srcRoot, (f) => /\.(ts|tsx)$/.test(f) && !toPosix(f).includes("/__tests__/"));

// `require("../../../assets/legacy-art/x.png")` and `import X from ".../legacy-art/x.svg"`.
const LEGACY_ART_SPEC = /(?:require\(\s*|from\s+)["']([^"']*assets\/legacy-art\/[^"']+)["']/g;

function legacyArtRefs(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(LEGACY_ART_SPEC)].map((m) =>
    toPosix(path.relative(legacyArtRoot, path.resolve(path.dirname(file), m[1]))),
  );
}

describe("legacy-art bundle", () => {
  test("every legacy-art require/import in src resolves to a file in the repo", () => {
    const missing: string[] = [];
    for (const file of sourceFiles) {
      for (const rel of legacyArtRefs(file)) {
        if (!existsSync(path.join(legacyArtRoot, rel))) missing.push(`${toPosix(path.relative(repoRoot, file))} -> ${rel}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("no legacy-art image is left without a consumer in src", () => {
    const used = new Set(sourceFiles.flatMap(legacyArtRefs));
    const orphans = walk(legacyArtRoot, (f) => /\.(png|svg)$/i.test(f))
      .map((f) => toPosix(path.relative(legacyArtRoot, f)))
      .filter((rel) => !used.has(rel));
    // An image nothing requires is not bundled and not drawn: move it to
    // E:/Legacy/2ndB with tools/legacy_move.py instead of leaving it here.
    expect(orphans).toEqual([]);
  });

  // Upper bounds, not exact lists: dropping a require further is fine, adding a
  // dead one back is not. Each entry names the renderer that reaches it.
  const ALLOWED: Record<string, RegExp[]> = {
    "src/components/art/SoulcoreFinalArt.tsx": [
      // /core-brain empty + load-error state (core-brain.tsx -> IslandArt id="core").
      /^tesseract-v10\/soul_core\.png$/,
      // EXPO_PUBLIC_UI=legacy SceneHero + orphan NavGraph non-core ids.
      /^cosmic-pixel-v3-soulcore\/final-candidate-v45\/tier2_pattern_cores\/(growth|bond|wisdom|narrative|muse|rhythm)_core_256\.png$/,
    ],
    "src/lib/assets/soulcore-v3.ts": [
      // V3_WORKER_ART (옛 캐릭터 다섯의 정지 자세) · V3_CREW_ART (모모 크루) 두 줄은
      // 2026-10-05 에 뺐다(Simon 결정 Q-261004-15 A, batch qa261004-chars). 다시
      // 들어오면 이 상한이 잡는다.
      // V3_DATA_ART / V3_LOG_ART (premium feedback empty/error glyph).
      /^cosmic-pixel-v3-soulcore\/mobile-graph\/graph\/(pattern_data_node|log_chip)\.svg$/,
    ],
    "src/components/art/IslandArt.tsx": [
      // ShardArt (CaptureLegacySession, CompanionMoment).
      /^2ndb-production-premium-v1\/shards\/shard_[a-z_]+\.png$/,
    ],
  };

  test.each(Object.keys(ALLOWED))("%s bundles only art a renderer reaches", (rel) => {
    const refs = legacyArtRefs(path.join(repoRoot, rel));
    const unexpected = refs.filter((r) => !ALLOWED[rel].some((re) => re.test(r)));
    expect(unexpected).toEqual([]);
    // The module still exists and still requires something; an empty scan would
    // pass the line above for the wrong reason.
    expect(refs.length).toBeGreaterThan(0);
  });

  test("the live /core-brain soul core and its tesseract file are still wired", () => {
    const source = readFileSync(path.join(repoRoot, "src/components/art/SoulcoreFinalArt.tsx"), "utf8");
    expect(source).toContain('require("../../../assets/legacy-art/tesseract-v10/soul_core.png")');
    expect(existsSync(path.join(legacyArtRoot, "tesseract-v10/soul_core.png"))).toBe(true);
  });
});
