import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EXPO_ROUTER_HYDRATE_CSP_SOURCE,
  GITHUB_PAGES_CSP,
  VERCEL_CSP,
  WEB_CSP_DIRECTIVES,
  WEB_REFERRER_POLICY,
  webDocumentCsp,
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
  const sandbox = {
    paddleEnvironment: "sandbox",
    supabaseUrl: "https://isolatedsandbox.supabase.co",
    paddleClientToken: `test_${"a".repeat(27)}`,
  };
  const configuredCsp = (config: Record<string, string | undefined>): string =>
    webDocumentCsp(false, config);

  test("sandbox permits only its configured DB and the SDK's exact sandbox origins", () => {
    const csp = configuredCsp(sandbox);
    expect(csp).toContain("https://isolatedsandbox.supabase.co");
    expect(csp).toContain("wss://isolatedsandbox.supabase.co");
    expect(csp).toContain("https://sandbox-api.paddle.com");
    expect(csp).toContain("https://sandbox-buy.paddle.com");
    expect(csp).toContain("https://sandbox-create-checkout.paddle.com");
    expect(csp).toContain("https://sandbox-cdn.paddle.com/paddle/v2/assets/css/paddle.css");
    expect(csp).toContain("https://sandbox-cdn.paddle.com/paddle/v2/error.html");
    expect(csp).toContain("https://cdn.paddle.com/paddle/v2/paddle.js");
    expect(csp).not.toContain("zoacryukmdeivmolvyhj.supabase.co");
    expect(csp).not.toMatch(/https:\/\/(?:api|buy|create-checkout|vendors)\.paddle\.com/);
    expect(csp).not.toMatch(/(?:^|\s)\*(?:\s|;|$)|:\/\/\*\.|(?:^|\s)https:(?:\s|;|$)/);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test.each([
    { supabaseUrl: undefined }, { supabaseUrl: "" },
    { supabaseUrl: "https://zoacryukmdeivmolvyhj.supabase.co" },
    { supabaseUrl: "http://isolatedsandbox.supabase.co" },
    { supabaseUrl: "https://isolatedsandbox.supabase.co.attacker.test" },
    { supabaseUrl: "https://user:pass@isolatedsandbox.supabase.co" },
    { supabaseUrl: "https://isolatedsandbox.supabase.co:444" },
    { supabaseUrl: "https://isolatedsandbox.supabase.co/path" },
    { supabaseUrl: "https://isolatedsandbox.supabase.co?env=sandbox" },
    { supabaseUrl: "https://isolatedsandbox.supabase.co#fragment" },
    { paddleClientToken: undefined }, { paddleClientToken: "test_bad" },
    { paddleClientToken: `live_${"a".repeat(27)}` },
    { paddleEnvironment: "unknown" }, { paddleEnvironment: "" },
  ])("invalid sandbox config cannot authorize either billing environment: %#", (override) => {
    const csp = configuredCsp({ ...sandbox, ...override });
    expect(csp).not.toMatch(/(?:supabase|paddle)\.com|\.supabase\.co/);
    expect(csp).toContain("default-src 'none'");
  });

  test("production policy ignores alternative DB config and never admits sandbox hosts", () => {
    expect(configuredCsp({ ...sandbox, paddleEnvironment: "production" })).toBe(GITHUB_PAGES_CSP);
    expect(configuredCsp({ ...sandbox, paddleEnvironment: undefined })).toBe(GITHUB_PAGES_CSP);
    expect(GITHUB_PAGES_CSP).not.toContain("sandbox-");
    expect(VERCEL_CSP).not.toContain("sandbox-");
  });

  test("the document supplies build-time sandbox config without reading a request URL", () => {
    expect(HTML_SOURCE).toContain("paddleEnvironment: process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT");
    expect(HTML_SOURCE).toContain("supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL");
    expect(HTML_SOURCE).toContain("paddleClientToken: process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN");
    expect(HTML_SOURCE).not.toContain("window.location");
    expect(HTML_SOURCE).not.toContain("URLSearchParams");
  });

  test("Metro eval is development-only and exports keep the production policy", () => {
    expect(webDocumentCsp(true)).toContain("'unsafe-eval'");
    expect(webDocumentCsp(false)).toBe(GITHUB_PAGES_CSP);
    expect(webDocumentCsp(true).replace(" 'unsafe-eval'", "")).toBe(GITHUB_PAGES_CSP);
  });
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
    expect(head).toContain('content={webDocumentCsp(process.env.NODE_ENV === "development", {');
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
