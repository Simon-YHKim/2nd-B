import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8").replace(/\r\n?/g, "\n");
const readMaybe = (path: string): string =>
  existsSync(join(ROOT, path)) ? read(path) : "";

const html = read("public/proto/2nd-Brain.html");
const css = read("public/proto/m3-theme.css");
const workflow = read(".github/workflows/web-deploy.yml");
const buildScript = readMaybe("scripts/build-proto.mjs");
const packageJson = JSON.parse(read("package.json")) as {
  scripts?: Record<string, string>;
};

const JSX_OUTPUT_ORDER = [
  "tweaks-panel.js",
  "sb-data.js",
  "sb-neural.js",
  "sb-wikigraph.js",
  "sb-relgraph.js",
  "sb-persona.js",
  "sb-home.js",
  "sb-screens-core.js",
  "sb-screens-know.js",
  "sb-screens-extra.js",
  "sb-enrich.js",
  "sb-museum.js",
  "sb-flows.js",
  "sb-validate.js",
  "sb-more.js",
  "sb-surfaces.js",
  "sb-gaps.js",
  "sb-digest.js",
  "sb-audit.js",
  "sb-hobby.js",
  "sb-health.js",
  "sb-healthinput.js",
  "sb-careerinput.js",
  "sb-drilldown.js",
  "sb-relinput.js",
  "sb-me.js",
  "sb-ops.js",
  "sb-app.js",
];

function scripts(): Array<{ attrs: string; body: string; src: string | null }> {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(
    ([, attrs, body]) => ({
      attrs,
      body,
      src: attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? null,
    }),
  );
}

function contentSecurityPolicy(): Record<string, string[]> {
  const match = html.match(
    /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*\/?>/i,
  );
  if (!match) throw new Error("proto Content-Security-Policy meta is missing");

  return Object.fromEntries(
    match[1]
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, values];
      }),
  );
}

describe("standalone proto supply chain", () => {
  test("loads one local React vendor and compiled scripts in dependency order", () => {
    const tags = scripts();
    const sources = tags.map(({ src }) => src);

    expect(sources).toEqual([
      "./vendor.js",
      "./sb-boot.js",
      "./tweaks-panel.js",
      "./image-slot.js",
      ...JSX_OUTPUT_ORDER.slice(1).map((name) => `./${name}`),
    ]);
    expect(tags.every(({ body, src }) => src !== null && body.trim() === "")).toBe(true);
    expect(html).not.toMatch(/\btext\/babel\b|@babel\/standalone|\bunpkg\.com\b/i);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=["']https?:\/\//i);
    expect(html).not.toMatch(/<script\b[^>]*\btype=["']importmap["']/i);
    expect(html).not.toMatch(/\bon[a-z]+\s*=|javascript:|unsafe-eval/i);
  });

  test("covers every JSX source exactly once with a local compiled output", () => {
    const sources = scripts()
      .map(({ src }) => src?.replace(/^\.\//, ""))
      .filter((src): src is string => src?.endsWith(".js") ?? false);
    const compiledSources = sources.filter(
      (src) => !["vendor.js", "sb-boot.js", "image-slot.js"].includes(src),
    );
    const expectedFromDisk = readdirSync(join(ROOT, "public/proto"))
      .filter((name) => name.endsWith(".jsx"))
      .map((name) => name.replace(/\.jsx$/, ".js"))
      .sort();

    expect(compiledSources).toEqual(JSX_OUTPUT_ORDER);
    expect([...compiledSources].sort()).toEqual(expectedFromDisk);
    expect(new Set(compiledSources).size).toBe(compiledSources.length);
  });

  test("uses an exact default-deny CSP and no-referrer policy", () => {
    expect(contentSecurityPolicy()).toEqual({
      "default-src": ["'none'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'none'"],
      "connect-src": ["'self'"],
      "worker-src": ["'none'"],
      "media-src": ["'none'"],
      "object-src": ["'none'"],
      "frame-src": ["'none'"],
      "manifest-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
    });
    expect(html).toMatch(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i);
  });

  test("uses only local CSS with system font fallbacks", () => {
    expect(css).not.toMatch(/@import|url\(\s*["']?https?:\/\//i);
    expect(html).not.toMatch(/<link\b[^>]*\bhref=["']https?:\/\//i);
    expect(css).toMatch(/--md-ref-typeface-brand:\s*system-ui,/);
    expect(css).toMatch(/--md-ref-typeface-plain:\s*system-ui,/);
    expect(css).toMatch(/--md-ref-typeface-mono:\s*ui-monospace,/);
    expect(html).not.toMatch(/<style\b/i);
  });

  test("chains the deterministic proto compiler into the existing static build", () => {
    expect(packageJson.scripts?.["build:static"]).toBe("npm run build:static:landing");
    expect(packageJson.scripts?.["build:static:proto"]).toBe("node scripts/build-proto.mjs");
    expect(packageJson.scripts?.["postbuild:static:landing"]).toBe(
      "npm run build:static:proto",
    );
    expect(buildScript).toContain('createRequire(import.meta.url)');
    expect(buildScript).toContain('require("esbuild")');
    expect(buildScript).toContain('import React from "react"');
    expect(buildScript).toContain('import { createRoot } from "react-dom/client"');
    expect(buildScript).toContain("globalThis.React = React");
    expect(buildScript).toContain("globalThis.ReactDOM = { createRoot }");
    expect(buildScript).toMatch(/\.filter\([^\n]+\.jsx/);
    expect(buildScript).toContain(".sort(");
    expect(buildScript).toContain('format: "iife"');
    expect(buildScript).toContain("sourcemap: false");
    expect(buildScript).toContain("isSymbolicLink()");
    expect(buildScript).toContain("realpath(");

    const exportIndex = workflow.indexOf("expo export --platform web --output-dir dist");
    const staticBuildIndex = workflow.indexOf("npm run build:static");
    expect(exportIndex).toBeGreaterThanOrEqual(0);
    expect(staticBuildIndex).toBeGreaterThan(exportIndex);
  });
});
