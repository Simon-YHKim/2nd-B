// 이 파일은 `design/pixel_clay_260825/tools/rules/` 에 있다 — PIXEL-CLAY 규칙을
// **화면에서** 재는 자다.
//
// ## 왜 소스를 grep 하지 않는가
//
// 두 번 틀린다.
//   (a) `<Path` 같은 JSX 원소만 세면 문자열 `'<path …>'`(SvgXml 에 넘기는 마크업)를
//       통째로 놓친다 — 2026-08-26 실측에서 320건을 121건으로 세고 있었다.
//   (b) 폴더 이름으로 "딥스페이스 화면"을 판정하면 `src/app/*.tsx` 중
//       `DeepSpaceScreen` 을 렌더하는 것들이 새고, 반대로 레거시 분기
//       (`if (isDeepSpaceUI()) return …` 뒤)는 렌더되지 않는데도 세어진다.
//
// 실제로 띄워서 DOM 을 세면 둘 다 사라진다. 렌더 안 되는 코드는 애초에 안 세어지고,
// 반복해서 깔리는 층은 반복해서 세어진다(별 벽지 하나가 라우트당 116개였다).
//
// ⚠ 개발 전용 라우트(`DevOnlyRoute`)를 목록에 넣지 말 것. 로그인 세션에서는 홈으로
//   리다이렉트되므로 **홈이 두 번 세어진다**(2026-08-26 에 `/trends` 로 실제로 겪었다).
//
// ## 쓰는 법
//
//   npx expo export --platform web --output-dir <dist>     # EXPO_PUBLIC_* 를 전부 넘길 것
//   node <정적 서버로 <dist> 를 /2nd-B 아래 서빙>
//   node design/pixel_clay_260825/tools/rules/<이 파일> <BASE_URL> <out.json> <routes.json>
//
// ⚠ EXPO_PUBLIC_* 를 안 넘기면 앱이 **에러 없이 조용히 mock 으로** 돈다.

// 화면에 실제로 그려지는 반투명 **값**의 빈도. 어디를 먼저 고쳐야 하는지는
// 소스 줄 수가 아니라 이 표가 말해 준다.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2];
const ROUTES = JSON.parse(readFileSync(process.argv[3], 'utf8'));

const env = readFileSync('.env.test', 'utf8');
const EMAIL = /QA_TEST_EMAIL\s*=\s*(.+)/.exec(env)[1].trim();
const PASS = /QA_TEST_PASSWORD\s*=\s*(.+)/.exec(env)[1].trim();

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 820 } });
const p = await ctx.newPage();
await p.goto(BASE + '/2nd-B/', { waitUntil: 'load' });
await p.waitForTimeout(2200);
await p.evaluate(() => sessionStorage.setItem('secondB_intro_played_v1', '1'));
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(2200);
if (await p.locator('input[type="email"]').count()) {
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', PASS);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(5000);
}
await p.evaluate(() => {
  const now = new Date(2026, 0, 1).toISOString();
  localStorage.setItem('onboarding.cosmicPixel.v2.completedAt', now);
  localStorage.setItem('sb_notice_seen', 'n_999');
  sessionStorage.setItem('secondB_intro_played_v1', '1');
});

const hist = new Map();
for (const route of ROUTES) {
  try {
    await p.goto(BASE + '/2nd-B' + route, { waitUntil: 'load' });
    await p.waitForTimeout(1600);
    const found = await p.evaluate(() => {
      const out = [];
      const tr = (v) => /rgba?\([^)]*?,\s*(0?\.\d+)\s*\)/.test(v || '');
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        for (const prop of ['backgroundColor', 'color', 'borderTopColor', 'fill', 'stroke']) {
          const v = cs[prop];
          if (tr(v)) out.push(prop + ' ' + v);
        }
        const o = Number(cs.opacity);
        if (o > 0 && o < 1) out.push('opacity ' + cs.opacity);
      }
      return out;
    });
    for (const f of found) hist.set(f, (hist.get(f) ?? 0) + 1);
  } catch { /* 스킵 */ }
}
await b.close();

const rows = [...hist.entries()].sort((a, c) => c[1] - a[1]);
const total = rows.reduce((a, r) => a + r[1], 0);
console.log('반투명 원소 총', total, '· 서로 다른 값', rows.length, '\n');
for (const [k, n] of rows.slice(0, 26)) console.log(String(n).padStart(4), k);
