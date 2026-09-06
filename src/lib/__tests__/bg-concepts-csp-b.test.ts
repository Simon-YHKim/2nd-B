import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const PAGE_PATHS = [
  "public/landing/bg-concepts/concept-3-gravity.html",
  "public/landing/bg-concepts/concept-4-interior.html",
  "public/landing/bg-concepts/concept-5-hybrid-dim.html",
  "public/landing/bg-concepts/concept-5b-hybrid-rev.html",
] as const;

const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n?/g, "\n");

function extractBlocks(html: string, tag: "style" | "script"): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .filter((match) => tag !== "script" || !/\bsrc\s*=/i.test(match[0]))
    .map((match) => match[1]);
}

function sha256Source(value: string): string {
  return `'sha256-${createHash("sha256").update(value, "utf8").digest("base64")}'`;
}

function contentSecurityPolicy(html: string): Map<string, string[]> {
  const match = html.match(
    /<meta\s+http-equiv=(["'])Content-Security-Policy\1\s+content=(["'])([\s\S]*?)\2\s*\/?>/i,
  );
  if (!match) throw new Error("Content-Security-Policy meta is missing");

  const policy = new Map<string, string[]>();
  for (const directive of match[3].split(";").map((value) => value.trim()).filter(Boolean)) {
    const [name, ...values] = directive.split(/\s+/);
    if (policy.has(name)) throw new Error(`Duplicate CSP directive: ${name}`);
    policy.set(name, values);
  }
  return policy;
}

describe("background concept CSP group B", () => {
  test.each(PAGE_PATHS)("%s has a default-deny, hash-only policy", (path) => {
    const html = read(path);
    const csp = contentSecurityPolicy(html);
    const styleHashes = extractBlocks(html, "style").map(sha256Source);
    const scriptHashes = extractBlocks(html, "script").map(sha256Source);

    expect(styleHashes).toHaveLength(1);
    expect([...csp.keys()]).toEqual([
      "default-src",
      "img-src",
      "style-src",
      "style-src-attr",
      "script-src",
      "script-src-attr",
      "base-uri",
      "form-action",
    ]);
    expect(csp.get("default-src")).toEqual(["'none'"]);
    expect(csp.get("img-src")).toEqual(["'self'"]);
    expect(csp.get("style-src")).toEqual(styleHashes);
    expect(csp.get("style-src-attr")).toEqual(["'none'"]);
    expect(csp.get("script-src")).toEqual(scriptHashes.length ? scriptHashes : ["'none'"]);
    expect(csp.get("script-src-attr")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'none'"]);
    expect([...csp.values()].flat()).not.toEqual(
      expect.arrayContaining(["*", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:"]),
    );
    expect(html).toMatch(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']\s*\/?>/i);
  });

  test.each(PAGE_PATHS)("%s has no remotely hosted or inline-attribute resources", (path) => {
    const html = read(path);
    const landingRoot = resolve(process.cwd(), "public/landing");
    const localResources = [...html.matchAll(/<(?:script|img|link|source)\b[^>]*\s(?:src|href)=["']([^"']+)["']/gi)]
      .map((match) => match[1]);

    expect(html).not.toMatch(/<(?:script|img|link|iframe|audio|video|source)\b[^>]*\s(?:src|href)=["'](?:https?:)?\/\//i);
    expect(html).not.toMatch(/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i);
    expect(html).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
    expect(html).not.toMatch(/\b(?:fetch|importScripts)\s*\(\s*["'](?:https?:)?\/\//i);
    expect(html).not.toMatch(/\b(?:WebSocket|EventSource)\s*\(\s*["'](?:https?:)?\/\//i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/@font-face|Pretendard|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/i);
    expect(html.replaceAll("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:\/\//i);
    expect(html).toMatch(
      /font-family:\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont,\s*["']Segoe UI["'],\s*sans-serif/i,
    );
    for (const resource of localResources) {
      expect(resource).not.toMatch(/^(?:data|blob|javascript):/i);
      const resolvedResource = resolve(process.cwd(), dirname(path), resource);
      expect(resolvedResource.startsWith(`${landingRoot}${sep}`)).toBe(true);
      expect(existsSync(resolvedResource)).toBe(true);
    }
  });
});
