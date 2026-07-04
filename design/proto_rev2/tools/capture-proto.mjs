#!/usr/bin/env node
/**
 * capture-proto.mjs — deterministic screen captures of the proto_rev2 reference app.
 *
 * Serves nothing itself: point BASE_URL at a running http server for a
 * reference-app directory, and this script drives window.__sb.jump()/overlay()
 * (the prototype's debug nav) to shoot every spec screen as a PNG of the
 * [data-phone-frame] element.
 *
 * Determinism measures (so two builds can be pixel-compared):
 *   - Date frozen (FIXED_TIME) → status-bar clock identical
 *   - Math.random reseeded LCG → blink/job timings identical
 *   - CSS animations/transitions force-disabled after settle
 *   - onboarding/ttfv/coach localStorage gates pre-set (except overlay shots)
 *
 * Usage:
 *   BASE_URL=http://localhost:8031 OUT=shots/original node tools/capture-proto.mjs
 * Env:
 *   BASE_URL (required) · OUT (default ./proto-shots) · SCREENS (comma ids override)
 *   PW_PATH  Playwright module dir (default: global npm playwright)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const PW_PATH = process.env.PW_PATH || 'C:/Users/202502/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW_PATH);

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) { console.error('BASE_URL required'); process.exit(1); }
const OUT = process.env.OUT || 'proto-shots';
const FIXED_TIME = new Date('2026-07-04T12:34:00+09:00').getTime();

// 37 spec screens (docs/Screen-Spec/captures order). kind: jump | overlay
const SPEC = [
  ['01-auth', 'jump', 'auth'],
  ['02-onboard', 'overlay', 'onboard'],
  ['03-ttfv', 'overlay', 'ttfv'],
  ['04-coach', 'overlay', 'coach'],
  ['05-home', 'jump', 'home'],
  ['06-capture', 'jump', 'capture'],
  ['07-chat', 'jump', 'chat'],
  ['08-records', 'jump', 'records'],
  ['09-settings', 'jump', 'settings'],
  ['10-me', 'jump', 'me'],
  ['11-star', 'jump', 'star', { id: 'career', domain: '커리어', level: 3 }],
  ['12-record', 'jump', 'record'],
  ['13-interview', 'jump', 'interview'],
  ['14-bigfive', 'jump', 'bigfive'],
  ['15-attachment', 'jump', 'attachment'],
  ['16-values', 'jump', 'values'],
  ['17-audit', 'jump', 'audit'],
  ['18-trend', 'jump', 'trend'],
  ['19-motivation', 'jump', 'motivation'],
  ['20-strengths', 'jump', 'strengths'],
  ['21-northstar', 'jump', 'northstar'],
  ['22-ratify', 'jump', 'ratify'],
  ['23-iden', 'jump', 'iden'],
  ['24-ops', 'jump', 'ops'],
  ['25-focus', 'jump', 'focus'],
  ['26-reminders', 'jump', 'reminders'],
  ['27-inbox', 'jump', 'inbox'],
  ['28-connect', 'jump', 'connect'],
  ['29-import', 'jump', 'import'],
  ['30-datareview', 'jump', 'datareview'],
  ['31-callrec', 'jump', 'callrec'],
  ['32-share', 'jump', 'share'],
  ['33-plans', 'jump', 'plans'],
  ['34-museum', 'jump', 'museum'],
  ['35-exhibit', 'jump', 'exhibit'],
  ['36-imagine', 'jump', 'imagine'],
  ['37-widget', 'jump', 'widget'],
];
// registered screens NOT in the 37-shot spec — EXTRA=1 appends them so every
// screens.json entry gets regression coverage (param screens jump with null).
const EXTRA = [
  'peer', 'triage', 'research', 'pwreset', 'profilesetup', 'dobgate', 'permissions',
  'privacy', 'support', 'audit-full', 'domains', 'lifeinput', 'hobbyinput',
  'healthinput', 'careerinput', 'drilldown', 'relcontacts', 'relperson',
  'healthdata', 'manual', 'journal', 'reward', 'digest',
].map((id) => ['x-' + id, 'jump', id]);

const ALL = process.env.EXTRA ? SPEC.concat(EXTRA) : SPEC;
const only = process.env.SCREENS ? process.env.SCREENS.split(',').map((s) => s.trim()) : null;
const SHOTS = only ? ALL.filter(([n]) => only.some((o) => n.includes(o))) : ALL;

mkdirSync(OUT, { recursive: true });
const report = { baseUrl: BASE_URL, consoleErrors: [], pageErrors: [], shots: [] };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 950 }, deviceScaleFactor: 1 });
await ctx.addInitScript(`(function () {
  var FIXED = ${FIXED_TIME};
  var RealDate = Date;
  var FakeDate = function (a, b, c, d, e, f, g) {
    if (!(this instanceof FakeDate)) return new RealDate(FIXED).toString();
    switch (arguments.length) {
      case 0: return new RealDate(FIXED);
      case 1: return new RealDate(a);
      default: return new RealDate(a, b, c, d || 0, e || 0, f || 0, g || 0);
    }
  };
  FakeDate.now = function () { return FIXED; };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  window.Date = FakeDate;
  var seed = 42;
  Math.random = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  try {
    localStorage.setItem('sb_onboarded', '1');
    localStorage.setItem('sb_ttfv', '1');
    localStorage.setItem('sb_coach', '1');
    localStorage.setItem('sb_route', JSON.stringify({ root: 'home', stack: [] }));
    localStorage.removeItem('sb_graphlabels');
  } catch (e) {}
})();`);

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 400)); });
page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 400)));

await page.goto(BASE_URL + '/2nd-Brain.html', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[data-phone-frame]', { timeout: 30000 });
await page.waitForTimeout(1500);
// freeze CSS motion for deterministic pixels
await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }' });

for (const [name, kind, target, param] of SHOTS) {
  try {
    if (kind === 'overlay') {
      await page.evaluate((w) => window.__sb.overlay(w), target);
    } else {
      // reset overlay gates in case a previous overlay shot cleared them
      await page.evaluate(() => window.__sb.overlay('none'));
      await page.evaluate(([t, p]) => window.__sb.jump(t, p), [target, param || null]);
    }
    await page.waitForTimeout(900);
    const el = await page.$('[data-phone-frame]');
    await el.screenshot({ path: path.join(OUT, name + '.png') });
    report.shots.push({ name, ok: true });
    process.stdout.write(name + ' ');
  } catch (e) {
    report.shots.push({ name, ok: false, error: String(e).slice(0, 300) });
    process.stdout.write(name + '(FAIL) ');
  }
}
console.log('');
await browser.close();
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('console errors:', report.consoleErrors.length, '| page errors:', report.pageErrors.length);
if (report.pageErrors.length) console.log(report.pageErrors.slice(0, 5).join('\n'));
if (report.consoleErrors.length) console.log(report.consoleErrors.slice(0, 5).join('\n'));
