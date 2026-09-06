import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EXPO_ROUTER_HYDRATE_CSP_SOURCE,
  GITHUB_PAGES_CSP,
  VERCEL_CSP,
  WEB_CSP_DIRECTIVES,
  WEB_REFERRER_POLICY,
} from "../../lib/web-security-policy";

const ROOT = resolve(__dirname, "../../..");
const HTML_SOURCE = readFileSync(resolve(ROOT, "src/app/+html.tsx"), "utf8");
const VERCEL = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8")) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const EXPORT_VERIFIER = readFileSync(resolve(ROOT, "scripts/verify-web-export.js"), "utf8");

function vercelCsp(): string {
  const header = VERCEL.headers[0]?.headers.find(
    (candidate) => candidate.key === "Content-Security-Policy",
  );
  if (!header) throw new Error("Vercel CSP header is missing");
  return header.value;
}

describe("web document security policy", () => {
  test("the GitHub Pages document starts with CSP and referrer meta controls", () => {
    const head = HTML_SOURCE.slice(
      HTML_SOURCE.indexOf("<head>"),
      HTML_SOURCE.indexOf("</head>"),
    );
    const cspAt = head.indexOf('httpEquiv="Content-Security-Policy"');
    expect(cspAt).toBeGreaterThan(0);
    expect(cspAt).toBeLessThan(head.indexOf('charSet="utf-8"'));
    expect(cspAt).toBeLessThan(head.indexOf("<link"));
    expect(cspAt).toBeLessThan(head.indexOf("<style"));
    expect(head).toContain("content={GITHUB_PAGES_CSP}");
    expect(head).toContain('name="referrer" content={WEB_REFERRER_POLICY}');
    expect(WEB_REFERRER_POLICY).toBe("strict-origin-when-cross-origin");
  });

  test("the Pages policy is default-deny without executable wildcard fallbacks", () => {
    const names = WEB_CSP_DIRECTIVES.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(GITHUB_PAGES_CSP).toContain("default-src 'none'");
    expect(GITHUB_PAGES_CSP).toContain(EXPO_ROUTER_HYDRATE_CSP_SOURCE);
    expect(GITHUB_PAGES_CSP).not.toContain("frame-ancestors");
    expect(GITHUB_PAGES_CSP).not.toContain("'unsafe-eval'");
    expect(GITHUB_PAGES_CSP).not.toMatch(/(?:^|\s)\*(?:\s|;|$)|:\/\/\*\./);
    expect(GITHUB_PAGES_CSP).not.toMatch(/(?:^|\s)https:(?:\s|;|$)/);

    const script = WEB_CSP_DIRECTIVES.find(([name]) => name === "script-src");
    expect(script).toBeDefined();
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).toEqual(
      expect.arrayContaining([
        EXPO_ROUTER_HYDRATE_CSP_SOURCE,
        "https://accounts.google.com/gsi/client",
        "https://www.googletagmanager.com",
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
        "https://cdn.paddle.com/paddle/v2/paddle.js",
      ]),
    );
    expect(GITHUB_PAGES_CSP).toContain("style-src 'self' 'unsafe-inline'");
    expect(GITHUB_PAGES_CSP).toContain("https://zoacryukmdeivmolvyhj.supabase.co");
    expect(GITHUB_PAGES_CSP).not.toContain("*.supabase");
  });

  test("the non-production Vercel header is exact parity plus header-only framing", () => {
    expect(vercelCsp()).toBe(VERCEL_CSP);
    expect(VERCEL_CSP).toBe(`${GITHUB_PAGES_CSP}; frame-ancestors 'none'`);
  });

  test("the real Expo export verifier checks the emitted policy and inline hash", () => {
    expect(EXPORT_VERIFIER).toContain("content-security-policy");
    expect(EXPORT_VERIFIER).toContain("globalThis.__EXPO_ROUTER_HYDRATE__=true;");
    expect(EXPORT_VERIFIER).toContain("67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8=");
    expect(EXPORT_VERIFIER).toContain("_expo/static/js/web/");
    expect(EXPORT_VERIFIER).toContain("unsafe-eval");
  });
});
