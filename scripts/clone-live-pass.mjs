#!/usr/bin/env node
/**
 * clone-live-pass.mjs — REAL-login live pixel pass for the auth-gated clones.
 *
 * Unlike scripts/clone-fidelity.mjs (which injects a Supabase session into
 * localStorage — a path AuthContext never adopts in the exported web build,
 * see docs/clone-audit/README.md "Known blocker"), this harness performs an
 * ACTUAL sign-in through the UI: /sign-in → "이메일로 계속하기" → email+password
 * → 로그인 → wait for the authenticated redirect. The gotrue client then owns
 * the session end-to-end, so every gated route renders its real screen.
 *
 * Build prereq (worktrees can't expo-export — metro blockList blocks
 * `.worktrees` paths): git archive HEAD | tar -x into E:/_tmp-livepass
 * (same drive as node_modules), junction node_modules, copy .env, then
 *   EXPO_PUBLIC_UI=deep-space EXPO_USE_STATIC=true EXPO_PUBLIC_LLM_MODE=mock \
 *   npx expo export --platform web --output-dir dist
 *
 * Usage:  node scripts/clone-live-pass.mjs [name1,name2,...]
 * Env:    DIST (default E:/_tmp-livepass/dist), ENV_DIR (default E:/2ndB),
 *         OUT (default docs/clone-audit/current-live), PORT, PW_PATH, WAIT_MS
 * Creds:  QA_TEST_EMAIL / QA_TEST_PASSWORD from <ENV_DIR>/.env.test
 *         (committed QA account — see that file's header; never a real secret).
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, statSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const DIST = path.resolve(process.env.DIST || 'E:/_tmp-livepass/dist');
const ENV_DIR = path.resolve(process.env.ENV_DIR || 'E:/2ndB');
const OUT = path.resolve(process.env.OUT || 'docs/clone-audit/current-live');
const PORT = Number(process.env.PORT || 8213);
const BASE = '/2nd-B';
const WAIT_MS = Number(process.env.WAIT_MS || 3500);
const [VW, VH] = (process.env.VIEWPORT || '390x844').split('x').map(Number);

// reference capture (NN-name.png) -> app route (same map as clone-fidelity.mjs)
const MAP = {
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
  for (const p of [
    process.env.PW_PATH,
    'C:/Users/202502/AppData/Roaming/npm/node_modules/playwright',
    'playwright',
    'playwright-core',
  ]) {
    if (!p) continue;
    try { return require(p); } catch {}
  }
  throw new Error('playwright not found');
}

// GitHub-Pages-like server: /2nd-B prefix, extensionless route -> route.html,
// miss -> 404.html (Pages copies +not-found.html to 404.html on deploy).
function serve() {
  const fallback = ['404.html', '+not-found.html'].map((f) => path.join(DIST, f)).find(existsSync);
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.startsWith(BASE)) rel = rel.slice(BASE.length) || '/';
      let file = path.join(DIST, rel);
      try {
        if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!existsSync(file)) {
          const html = path.join(DIST, rel.replace(/\/$/, '') + '.html');
          file = existsSync(html) ? html : fallback;
        }
      } catch { file = fallback; }
      if (!file || !existsSync(file)) { res.writeHead(404); res.end('miss'); return; }
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

function envVal(file, key) {
  try {
    const t = readFileSync(file, 'utf8');
    return (t.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1]?.trim();
  } catch { return undefined; }
}

// Each full page load replays the LoadingScreen intro (typing ≥2.5s → ready
// tap-gate → 4s auto-continue → 0.8s dolly zoom; src/components/ui/
// LoadingScreen.tsx). Tap through it instead of waiting it out.
async function passIntro(page) {
  const hint = page.getByText('탭해서 두번째 뇌를 열기');
  const loader = page.getByRole('button', { name: /2nd-Brain (열기|불러오는 중|여는 중)/ });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (await hint.isVisible().catch(() => false)) {
      await page.mouse.click(Math.round(VW / 2), Math.round(VH / 2));
      break;
    }
    if (!(await loader.isVisible().catch(() => false))) return; // no intro / already past
    await page.waitForTimeout(250); // still typing — poll for the ready hint
  }
  await hint.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500); // zoom-out + first paint of the real screen
}

// The 12-record route needs a record id that actually exists for the QA
// account (the placeholder /record/r1 400s → "기록을 찾을 수 없어요"). Resolve
// the account's first real record id via PostgREST (RLS returns only its own
// rows) and rewrite the route.
async function resolveRecordRoute() {
  try {
    const url = envVal(path.join(ENV_DIR, '.env'), 'EXPO_PUBLIC_SUPABASE_URL');
    const anon = envVal(path.join(ENV_DIR, '.env'), 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
    const email = envVal(path.join(ENV_DIR, '.env.test'), 'QA_TEST_EMAIL');
    const password = envVal(path.join(ENV_DIR, '.env.test'), 'QA_TEST_PASSWORD');
    const s = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })).json();
    if (!s.access_token) return;
    const rows = await (await fetch(`${url}/rest/v1/records?select=id&order=created_at.asc&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${s.access_token}` },
    })).json();
    if (Array.isArray(rows) && rows[0]?.id) {
      MAP['12-record'] = `/record/${rows[0].id}`;
      console.log(`✓ 12-record → real QA record ${rows[0].id}`);
    }
  } catch (e) { console.log('record-id resolve skipped:', e.message); }
}

async function realLogin(ctx) {
  const email = envVal(path.join(ENV_DIR, '.env.test'), 'QA_TEST_EMAIL');
  const password = envVal(path.join(ENV_DIR, '.env.test'), 'QA_TEST_PASSWORD');
  if (!email || !password) throw new Error('QA creds missing in .env.test');
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${PORT}${BASE}/sign-in`, { waitUntil: 'networkidle', timeout: 45000 });
  await passIntro(page);
  // one-touch reveal: 이메일로 계속하기 → email/password fields appear
  await page.getByRole('button', { name: '이메일로 계속하기' }).click({ timeout: 15000 });
  await page.locator('input[placeholder="email@example.com"]').fill(email);
  await page.locator('input[placeholder="••••••••"]').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  // authenticated redirect away from /sign-in
  await page.waitForURL((u) => !u.pathname.includes('/sign-in'), { timeout: 45000 });
  await page.waitForTimeout(WAIT_MS); // let AuthContext finish the profile probe
  const landed = page.url();
  await page.close();
  return { landed, errors: errors.slice(0, 8) };
}

async function main() {
  if (!existsSync(DIST)) { console.error(`no dist at ${DIST} — build first (see header)`); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  const { chromium } = resolvePlaywright();
  await resolveRecordRoute();
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH }, deviceScaleFactor: 2, locale: 'ko-KR',
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('2nd-brain:locale', 'ko'); } catch {} });

  let login;
  try {
    login = await realLogin(ctx);
    console.log(`✓ real login OK → ${login.landed}`);
  } catch (e) {
    console.error('✗ real login FAILED:', e.message);
    await browser.close(); server.close();
    writeFileSync(path.join(OUT, '..', 'live-pass-report.json'),
      JSON.stringify({ login: { ok: false, error: e.message } }, null, 2));
    process.exit(2);
  }

  const report = { login: { ok: true, landed: login.landed, consoleErrors: login.errors }, routes: [] };
  for (const [name, route] of Object.entries(MAP)) {
    if (only && !only.includes(name) && !only.includes(route)) continue;
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const url = `http://localhost:${PORT}${BASE}${route}`;
    let navError = null;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    } catch (e) { navError = e.message.split('\n')[0]; }
    await passIntro(page);
    await page.waitForTimeout(WAIT_MS);
    const finalUrl = page.url();
    const gated = /\/sign-in/.test(finalUrl);
    const shot = path.join(OUT, name + '.png');
    await page.screenshot({ path: shot });
    report.routes.push({
      name, route, finalUrl, status: gated ? 'redirected' : navError ? 'error' : 'captured',
      navError, consoleErrors: errors.slice(0, 6),
    });
    console.log(`${gated ? '⛔ redirect' : navError ? '✗ error   ' : '✓ captured'} ${name} -> ${route}${gated ? ' (→ sign-in)' : ''} ${errors.length ? `(${errors.length} console err)` : ''}`);
    await page.close();
  }
  await browser.close();
  server.close();
  writeFileSync(path.join(OUT, '..', 'live-pass-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${report.routes.length} live captures to ${OUT}`);
}
main();
