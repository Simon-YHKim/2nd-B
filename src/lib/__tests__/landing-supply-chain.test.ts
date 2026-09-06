import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8").replace(/\r\n?/g, "\n");

const html = read("public/landing/index.html");
const workflow = read(".github/workflows/web-deploy.yml");
const packageJson = JSON.parse(read("package.json")) as {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
const packageLock = JSON.parse(read("package-lock.json")) as {
  packages?: Record<string, { devDependencies?: Record<string, string>; version?: string }>;
};

function contentSecurityPolicy(): Map<string, string[]> {
  const match = html.match(
    /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*\/?>/i,
  );
  if (!match) throw new Error("landing Content-Security-Policy meta is missing");

  return new Map(
    match[1]
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, values] as const;
      }),
  );
}

describe("standalone landing supply chain", () => {
  test("loads only a local, non-inline executable bundle", () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.[1]).toMatch(/\btype=["']module["']/i);
    expect(scripts[0]?.[1]).toMatch(/\bsrc=["']\.\/main\.bundle\.js["']/i);
    expect(scripts[0]?.[2].trim()).toBe("");
    expect(html).not.toMatch(/<script\b[^>]*\btype=["']importmap["']/i);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=["']https?:\/\//i);
    expect(html).not.toMatch(/<link\b[^>]*\bhref=["']https?:\/\//i);
    expect(html).not.toMatch(/\bon[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain("esm.sh");
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).not.toContain("Date.now()");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });

  test("uses an exact default-deny CSP and no-referrer policy", () => {
    expect(Object.fromEntries(contentSecurityPolicy())).toEqual({
      "default-src": ["'none'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'none'"],
      "connect-src": ["'none'"],
      "worker-src": ["'none'"],
      "media-src": ["'none'"],
      "object-src": ["'none'"],
      "frame-src": ["'none'"],
      "manifest-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
    });
    expect(html).not.toMatch(/unsafe-eval/i);
    expect(html).toMatch(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']\s*\/?>/i);
  });

  test("pins the local bundler inputs and exposes one extensible static build command", () => {
    expect(packageJson.devDependencies).toEqual(
      expect.objectContaining({ esbuild: "0.28.2", three: "0.160.0" }),
    );
    expect(packageJson.scripts?.["build:static"]).toBe("npm run build:static:landing");
    expect(packageJson.scripts?.["build:static:landing"]).toBe(
      "npx --no-install esbuild public/landing/main.js --bundle --format=esm --platform=browser --target=es2020 --outfile=dist/landing/main.bundle.js",
    );

    const lockRoot = packageLock.packages?.[""];
    expect(lockRoot?.devDependencies).toEqual(
      expect.objectContaining({ esbuild: "0.28.2", three: "0.160.0" }),
    );
    expect(packageLock.packages?.["node_modules/esbuild"]?.version).toBe("0.28.2");
    expect(packageLock.packages?.["node_modules/three"]?.version).toBe("0.160.0");
  });

  test("builds the local landing bundle after Expo export and before artifact sealing", () => {
    const exportIndex = workflow.indexOf("expo export --platform web --output-dir dist");
    const staticBuildIndex = workflow.indexOf("npm run build:static");
    const artifactCheckIndex = workflow.indexOf("Reject unsafe Pages artifact entries");

    expect(exportIndex).toBeGreaterThanOrEqual(0);
    expect(staticBuildIndex).toBeGreaterThan(exportIndex);
    expect(artifactCheckIndex).toBeGreaterThan(staticBuildIndex);
  });
});
