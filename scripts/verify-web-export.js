// npm run verify:web -- build the real static site, then inspect the emitted
// Expo documents rather than treating a successful bundle as sufficient.

const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readdirSync, readFileSync, rmSync } = require("node:fs");
const { join, relative } = require("node:path");

const OUT = "dist-smoke";
const APP_BASE_PATH = "/2nd-B/";
const PRODUCTION_ORIGIN = "https://simon-yhkim.github.io";
const HYDRATE_SCRIPT = "globalThis.__EXPO_ROUTER_HYDRATE__=true;";
const HYDRATE_SHA256 = "67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8=";
const HYDRATE_CSP_SOURCE = `'sha256-${HYDRATE_SHA256}'`;
const REQUIRED_SCRIPT_SOURCES = [
  "'self'",
  HYDRATE_CSP_SOURCE,
  "https://accounts.google.com/gsi/client",
  "https://www.googletagmanager.com",
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
  "https://cdn.paddle.com/paddle/v2/paddle.js",
];

function fail(message) {
  throw new Error(message);
}

function htmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...htmlFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag);
  return match ? decodeHtmlAttribute(match[2]) : null;
}

function metaBy(html, attributeName, expectedValue) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => attribute(tag, attributeName)?.toLowerCase() === expectedValue);
}

function parseCsp(policy, path) {
  const directives = new Map();
  for (const rawDirective of policy.split(";")) {
    const tokens = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    if (directives.has(name)) fail(`${path}: duplicate CSP directive ${name}`);
    directives.set(name, sources);
  }
  return directives;
}

function requireSources(directives, name, required, path) {
  const actual = directives.get(name);
  if (!actual) fail(`${path}: missing CSP directive ${name}`);
  for (const source of required) {
    if (!actual.includes(source)) fail(`${path}: ${name} is missing ${source}`);
  }
  return actual;
}

function verifyPolicy(policy, path) {
  if (policy.includes("'unsafe-eval'")) fail(`${path}: CSP permits unsafe-eval`);
  if (/(?:^|\s)\*(?:\s|;|$)|:\/\/\*\./.test(policy)) fail(`${path}: CSP contains a wildcard`);
  if (/(?:^|\s)https:(?:\s|;|$)/.test(policy)) fail(`${path}: CSP permits every HTTPS origin`);
  if (policy.includes("frame-ancestors")) {
    fail(`${path}: frame-ancestors is ineffective in a meta CSP`);
  }

  const directives = parseCsp(policy, path);
  const defaultSrc = requireSources(directives, "default-src", ["'none'"], path);
  if (defaultSrc.length !== 1) fail(`${path}: default-src must be exactly 'none'`);

  const scriptSrc = requireSources(directives, "script-src", REQUIRED_SCRIPT_SOURCES, path);
  if (scriptSrc.includes("'unsafe-inline'")) fail(`${path}: script-src permits unsafe-inline`);
  requireSources(directives, "script-src-attr", ["'none'"], path);
  requireSources(directives, "style-src", ["'self'", "'unsafe-inline'"], path);
  requireSources(directives, "img-src", ["'self'", "data:", "blob:"], path);
  requireSources(directives, "font-src", ["'self'", "data:"], path);
  requireSources(directives, "connect-src", [
    "'self'",
    "https://zoacryukmdeivmolvyhj.supabase.co",
    "wss://zoacryukmdeivmolvyhj.supabase.co",
  ], path);
  requireSources(directives, "frame-src", [
    "'self'",
    "https://accounts.google.com/gsi/",
    "https://buy.paddle.com",
  ], path);
  requireSources(directives, "media-src", ["'self'", "blob:"], path);
  requireSources(directives, "worker-src", ["'self'", "blob:"], path);
  requireSources(directives, "manifest-src", ["'self'"], path);
  requireSources(directives, "object-src", ["'none'"], path);
  requireSources(directives, "base-uri", ["'none'"], path);
  requireSources(directives, "form-action", ["'self'"], path);
}

function verifyDocument(path, html) {
  const label = relative(OUT, path);
  const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1];
  if (!head) fail(`${label}: missing head`);

  const cspMetas = metaBy(html, "http-equiv", "content-security-policy");
  if (cspMetas.length !== 1) fail(`${label}: expected exactly one CSP meta`);
  const cspOffset = head.indexOf(cspMetas[0]);
  const beforeCsp = head.slice(0, cspOffset);
  // React/Expo hoists inert title/charset/viewport metadata ahead of custom
  // head children. CSP must still precede everything that can load or execute.
  if (/<(?:script|style|link|base|object|iframe|img|audio|video|source|form)\b/i.test(beforeCsp)) {
    fail(`${label}: a resource-loading element appears before the CSP meta`);
  }
  if (/<meta\b[^>]*http-equiv=["']?refresh/i.test(beforeCsp)) {
    fail(`${label}: a redirecting meta appears before the CSP meta`);
  }
  const policy = attribute(cspMetas[0], "content");
  if (!policy) fail(`${label}: CSP meta has no policy`);
  verifyPolicy(policy, label);

  const referrerMetas = metaBy(html, "name", "referrer");
  if (referrerMetas.length !== 1) fail(`${label}: expected exactly one referrer meta`);
  if (attribute(referrerMetas[0], "content") !== "strict-origin-when-cross-origin") {
    fail(`${label}: unexpected referrer policy`);
  }

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const inlineScripts = scripts.filter((match) => attribute(match[0], "src") === null);
  if (inlineScripts.length !== 1 || inlineScripts[0][2] !== HYDRATE_SCRIPT) {
    fail(`${label}: inline script is not the exact Expo Router hydration marker`);
  }
  const actualHash = createHash("sha256").update(inlineScripts[0][2], "utf8").digest("base64");
  if (actualHash !== HYDRATE_SHA256) fail(`${label}: hydration script hash changed`);

  const externalScripts = scripts
    .map((match) => attribute(match[0], "src"))
    .filter((src) => src !== null);
  if (externalScripts.length === 0) fail(`${label}: missing Expo runtime scripts`);
  for (const src of externalScripts) {
    const resolved = new URL(src, PRODUCTION_ORIGIN);
    if (resolved.origin !== PRODUCTION_ORIGIN || !resolved.pathname.startsWith(APP_BASE_PATH)) {
      fail(`${label}: emitted non-self script ${src}`);
    }
  }
}

function run() {
  // shell:true is required for the npx.cmd shim in the supported Windows setup.
  const exportResult = spawnSync(`npx expo export --platform web --output-dir ${OUT}`, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      EXPO_NO_DOTENV: "1",
      EXPO_PUBLIC_UI: "deep-space",
      EXPO_USE_STATIC: "true",
    },
  });
  if (exportResult.error) fail(`could not start the export: ${exportResult.error.message}`);
  if (exportResult.status !== 0) fail("the web bundle did not build");

  const documents = htmlFiles(OUT)
    .map((path) => ({ path, html: readFileSync(path, "utf8") }))
    // Select app documents by their emitted runtime, not by the security
    // marker under test; otherwise deleting the marker would evade inspection.
    .filter(({ html }) => html.includes(`${APP_BASE_PATH}_expo/static/js/web/`));
  if (documents.length === 0) fail("the export contained no Expo app documents");
  for (const document of documents) verifyDocument(document.path, document.html);
  console.log(`\nWEB EXPORT PASS  ${documents.length} Expo documents enforce the audited CSP.`);
}

let exitCode = 0;
try {
  run();
} catch (error) {
  exitCode = 1;
  console.error(`\nWEB EXPORT FAIL  ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    rmSync(OUT, { recursive: true, force: true });
  } catch {
    console.warn(`WEB EXPORT WARN  could not remove ${OUT}`);
  }
}
process.exitCode = exitCode;
