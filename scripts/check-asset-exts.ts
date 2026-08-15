// check:asset-exts -- every asset extension a source file require()s must be in
// Metro's assetExts, or the web/native bundle cannot resolve it.
//
// Why this exists: a cycle branch made typography.ts require the Galmuri woff2
// subset on web. The file was present and tracked, but woff2 is not in Metro's
// defaults (it ships otf and ttf), so the bundle died with "Unable to resolve
// module ../../assets/fonts/Galmuri11-subset.woff2". `npm run verify` has no
// bundling step, so it stayed green and CI's web-export-smoke was the first
// thing to notice - a 3+ minute round trip to learn a one-line fact.
//
// This runs in about a second and catches that whole class.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();

// Load the repo's own metro.config.js. It is the authority: it starts from
// Metro's defaults and then adds/removes extensions, so reading the resolved
// config avoids guessing at internals whose subpaths are not exported.
function metroAssetExts(): Set<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(join(ROOT, "metro.config.js"));
  const exts: string[] = config?.resolver?.assetExts ?? [];
  if (exts.length === 0) throw new Error("metro.config.js exposed no resolver.assetExts");
  return new Set(exts.map((e) => e.toLowerCase()));
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".worktrees" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const assetExts = metroAssetExts();
const problems: string[] = [];

for (const file of sources(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1];
    const ext = extname(spec).slice(1).toLowerCase();
    if (!ext) continue;
    // only asset-looking requires; skip module paths and code extensions
    if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "node"].includes(ext)) continue;
    if (!assetExts.has(ext)) {
      problems.push(
        `${file.replace(ROOT, "").replace(/\\/g, "/")}: require("${spec}") uses .${ext}, ` +
          `which is not in Metro assetExts. Add it in metro.config.js or the bundle cannot resolve it.`
      );
    }
  }
}

if (problems.length > 0) {
  console.error("ASSET EXTS FAIL  a require() targets an extension Metro will not treat as an asset:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `ASSET EXTS PASS  every asset require() resolves against Metro assetExts (${assetExts.size} extensions registered)`
);
