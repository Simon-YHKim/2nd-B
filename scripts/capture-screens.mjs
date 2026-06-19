#!/usr/bin/env node
/**
 * capture-screens.mjs — live-link screen capture wrapper for design audits.
 *
 * Why this exists: the GitHub Pages build is an Expo / React-Native-Web SPA,
 * so a raw HTML fetch shows nothing useful — you need a real browser that runs
 * the JS. In the remote/CI environment outbound traffic also goes through a
 * TLS-intercepting proxy whose CA the browser does not trust, so navigation
 * fails with ERR_CERT_AUTHORITY_INVALID unless HTTPS errors are ignored. This
 * wrapper bakes in all three unlocks (browser path + cert bypass + SPA wait)
 * so a design pass is one command:
 *
 *   node scripts/capture-screens.mjs
 *
 * Output: PNG per route + report.json + report.md under docs/design-audit/
 * (override with OUT=...). Each entry records console errors, visible text,
 * and whether the route redirected (e.g. auth-gated -> sign-in).
 *
 * Env overrides:
 *   BASE_URL   live base (default https://simon-yhkim.github.io/2nd-B)
 *   OUT        output dir (default docs/design-audit)
 *   PW_PATH    Playwright module path (auto-detected otherwise)
 *   PW_CHROME  Chromium executable (auto-detected otherwise)
 *   ROUTES     comma-separated route override (default: full list below)
 *   VIEWPORT   "WxH" (default 390x844, phone-first)
 *   WAIT_MS    extra settle wait after networkidle (default 4000)
 *
 * No new npm dependency: Playwright + Chromium are resolved from whatever the
 * environment already provides.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const BASE_URL = (process.env.BASE_URL || 'https://simon-yhkim.github.io/2nd-B').replace(/\/$/, '');
const OUT = process.env.OUT || path.resolve('docs/design-audit');
const WAIT_MS = Number(process.env.WAIT_MS || 4000);
const [VW, VH] = (process.env.VIEWPORT || '390x844').split('x').map(Number);

// Navigable screens. Excludes _layout / +html / +not-found, the dynamic
// /record/[id], and the /oauth-callback redirect target.
const DEFAULT_ROUTES = [
  '/', '/sign-in', '/sign-up', '/reset-password', '/complete-profile',
  '/onboarding', '/deepspace-home', '/deepspace-hub', '/deepspace-preview',
  '/core-brain', '/secondb', '/jarvis', '/persona', '/iden', '/discover',
  '/imagine', '/capture', '/inbox', '/journal', '/records', '/research',
  '/interview', '/esm', '/big-five', '/mbti', '/insights', '/graph', '/data',
  '/formats', '/import', '/integrations', '/attachment', '/review', '/audit',
  '/ops', '/manual', '/account', '/profile', '/settings', '/theme', '/plans',
  '/permissions', '/privacy', '/support',
];
const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(',').map((r) => r.trim()).filter(Boolean)
  : DEFAULT_ROUTES;

function resolvePlaywright() {
  const candidates = [
    process.env.PW_PATH,
    'playwright', // project node_modules, if installed
    '/opt/node22/lib/node_modules/playwright/index.js', // global in remote env
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const mod = require(c);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return chromium;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'Playwright not found. Set PW_PATH=/path/to/playwright or `npm i -D playwright`.',
  );
}

function resolveChromeExecutable() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  // Common preinstalled location in the remote/CI image.
  const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return existsSync(guess) ? guess : undefined; // undefined -> use bundled
}

function slug(route) {
  if (route === '/') return 'index';
  return route.replace(/^\//, '').replace(/\//g, '_');
}

async function main() {
  const chromium = resolvePlaywright();
  const executablePath = resolveChromeExecutable();
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath, // undefined falls back to Playwright's bundled Chromium
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    isMobile: true,
    ignoreHTTPSErrors: true, // the key unlock for the proxy's untrusted CA
  });

  const report = [];
  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

    const entry = { route, url, file: null, finalUrl: null, redirected: false, errors, text: '', status: 'ok' };
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(WAIT_MS);
      entry.finalUrl = page.url();
      entry.redirected = !entry.finalUrl.replace(/\/$/, '').endsWith(route === '/' ? BASE_URL.split('/').pop() : route);
      const file = path.join(OUT, `${slug(route)}.png`);
      await page.screenshot({ path: file, fullPage: false });
      entry.file = path.relative(process.cwd(), file);
      entry.text = (await page.evaluate(() => document.body.innerText)).slice(0, 600);
      if (resp && resp.status() >= 400) entry.status = `http-${resp.status()}`;
    } catch (e) {
      entry.status = 'error';
      entry.errors.push('CAPTURE_FAILED: ' + e.message);
    }
    await page.close();
    const tag = entry.status !== 'ok' ? `[${entry.status}]` : entry.redirected ? '[redirected]' : '[ok]';
    console.log(`${tag.padEnd(14)} ${route} -> ${entry.file || entry.finalUrl || '(none)'}`);
    report.push(entry);
  }

  await browser.close();

  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ baseUrl: BASE_URL, capturedAt: new Date().toISOString(), viewport: { width: VW, height: VH }, screens: report }, null, 2));

  const md = [
    `# Live-link screen capture`,
    ``,
    `- Base: ${BASE_URL}`,
    `- Captured: ${new Date().toISOString()}`,
    `- Viewport: ${VW}x${VH} (mobile)`,
    `- Screens: ${report.length}`,
    ``,
    `| Route | Status | Console errors | Screenshot |`,
    `|---|---|---|---|`,
    ...report.map((e) => `| \`${e.route}\` | ${e.redirected ? 'redirected' : e.status} | ${e.errors.length} | ${e.file ? `\`${e.file}\`` : '—'} |`),
    ``,
    `> Compare each screenshot against \`docs/CONCEPT.md\` (canon vs legacy),`,
    `> \`DESIGN.md\`, and the Visual Tier System + Information Density rules in`,
    `> \`CLAUDE.md\`. Redirected routes are typically auth-gated.`,
    ``,
  ].join('\n');
  writeFileSync(path.join(OUT, 'report.md'), md);

  const failed = report.filter((e) => e.status === 'error').length;
  console.log(`\nDone. ${report.length} routes, ${failed} failed. Output: ${path.relative(process.cwd(), OUT)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
