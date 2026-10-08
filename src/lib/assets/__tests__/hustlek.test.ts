import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../..");

test("all 48 approved HustleK expressions ship unchanged and have static bindings", () => {
  const manifestPath = resolve(root, "assets/hustlek/manifest.json");
  expect(existsSync(manifestPath)).toBe(true);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  expect(manifest.character).toBe("HustleK");
  expect(manifest.expressions).toHaveLength(48);
  const bindings = readFileSync(resolve(root, "src/lib/assets/hustlek.ts"), "utf8");
  for (const expression of manifest.expressions) {
    const bytes = readFileSync(resolve(root, "assets/hustlek", expression.file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expression.sha256);
    expect(bytes.readUInt32BE(16)).toBe(362);
    expect(bytes.readUInt32BE(20)).toBe(362);
    expect(bindings).toContain(expression.file);
  }
});

test("the live head and exported share card both render the supplied portrait", () => {
  const head = readFileSync(resolve(root, "src/components/deepspace/SecondbHead.tsx"), "utf8");
  const card = readFileSync(resolve(root, "src/components/deepspace/ShareCard.tsx"), "utf8");
  expect(head).toContain("<HustleKPortrait");
  expect(card).toContain("source={HUSTLEK_EXPRESSIONS.A02.source}");
  expect(head).not.toContain("secondbHullRects");
  expect(card).not.toContain("secondb-head-front.png");
});

test("published prototype surfaces use the same original portraits", () => {
  const proto = resolve(root, "public/proto");
  for (const file of readdirSync(proto).filter(name => /\.(jsx|html)$/.test(name))) {
    expect({ file, oldArt: /assets\/(?:deepspace\/)?secondb-head[^"']*\.png/.test(readFileSync(resolve(proto, file), "utf8")) })
      .toEqual({ file, oldArt: false });
  }
  for (const file of ["A01-neutral.png", "A02-soft-smile.png", "C07-worried.png", "B04-thoughtful.png", "A08-playful-smirk.png"]) {
    const original = readFileSync(resolve(root, "assets/hustlek/png", file));
    expect(readFileSync(resolve(proto, "assets/hustlek", file)).equals(original)).toBe(true);
    expect(readFileSync(resolve(root, "design/proto_rev2/reference-app/assets/hustlek", file)).equals(original)).toBe(true);
  }
});
