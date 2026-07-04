#!/usr/bin/env node
/**
 * clone-fidelity.mjs — serve the exported web build, screenshot every mapped
 * route at 390x844, and write a side-by-side composite against the reference
 * capture so a reviewer (human or agent) can diff to zero.
 *
 * Usage:  node scripts/clone-fidelity.mjs [route1,route2,...]
 * Env:    DIST (default dist), REF (reference captures dir), OUT, PORT
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, statSync, createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const DIST = path.resolve(process.env.DIST || 'dist');
const REF = path.resolve(
  process.env.REF ||
    '/tmp/claude-0/-home-user/a575a56f-1da0-510a-af3e-507d865351e3/scratchpad/design-target/design_handoff_2nd_brain/docs/Screen-Spec/captures',
);
const OUT = path.resolve(process.env.OUT || 'docs/clone-audit');
const PORT = Number(process.env.PORT || 8199);
const BASE = '/2nd-B';
const [VW, VH] = (process.env.VIEWPORT || '390x844').split('x').map(Number);

// reference capture (NN-name.png) -> app route
const MAP = {
  '01-auth': '/sign-in',
  '02-onboard': '/onboarding',
  '03-ttfv': '/ttfv',
  '05-home': '/deepspace-home',
  '06-capture': '/capture',
  '07-chat': '/secondb',
  '08-records': '/records',
  '09-settings': '/settings',
  '10-me': '/persona',
  '12-record': '/record/r1',
  '13-interview': '/interview',
  '14-bigfive': '/big-five',
  '15-attachment': '/attachment',
  '16-values': '/values',
  '17-audit': '/audit',
  '18-trend': '/trends',
  '19-motivation': '/motivation',
  '20-strengths': '/strengths',
  '21-northstar': '/northstar',
  '22-ratify': '/ratifications',
  '23-iden': '/iden',
  '24-ops': '/ops',
  '25-focus': '/focus',
  '26-reminders': '/reminders',
  '27-inbox': '/inbox',
  '28-connect': '/integrations',
  '29-import': '/import',
  '30-datareview': '/data',
  '31-callrec': '/call-reflection',
  '32-share': '/share-card',
  '33-plans': '/plans',
  '34-museum': '/museum',
  '36-imagine': '/imagine',
};

const only = process.argv[2] ? process.argv[2].split(',') : null;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function resolvePlaywright() {
  for (const p of [process.env.PW_PATH, 'playwright', 'playwright-core']) {
    if (!p) continue;
    try { return require(p); } catch {}
  }
  throw new Error('playwright not found');
}
function resolveChrome() {
  const c = process.env.PW_CHROME || '/opt/pw-browsers/chromium/chrome-linux/chrome';
  if (existsSync(c)) return c;
  return undefined;
}

function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.startsWith(BASE)) rel = rel.slice(BASE.length) || '/';
      let file = path.join(DIST, rel);
      try {
        if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!existsSync(file)) {
          // expo-router static export: /route -> route.html
          const html = path.join(DIST, rel.replace(/\/$/, '') + '.html');
          file = existsSync(html) ? html : path.join(DIST, 'index.html');
        }
      } catch { file = path.join(DIST, 'index.html'); }
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

function envVal(file, key) {
  try {
    const t = readFileSync(path.resolve(file), 'utf8');
    return (t.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1]?.trim();
  } catch { return undefined; }
}

// Fetch a real QA session from Supabase via curl (respects HTTPS_PROXY; the
// egress policy allows supabase.co). Returns the session object supabase-js
// persists, or null. Injected into localStorage so the app boots signed-in
// without any in-browser form flow.
function fetchQaSession() {
  const url = envVal('.env', 'EXPO_PUBLIC_SUPABASE_URL');
  const anon = envVal('.env', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const email = envVal('.env.test', 'QA_TEST_EMAIL');
  const password = envVal('.env.test', 'QA_TEST_PASSWORD');
  if (!url || !anon || !email || !password) return null;
  const ref = new URL(url).hostname.split('.')[0];
  try {
    const { execFileSync } = require('node:child_process');
    const body = JSON.stringify({ email, password });
    const out = execFileSync('curl', [
      '-sS', '-X', 'POST', `${url}/auth/v1/token?grant_type=password`,
      '-H', `apikey: ${anon}`, '-H', 'Content-Type: application/json', '-d', body,
    ], { encoding: 'utf8', timeout: 30000 });
    const session = JSON.parse(out);
    if (!session.access_token) { console.log('auth: no access_token in response'); return null; }
    return { ref, session };
  } catch (e) { console.log('auth curl error:', e.message); return null; }
}

async function main() {
  if (!existsSync(DIST)) { console.error('no dist/ — run: npx expo export --platform web'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(OUT, 'current'), { recursive: true });
  const { chromium } = resolvePlaywright();
  const server = await serve();
  // Route the browser's outbound HTTPS (Supabase auth/data) through the agent
  // proxy; localhost (the dist server) is bypassed. ignoreHTTPSErrors trusts
  // the proxy's MITM cert.
  // Chromium proxies loopback by default when a proxy is set — the `<-loopback>`
  // token bypasses it so the local dist server loads; Supabase HTTPS still tunnels.
  const proxy = process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY, bypass: '<-loopback>,localhost,127.0.0.1' }
    : undefined;
  const browser = await chromium.launch({ executablePath: resolveChrome(), proxy, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH }, deviceScaleFactor: 2,
    ignoreHTTPSErrors: true, locale: 'ko-KR',
  });
  // Seed localStorage before first paint: Korean UI language (matches the
  // all-Korean reference) + a real QA Supabase session so auth-gated routes
  // render their real screens instead of redirecting to /sign-in.
  const auth = process.env.NO_AUTH === '1' ? null : fetchQaSession();
  await ctx.addInitScript((a) => {
    try {
      localStorage.setItem('2nd-brain:locale', 'ko');
      if (a) localStorage.setItem('supabase.auth.token', JSON.stringify(a.session));
    } catch {}
  }, auth);
  console.log(auth ? '✓ QA session injected' : '✗ no auth — gated routes will show sign-in');
  const report = [];
  for (const [name, route] of Object.entries(MAP)) {
    if (only && !only.includes(name) && !only.includes(route)) continue;
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const url = `http://localhost:${PORT}${BASE}${route}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) { errors.push('nav: ' + e.message); }
    await page.waitForTimeout(Number(process.env.WAIT_MS || 3500));
    const shot = path.join(OUT, 'current', name + '.png');
    await page.screenshot({ path: shot });
    const refExists = existsSync(path.join(REF, name + '.png'));
    report.push({ name, route, errors: errors.slice(0, 5), refExists });
    console.log(`${refExists ? '✓' : '?'} ${name} -> ${route} ${errors.length ? '(' + errors.length + ' err)' : ''}`);
    await page.close();
  }
  await browser.close();
  server.close();
  require('node:fs').writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${report.length} screenshots to ${OUT}/current`);
}
main();
