import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8").replace(/\r\n?/g, "\n");

const PAGES = {
  index: read("public/landing/bg-concepts/index.html"),
  neural: read("public/landing/bg-concepts/concept-1-neural.html"),
  cosmos: read("public/landing/bg-concepts/concept-2-cosmos.html"),
};

function csp(html: string): Map<string, string[]> {
  const matches = [
    ...html.matchAll(
      /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*\/?\s*>/gi,
    ),
  ];
  if (matches.length !== 1) throw new Error(`expected one Content-Security-Policy meta, got ${matches.length}`);

  const directives = matches[0][1]
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => {
      const [name, ...values] = directive.split(/\s+/);
      return [name, values] as const;
    });
  const policy = new Map(directives);
  if (policy.size !== directives.length) throw new Error("duplicate Content-Security-Policy directive");
  return policy;
}

function inlineBlock(html: string, tag: "script" | "style"): string {
  const matches = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))];
  expect(matches).toHaveLength(1);
  return matches[0]?.[1] ?? "";
}

function sha256Source(block: string): string {
  return `'sha256-${createHash("sha256").update(block, "utf8").digest("base64")}'`;
}

describe("landing background concepts security", () => {
  test.each(Object.entries(PAGES))("%s has no remote resources or inline event handlers", (_name, html) => {
    const policyOffset = html.search(/<meta\s+http-equiv=["']Content-Security-Policy["']/i);
    const firstControlledResourceOffset = html.search(/<(?:style|script|link|img)\b/i);

    expect(policyOffset).toBeGreaterThanOrEqual(0);
    expect(policyOffset).toBeLessThan(firstControlledResourceOffset);
    expect(html).not.toMatch(/\b(?:href|src)=["'](?:https?:)?\/\//i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toMatch(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']\s*\/?\s*>/i);
  });

  test("index uses an exact default-deny policy with only local images and inline styles", () => {
    expect(Object.fromEntries(csp(PAGES.index))).toEqual({
      "default-src": ["'none'"],
      "script-src": ["'none'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'unsafe-inline'"],
      "img-src": ["'self'"],
      "font-src": ["'none'"],
      "connect-src": ["'none'"],
      "worker-src": ["'none'"],
      "media-src": ["'none'"],
      "object-src": ["'none'"],
      "frame-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
    });
    expect(PAGES.index).not.toMatch(/<script\b/i);
    expect(PAGES.index).not.toContain("Pretendard");
    expect(PAGES.index).not.toContain("cdn.jsdelivr.net");
    expect(PAGES.index).toMatch(/font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif/);
  });

  test.each([
    ["neural", PAGES.neural],
    ["cosmos", PAGES.cosmos],
  ])("%s allows only the exact inline style and script bytes", (_name, html) => {
    const styleHash = sha256Source(inlineBlock(html, "style"));
    const scriptHash = sha256Source(inlineBlock(html, "script"));

    expect(Object.fromEntries(csp(html))).toEqual({
      "default-src": ["'none'"],
      "script-src": [scriptHash],
      "script-src-attr": ["'none'"],
      "style-src": [styleHash],
      "style-src-attr": ["'none'"],
      "img-src": ["'self'"],
      "font-src": ["'none'"],
      "connect-src": ["'none'"],
      "worker-src": ["'none'"],
      "media-src": ["'none'"],
      "object-src": ["'none'"],
      "frame-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
    });
    expect(html).not.toMatch(/'unsafe-inline'|'unsafe-eval'/i);
  });
});
