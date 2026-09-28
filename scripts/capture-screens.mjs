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
 * (override with OUT=...). Each entry records the HTTP status, console errors,
 * the final URL (redirect judgement), the visible-text length, and a `blank`
 * verdict.
 *
 * Two things this grew on 2026-09-20, because without them an audit of an
 * auth-gated app measures the sign-in screen 40 times over:
 *
 *   1. It signs in first. Credentials come from `.env.test` (committed QA
 *      account, see CLAUDE.md) or the environment — never from this source.
 *      One sign-in, then every route is captured in that same authenticated
 *      browser context; the session state is never written to disk, because a
 *      Playwright storageState file would put a live access token in a file.
 *   2. It derives the route list from the `src/app` tree instead of a
 *      hand-kept array that drifts. The array had 44 entries against 95
 *      static routes.
 *
 * Signing in changes what this script handles, so two guards sit in front of it:
 *
 *   - The QA credentials are only ever typed into a trusted origin (localhost
 *     or our own Pages host). Any other BASE_URL captures anonymously unless
 *     the caller passes AUTH=1, and TLS errors are only ignored on a local
 *     host or under an explicit INSECURE_TLS=1.
 *   - Signed-in screenshots and the on-screen text they carry only get written
 *     somewhere git will not stage them. An OUT inside the repo must be
 *     git-ignored, or the run refuses before the browser starts.
 *
 * Env overrides:
 *   BASE_URL      live base (default https://simon-yhkim.github.io/2nd-B)
 *   OUT           output dir (default docs/design-audit) — must be git-ignored
 *                 if it lives inside the repo
 *   AUTH          "0" to skip sign-in; "1" to allow it on an untrusted origin
 *   ENV_FILE      credentials file (default .env.test at repo root)
 *   INSECURE_TLS  "1" to ignore cert errors off-localhost (TLS-intercepting CI
 *                 proxy). Refused while signing in to an untrusted origin.
 *   PW_PATH       Playwright module path (auto-detected otherwise)
 *   PW_CHROME     Chromium executable (auto-detected otherwise)
 *   ROUTES        comma-separated route override (default: derived from src/app)
 *   APP_DIR       route-tree root (default src/app)
 *   DYNAMIC       "1" to also capture dynamic routes with placeholder params
 *   CONCURRENCY   pages captured in parallel (default 2)
 *   VIEWPORT      "WxH" (default 390x844, phone-first)
 *   WAIT_MS       extra settle wait after the app mounts (default 4000)
 *   MOUNT_TIMEOUT how long to wait for the boot splash to give way (default
 *                 45000) — a route still on it is reported as `stuckLoading`
 *   NAV_TIMEOUT   per-route navigation budget in ms (default 90000)
 *
 * No new npm dependency: the pinned playwright-core devDependency (the same one
 * design/pixel_clay_260825/tools/score.mjs uses) drives whatever Chromium the
 * environment provides (PW_CHROME, or the Playwright-managed download).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const BASE_URL = (process.env.BASE_URL || 'https://simon-yhkim.github.io/2nd-B').replace(/\/$/, '');
const BASE_PATH = basePathOf(BASE_URL);
const OUT = path.resolve(process.env.OUT || 'docs/design-audit');
const APP_DIR = process.env.APP_DIR || 'src/app';
const ENV_FILE = process.env.ENV_FILE || '.env.test';
const WAIT_MS = Number(process.env.WAIT_MS || 4000);
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT || 90000);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 2));
const WANT_DYNAMIC = process.env.DYNAMIC === '1';
const [VW, VH] = (process.env.VIEWPORT || '390x844').split('x').map(Number);

// Hosts the QA password may be typed into. Everything else is a stranger's
// login form until the caller says otherwise with AUTH=1.
const TRUSTED_AUTH_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'simon-yhkim.github.io']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function hostOf(base) {
  try {
    return new URL(base).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

const BASE_HOST = hostOf(BASE_URL);
const IS_LOCAL = LOCAL_HOSTS.has(BASE_HOST);
const IS_TRUSTED = TRUSTED_AUTH_HOSTS.has(BASE_HOST);
// Only a local host gets cert errors waved through by default; anywhere else
// the caller has to say so, and never while carrying credentials (see main()).
const IGNORE_TLS = IS_LOCAL || process.env.INSECURE_TLS === '1';
const WANT_AUTH = process.env.AUTH === '0' ? false : IS_TRUSTED || process.env.AUTH === '1';

/** Shown in logs instead of the address itself. */
function maskEmail(address) {
  const [local = '', domain = ''] = address.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/**
 * Refuse to write signed-in screenshots and on-screen text somewhere `git add`
 * would pick them up. An OUT outside the working tree is fine; inside it, the
 * path has to be git-ignored.
 */
function assertOutIsSafe(dir) {
  let top;
  try {
    top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return; // not a git work tree — nothing here can be committed by accident
  }
  const root = path.resolve(top);
  const rel = path.relative(root, dir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return; // outside the repo
  // Every kind of file the run writes, because an ignore rule can cover the
  // reports and still leave the screenshots tracked.
  const exposed = ['report.json', 'report.md', 'index.png'].filter((name) => {
    try {
      execFileSync('git', ['check-ignore', '--no-index', '-q', '--', path.join(dir, name)], {
        cwd: root,
        stdio: 'ignore',
      });
      return false;
    } catch {
      return true;
    }
  });
  if (exposed.length) {
    throw new Error(
      `Refusing to write to OUT=${dir}: it is inside the repo and git does not ignore ` +
        `${exposed.join(', ')} there, so a later 'git add -A' would commit signed-in ` +
        `screenshots and the text on them. Use Output/... or docs/design-audit/..., ` +
        `or a path outside the repo.`,
    );
  }
}

// Placeholder params for dynamic routes, used only when DYNAMIC=1. They are
// deliberately obvious non-ids: the point is to see the screen's empty/error
// state render, not to fetch a real row.
const DYNAMIC_SAMPLE = 'sample';

function basePathOf(base) {
  try {
    return new URL(base).pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ routes */

/**
 * Walk the Expo Router tree and return every statically navigable route.
 *
 * Expo Router conventions honored here: `(group)` directories do not appear in
 * the URL, `index` maps to its parent path, `_layout` / `+html` / `+not-found`
 * are not routes, and `[param]` segments are dynamic.
 */
function discoverRoutes(appDir) {
  const root = path.resolve(appDir);
  const statics = [];
  const dynamics = [];
  const skipped = [];
  if (!existsSync(root)) return { statics, dynamics, skipped };

  const walk = (dir, segments) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name.startsWith('.')) continue;
        // A (group) directory is a layout grouping, not a URL segment.
        const isGroup = /^\(.+\)$/.test(entry.name);
        walk(full, isGroup ? segments : [...segments, entry.name]);
        continue;
      }
      if (!/\.(tsx|jsx|ts|js)$/.test(entry.name)) continue;
      if (/\.(test|spec|d)\.(tsx|jsx|ts|js)$/.test(entry.name)) continue;
      const stem = entry.name.replace(/\.(tsx|jsx|ts|js)$/, '');
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (stem.startsWith('_') || stem.startsWith('+')) {
        skipped.push({ file: rel, reason: stem.startsWith('_') ? 'layout' : 'special' });
        continue;
      }
      const parts = stem === 'index' ? segments : [...segments, stem];
      const route = parts.length ? `/${parts.join('/')}` : '/';
      const params = parts.filter((p) => /^\[.+\]$/.test(p));
      if (params.length) dynamics.push({ route, file: rel, params });
      else statics.push({ route, file: rel });
    }
  };
  walk(root, []);
  statics.sort((a, b) => a.route.localeCompare(b.route));
  dynamics.sort((a, b) => a.route.localeCompare(b.route));
  return { statics, dynamics, skipped };
}

/* ------------------------------------------------------------ credentials */

/** Minimal dotenv reader — no new dependency, and it never logs a value. */
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function resolveCredentials() {
  const fileEnv = readEnvFile(path.resolve(ENV_FILE));
  const email = process.env.QA_TEST_EMAIL || fileEnv.QA_TEST_EMAIL || '';
  const password = process.env.QA_TEST_PASSWORD || fileEnv.QA_TEST_PASSWORD || '';
  return email && password ? { email, password } : null;
}

/**
 * The sign-in submit button is labelled by i18n, and the app may be serving any
 * of the shipped locales. Read every locale's label rather than guessing one.
 */
function submitLabels() {
  const labels = new Set();
  const dir = path.resolve('locales');
  if (existsSync(dir)) {
    for (const locale of readdirSync(dir)) {
      const file = path.join(dir, locale, 'auth.json');
      if (!existsSync(file)) continue;
      try {
        const label = JSON.parse(readFileSync(file, 'utf8'))?.signIn?.submit;
        if (typeof label === 'string' && label) labels.add(label);
      } catch {
        /* a malformed locale is C7's problem, not this script's */
      }
    }
  }
  if (!labels.size) labels.add('Sign in');
  return [...labels];
}

/* ------------------------------------------------------------------ driver */

function resolvePlaywright() {
  const candidates = [
    process.env.PW_PATH,
    'playwright-core', // pinned devDependency (score.mjs resolves the same module)
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
    'Playwright not found. Set PW_PATH=/path/to/playwright(-core) or run `npm ci --legacy-peer-deps`.',
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
  return route.replace(/^\//, '').replace(/[/[\]]/g, '_');
}

/** Path of the current page, with the base prefix stripped so it compares to a route. */
function pathOf(href) {
  try {
    const p = new URL(href).pathname;
    const stripped = BASE_PATH && p.startsWith(BASE_PATH) ? p.slice(BASE_PATH.length) : p;
    return stripped.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

/**
 * Wait for the SPA to actually mount, and report how long that took.
 *
 * `networkidle` is not usable against the Expo dev server — the HMR websocket
 * keeps a connection open. Waiting for `#root` to have children is not usable
 * either, and that mistake cost a whole run on 2026-09-20: the authenticated
 * shell paints a splash (starfield + mascot, no text) under `#root` within a
 * few hundred ms and only swaps in the real screen ~10s later, so every
 * signed-in route was screenshotted as the splash and scored "ok, not blank"
 * because the splash art counts as drawn media. The condition has to be
 * content the *user* would call a screen.
 */
const MOUNT_TIMEOUT = Number(process.env.MOUNT_TIMEOUT || 45000);
// How long the screen has to keep its content before it counts as mounted.
const MOUNT_STABLE_MS = Number(process.env.MOUNT_STABLE_MS || 2500);
// What the shell shows before the real screen arrives.
const BOOT_PLACEHOLDERS = ['', 'Loading', 'Loading…', 'Loading...'];

/**
 * A single "there is text now" sample is not enough. `web.output: "static"`
 * means the dev server ships a server-rendered screen, hydration throws it
 * away for the splash, and only then does the real screen arrive — so a route
 * reads as mounted at ~500ms, empty at 2.5s, and mounted again at ~10s.
 * Content therefore has to *hold* for MOUNT_STABLE_MS before it counts.
 */
async function settle(page) {
  const started = Date.now();
  const deadline = started + MOUNT_TIMEOUT;
  let heldSince = null;
  let mounted = false;
  while (Date.now() < deadline) {
    let real = false;
    try {
      real = await page.evaluate((placeholders) => {
        const root = document.getElementById('root');
        if (!root || root.childElementCount === 0) return false;
        const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        return !placeholders.includes(text);
      }, BOOT_PLACEHOLDERS);
    } catch {
      break; // navigating or closing — let the caller record what it can
    }
    if (!real) {
      heldSince = null;
    } else {
      heldSince ??= Date.now();
      if (Date.now() - heldSince >= MOUNT_STABLE_MS) {
        mounted = true;
        break;
      }
    }
    await page.waitForTimeout(500);
  }
  const mountMs = Date.now() - started;
  await page.waitForTimeout(WAIT_MS);
  return { mounted, mountMs };
}

const PROBE = () => {
  const root = document.getElementById('root');
  const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
  const media = Array.from(document.querySelectorAll('canvas,svg,img,video')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }).length;
  return {
    title: document.title || '',
    textLen: text.length,
    text: text.slice(0, 600),
    media,
    nodes: root ? root.querySelectorAll('*').length : 0,
  };
};

async function signIn(ctx, creds) {
  const result = { attempted: true, ok: false, detail: '', finalPath: '' };
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await settle(page);

    const email = page.locator('input[placeholder="email@example.com"]').first();
    await email.waitFor({ state: 'visible', timeout: 30000 });
    await email.fill(creds.email);

    const password = page.locator('input[type="password"]').first();
    await password.waitFor({ state: 'visible', timeout: 15000 });
    await password.fill(creds.password);

    const labels = submitLabels();
    let clicked = false;
    for (const label of labels) {
      const button = page.locator(`[aria-label="${label.replace(/"/g, '\\"')}"]`).first();
      if (await button.count()) {
        await button.click({ timeout: 15000 });
        clicked = true;
        break;
      }
    }
    // onSubmitEditing on the password field runs the same submit path.
    if (!clicked) await password.press('Enter');

    await page.waitForFunction(
      () => !/\/sign-in\/?$/.test(location.pathname),
      { timeout: 60000 },
    );
    await settle(page);
    result.finalPath = pathOf(page.url());
    // Only the presence of a persisted auth blob is read — never its contents.
    const hasSession = await page.evaluate(() => {
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i) || '';
          if (!/auth/i.test(key)) continue;
          if ((localStorage.getItem(key) || '').includes('access_token')) return true;
        }
      } catch {
        return false;
      }
      return false;
    });
    result.ok = true;
    result.detail = hasSession
      ? `signed in, landed on ${result.finalPath}`
      : `left /sign-in for ${result.finalPath} but no persisted session blob was found`;
    result.sessionPersisted = hasSession;
  } catch (e) {
    result.detail = `sign-in failed: ${e.message.split('\n')[0]}`;
    result.finalPath = pathOf(page.url());
  } finally {
    await page.close();
  }
  return result;
}

// A dev server that restarts mid-run refuses connections for a minute or two.
// Reporting that as 73 broken screens is worse than useless, so a transport
// failure is retried instead of recorded.
const TRANSPORT_FAILURE = /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED/;
const TRANSPORT_RETRIES = 4;
const TRANSPORT_BACKOFF_MS = 15000;

async function capture(ctx, route) {
  let entry = await captureOnce(ctx, route);
  for (let attempt = 1; attempt <= TRANSPORT_RETRIES; attempt += 1) {
    if (entry.status !== 'error' || !entry.errors.some((e) => TRANSPORT_FAILURE.test(e))) break;
    await new Promise((r) => setTimeout(r, TRANSPORT_BACKOFF_MS));
    entry = await captureOnce(ctx, route);
    entry.transportRetries = attempt;
  }
  return entry;
}

async function captureOnce(ctx, route) {
  const url = `${BASE_URL}${route === '/' ? '/' : route}`;
  const page = await ctx.newPage();
  const errors = [];
  const push = (text) => {
    if (errors.length < 25 && !errors.includes(text)) errors.push(text);
  };
  page.on('console', (m) => m.type() === 'error' && push(m.text()));
  page.on('pageerror', (e) => push(`PAGEERROR: ${e.message.split('\n')[0]}`));

  const entry = {
    route,
    url,
    file: null,
    httpStatus: null,
    finalUrl: null,
    finalPath: null,
    redirected: false,
    redirectedToSignIn: false,
    errors,
    errorCount: 0,
    textLen: 0,
    mediaCount: 0,
    nodeCount: 0,
    blank: false,
    stuckLoading: false,
    mountMs: null,
    title: '',
    text: '',
    loadMs: 0,
    transportRetries: 0,
    status: 'ok',
  };

  const started = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    if (resp) entry.httpStatus = resp.status();
    const mount = await settle(page);
    entry.mountMs = mount.mountMs;
    entry.stuckLoading = !mount.mounted;

    entry.finalUrl = page.url();
    entry.finalPath = pathOf(entry.finalUrl);
    entry.redirected = entry.finalPath !== route;
    entry.redirectedToSignIn = entry.finalPath === '/sign-in';

    const file = path.join(OUT, `${slug(route)}.png`);
    await page.screenshot({ path: file, fullPage: false });
    entry.file = path.relative(process.cwd(), file).split(path.sep).join('/');

    const probe = await page.evaluate(PROBE);
    entry.title = probe.title;
    entry.textLen = probe.textLen;
    entry.text = probe.text;
    entry.mediaCount = probe.media;
    entry.nodeCount = probe.nodes;
    // "Blank" means nothing a user could read or look at — a short string plus
    // no drawn media. A constellation screen with no copy is not blank, and a
    // screen still showing the boot splash is `stuckLoading`, not blank.
    entry.blank = !entry.stuckLoading && probe.textLen < 20 && probe.media === 0;

    if (entry.httpStatus !== null && entry.httpStatus >= 400) entry.status = `http-${entry.httpStatus}`;
  } catch (e) {
    entry.status = 'error';
    push(`CAPTURE_FAILED: ${e.message.split('\n')[0]}`);
  }
  entry.loadMs = Date.now() - started;
  entry.errorCount = errors.length;
  await page.close();
  return entry;
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

/* -------------------------------------------------------------------- main */

async function main() {
  const tree = discoverRoutes(APP_DIR);
  const dynamicRoutes = tree.dynamics.map((d) => ({
    ...d,
    sampled: d.route.replace(/\[[^\]]+\]/g, DYNAMIC_SAMPLE),
  }));
  const derived = [
    ...tree.statics.map((s) => s.route),
    ...(WANT_DYNAMIC ? dynamicRoutes.map((d) => d.sampled) : []),
  ];
  const ROUTES = process.env.ROUTES
    ? process.env.ROUTES.split(',').map((r) => r.trim()).filter(Boolean)
    : derived;

  // LIST=1 prints what would be captured and exits, so the route derivation is
  // checkable without a browser or a running server.
  if (process.env.LIST === '1') {
    console.log(ROUTES.join('\n'));
    console.log(
      `\n${tree.statics.length} static · ${dynamicRoutes.length} dynamic (${WANT_DYNAMIC ? 'sampled' : 'excluded'}) · ${tree.skipped.length} non-route files · ${ROUTES.length} to capture`,
    );
    return;
  }

  const chromium = resolvePlaywright();
  const executablePath = resolveChromeExecutable();
  assertOutIsSafe(OUT);
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath, // undefined falls back to Playwright's bundled Chromium
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    isMobile: true,
    // Local hosts, or an explicit INSECURE_TLS=1 for the CI proxy's untrusted CA.
    ignoreHTTPSErrors: IGNORE_TLS,
  });

  const creds = WANT_AUTH ? resolveCredentials() : null;
  const skipReason =
    process.env.AUTH === '0'
      ? 'AUTH=0'
      : !WANT_AUTH
        ? `${BASE_HOST || BASE_URL} is not a trusted sign-in origin — pass AUTH=1 to allow it`
        : 'no credentials found';
  let auth = { attempted: false, ok: false, detail: skipReason };
  if (creds) {
    // Ignoring cert errors means not knowing who is on the other end, which is
    // not a thing to do while typing a password into their form.
    if (!IS_LOCAL && IGNORE_TLS) {
      throw new Error(
        'Refusing to sign in with INSECURE_TLS=1 against a non-local host: ' +
          'the certificate is unverified, so the credentials could go anywhere. ' +
          'Drop INSECURE_TLS, or run with AUTH=0.',
      );
    }
    console.log(`Signing in as ${maskEmail(creds.email)} at ${BASE_URL} ...`);
    auth = await signIn(ctx, creds);
    console.log(`  ${auth.ok ? 'OK' : 'FAILED'} — ${auth.detail}`);
  } else {
    console.log(`Running anonymously (${auth.detail}).`);
  }

  console.log(`Capturing ${ROUTES.length} routes at ${BASE_URL} (concurrency ${CONCURRENCY})\n`);
  let done = 0;
  const report = await runPool(ROUTES, CONCURRENCY, async (route) => {
    const entry = await capture(ctx, route);
    done += 1;
    const tag =
      entry.status !== 'ok'
        ? `[${entry.status}]`
        : entry.redirectedToSignIn
          ? '[->sign-in]'
          : entry.stuckLoading
            ? '[loading]'
            : entry.blank
              ? '[blank]'
            : entry.redirected
              ? '[redirected]'
              : entry.errorCount
                ? `[err:${entry.errorCount}]`
                : '[ok]';
    console.log(
      `${String(done).padStart(3)}/${ROUTES.length} ${tag.padEnd(13)} ${route} -> ${entry.finalPath || '(none)'} (${entry.loadMs}ms)`,
    );
    return entry;
  });

  await ctx.close();
  await browser.close();

  const meta = {
    baseUrl: BASE_URL,
    capturedAt: new Date().toISOString(),
    viewport: { width: VW, height: VH },
    // Mode only — no address, no token, no session state is persisted here.
    auth: { mode: auth.ok ? 'authenticated' : 'anonymous', attempted: auth.attempted, detail: auth.detail },
    routeSource: process.env.ROUTES ? 'ROUTES env override' : `${APP_DIR} tree`,
    counts: {
      captured: report.length,
      staticRoutesFound: tree.statics.length,
      dynamicRoutesFound: dynamicRoutes.length,
      redirected: report.filter((e) => e.redirected).length,
      redirectedToSignIn: report.filter((e) => e.redirectedToSignIn).length,
      withConsoleErrors: report.filter((e) => e.errorCount > 0).length,
      blank: report.filter((e) => e.blank).length,
      stuckLoading: report.filter((e) => e.stuckLoading).length,
      failed: report.filter((e) => e.status === 'error').length,
    },
    excludedDynamic: WANT_DYNAMIC
      ? []
      : dynamicRoutes.map((d) => ({
          route: d.route,
          file: d.file,
          reason: 'dynamic segment needs a real id — rerun with DYNAMIC=1 to sample it',
        })),
    excludedSpecial: tree.skipped,
    screens: report,
  };
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(meta, null, 2));

  const flag = (e) =>
    e.status === 'error'
      ? 'load failed'
      : e.status !== 'ok'
        ? e.status
        : e.redirectedToSignIn
          ? 'to sign-in'
          : e.stuckLoading
            ? 'stuck loading'
            : e.blank
              ? 'blank'
            : e.redirected
              ? `to ${e.finalPath}`
              : 'ok';
  const md = [
    `# Live-link screen capture`,
    ``,
    `- Base: ${BASE_URL}`,
    `- Captured: ${meta.capturedAt}`,
    `- Viewport: ${VW}x${VH} (mobile)`,
    `- Session: ${meta.auth.mode} (${meta.auth.detail})`,
    `- Routes: ${report.length} captured from ${meta.routeSource}`,
    `- Redirected to /sign-in: ${meta.counts.redirectedToSignIn} · console errors: ${meta.counts.withConsoleErrors} · blank: ${meta.counts.blank} · failed: ${meta.counts.failed}`,
    ``,
    `| Route | HTTP | Verdict | Errors | Text | Screenshot |`,
    `|---|---|---|---|---|---|`,
    ...report.map(
      (e) =>
        `| \`${e.route}\` | ${e.httpStatus ?? '—'} | ${flag(e)} | ${e.errorCount} | ${e.textLen} | ${e.file ? `\`${e.file}\`` : '—'} |`,
    ),
    ``,
    ...(meta.excludedDynamic.length
      ? [
          `## Excluded dynamic routes`,
          ``,
          ...meta.excludedDynamic.map((d) => `- \`${d.route}\` (\`${d.file}\`) — ${d.reason}`),
          ``,
        ]
      : []),
    `> Compare each screenshot against \`docs/CONCEPT.md\` (canon vs legacy),`,
    `> \`DESIGN.md\`, and the Visual Tier System + Information Density rules in`,
    `> \`CLAUDE.md\`.`,
    ``,
  ].join('\n');
  writeFileSync(path.join(OUT, 'report.md'), md);

  const c = meta.counts;
  console.log(
    `\nDone. ${c.captured} routes · ${c.failed} failed · ${c.withConsoleErrors} with console errors · ${c.redirectedToSignIn} bounced to /sign-in · ${c.blank} blank.`,
  );
  console.log(`Output: ${path.relative(process.cwd(), OUT).split(path.sep).join('/')}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
