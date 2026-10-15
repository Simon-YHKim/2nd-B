import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// Share capture and live screens now share the supplied HustleK portraits.
// Retired raster heads and the SVG hull must not return through another import.
const SRC = resolve(__dirname, "../../..");
const OLD_ART_IMPORT = /(?:require\(\s*|from\s+)["'][^"']*(?:secondb-(?:head|meta|twi)(?:-[a-z]+)?\.png|secondb-hull)["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC);
const consumers = files
  .filter(p => OLD_ART_IMPORT.test(readFileSync(p, "utf8")))
  .map(p => `src/${relative(SRC, p).split(sep).join("/")}`)
  .sort();

test("no live component imports a retired robot image or hull", () => {
  expect(files.length).toBeGreaterThan(300);
  expect(consumers).toEqual([]);
});

test("feedback surfaces share the character entrypoint", () => {
  for (const name of ["CompletionToast.tsx", "RewardedSheet.tsx"]) {
    const source = readFileSync(resolve(__dirname, "..", name), "utf8");
    expect({ name, shared: /<SecondbHead\b/.test(source) }).toEqual({ name, shared: true });
    expect(source).not.toMatch(OLD_ART_IMPORT);
  }
});

test("share capture uses the static supplied portrait instead of a separate mascot", () => {
  const card = readFileSync(resolve(__dirname, "../ShareCard.tsx"), "utf8");
  expect(card).toContain("source={HUSTLEK_EXPRESSIONS.A02.source}");
  expect(card).toContain('import { Image, StyleSheet } from "react-native"');
  expect(card).not.toMatch(OLD_ART_IMPORT);
});
