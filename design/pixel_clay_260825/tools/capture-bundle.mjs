#!/usr/bin/env node
/**
 * capture-bundle.mjs — 레퍼런스 번들(app-offline.html)에서 화면·토큰·구조를 한 패스로 뜬다.
 *
 * 왜 이게 필요한가: "레퍼런스를 최대한 따라간다" 는 지시는, 레퍼런스가 무엇인지를
 * 기계가 읽을 수 있는 형태로 저장소에 있어야만 판정 가능한 요구가 된다. 사람이
 * 10MB HTML 을 열어보는 것은 매번 다른 눈금이다.
 *
 * design/proto_rev2/tools/capture-proto.mjs 의 포크다. 결정성 장치(고정 시각·LCG
 * 재시드·애니메이션 정지·게이트 선설정)를 그대로 물려받고 세 가지만 바꿨다:
 *   1) SPEC 을 새 번들의 라우터(93 case) 기준 목록으로 교체 — port 대상만 찍는다.
 *   2) 게이트 키가 다르다(sb_onboarded/sb_coach/sb_opening/sb_route/sb_wiki_tour).
 *   3) 같은 패스에서 **토큰과 구조 다이제스트**를 함께 뽑는다.
 *
 * ⚠ 토큰은 CSS 텍스트가 아니라 런타임 getComputedStyle 에서 뜬다. 번들의
 * 스타일시트는 :root 를 세 번(기본·미디어쿼리·꼬리) 정의하고 마지막이 이기는데,
 * 정규식 추출기는 그 순서를 못 읽어 --u 를 4px 로 잘못 뽑는다(실측). 화면이 실제로
 * 쓰는 값만이 레퍼런스다.
 *
 * 실행 (번들은 file:// 로 열면 localStorage origin 이 없어 게이트를 못 심는다):
 *   npx http-server design/pixel_clay_260825 -p 8971 -s &
 *   BASE_URL=http://localhost:8971 node design/pixel_clay_260825/tools/capture-bundle.mjs
 *
 * Env: BASE_URL(필수) · OUT(기본 design/pixel_clay_260825) · SCREENS(쉼표 id 한정)
 *      PW_PATH(Playwright 모듈 경로)
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const PW_PATH = process.env.PW_PATH || 'C:/Users/202502/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW_PATH);

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error('BASE_URL required (serve design/pixel_clay_260825 over http)');
  process.exit(1);
}
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const OUT = process.env.OUT || ROOT;
const FIXED_TIME = new Date('2026-08-25T12:34:00+09:00').getTime();

// 이식 대상은 매니페스트가 정한다 — 캡처 목록을 코드에 두 벌로 적지 않는다.
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'screens.json'), 'utf8'));
const only = process.env.SCREENS ? process.env.SCREENS.split(',').map((s) => s.trim()) : null;
const SHOTS = manifest.screens
  .filter((s) => s.capture !== false)
  .filter((s) => (only ? only.includes(s.id) : true));

mkdirSync(path.join(OUT, 'captures'), { recursive: true });
mkdirSync(path.join(OUT, 'data', 'structure'), { recursive: true });

const report = { baseUrl: BASE_URL, capturedAt: null, consoleErrors: [], pageErrors: [], shots: [] };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  // 창을 폰 폭으로 준다. 번들의 --u 반응형 블록은 꼬리 재정의에 지므로 창 크기가
  // 값을 바꾸지는 않지만(실측), 레이아웃 미디어쿼리는 창을 본다.
  viewport: { width: 430, height: 900 },
  deviceScaleFactor: 1,
});
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
    // 게이트를 미리 닫는다. sb_notice_read 는 배열이어야 한다 — 스칼라를 넣으면
    // 공지 센터가 .includes 에서 죽는다.
    localStorage.setItem('sb_opening', '1');
    localStorage.setItem('sb_onboarded', '1');
    localStorage.setItem('sb_coach', '1');
    localStorage.setItem('sb_wiki_tour', '1');
    localStorage.setItem('sb_notice_read', '[]');
    localStorage.setItem('sb_route', JSON.stringify({ root: 'home', stack: [], param: null }));
  } catch (e) {}
})();`);

const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 400));
});
page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 400)));

await page.goto(BASE_URL + '/app-offline.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForSelector('[data-phone-frame]', { timeout: 60000 });
await page.waitForTimeout(2000);
await page.addStyleTag({
  content: '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }',
});

// ── (b) 토큰: 런타임 값만. 화면이 실제로 쓰는 것이 레퍼런스다. ────────────────
const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (let i = 0; i < cs.length; i += 1) {
    const name = cs[i];
    if (name.startsWith('--')) out[name] = cs.getPropertyValue(name).trim();
  }
  return {
    palette: document.documentElement.getAttribute('data-palette'),
    themeClass: document.documentElement.className,
    vars: out,
  };
});
writeFileSync(
  path.join(OUT, 'data', 'tokens.json'),
  JSON.stringify({ note: 'runtime getComputedStyle on :root — NOT parsed from CSS text', ...tokens }, null, 2) + '\n',
);

// ── 화면 순회: 캡처 + (c) 구조 다이제스트 + (d) 네비 엣지 ────────────────────
const nav = {};
for (const screen of SHOTS) {
  const { id, param = null } = screen;
  try {
    await page.evaluate(([t, p]) => window.__sb.jump(t, p), [id, param]);
    await page.waitForTimeout(700);
    const frame = await page.$('[data-phone-frame]');
    if (!frame) throw new Error('no phone frame');
    await frame.screenshot({ path: path.join(OUT, 'captures', `${id}.png`) });

    const digest = await page.evaluate(() => {
      const root = document.querySelector('[data-phone-frame]');
      if (!root) return null;
      const walk = (el, depth) => {
        if (depth > 6) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return null;
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .filter(Boolean)
          .join(' ');
        const kids = [...el.children].map((c) => walk(c, depth + 1)).filter(Boolean);
        if (!own && kids.length === 0) return null;
        return {
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3),
          box: [Math.round(r.width), Math.round(r.height)],
          ...(own ? { text: own.slice(0, 120) } : {}),
          ...(kids.length ? { kids } : {}),
        };
      };
      return walk(root, 0);
    });
    writeFileSync(
      path.join(OUT, 'data', 'structure', `${id}.json`),
      JSON.stringify(digest, null, 1) + '\n',
    );

    const edges = await page.evaluate(() => {
      const root = document.querySelector('[data-phone-frame]');
      if (!root) return [];
      return [...root.querySelectorAll('[role="button"], button, [data-nav]')]
        .map((el) => (el.textContent || '').trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 40);
    });
    nav[id] = edges;

    report.shots.push({ id, ok: true });
    process.stdout.write(id + ' ');
  } catch (e) {
    report.shots.push({ id, ok: false, error: String(e).slice(0, 300) });
    process.stdout.write(id + '(FAIL) ');
  }
}
process.stdout.write('\n');

writeFileSync(path.join(OUT, 'data', 'nav.json'), JSON.stringify(nav, null, 1) + '\n');
report.capturedAt = new Date(FIXED_TIME).toISOString();
writeFileSync(path.join(OUT, 'data', 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');

await browser.close();
const failed = report.shots.filter((s) => !s.ok);
console.log(
  `captured ${report.shots.length - failed.length}/${report.shots.length}` +
    (failed.length ? ` — FAILED: ${failed.map((f) => f.id).join(',')}` : '') +
    ` · console errors ${report.consoleErrors.length}`,
);
process.exit(failed.length ? 1 : 0);
