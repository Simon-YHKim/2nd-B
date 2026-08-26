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

// 규칙 4(정적 불투명도 금지)를 **화면에서** 센다.
//
// 규칙 1 을 그렇게 셌더니 소스 스캔과 2.6배 어긋났다. 같은 자로 규칙 4 도 잰다.
//
// 무엇을 세는가: 실제로 렌더된 원소 중
//   · 계산된 `opacity` 가 1 도 0 도 아닌 것 (반투명하게 겹쳐 그려지는 것)
//   · 배경/글자/테두리 색이 `rgba(…, a<1)` 인 것
//   · SVG 의 `fill-opacity`/`stroke-opacity` 가 1 미만인 것
//
// ⚠ `opacity: 0` 은 세지 않는다 — 그건 "안 보이게 두는 것"이지 반투명이 아니다.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2];
const OUT = process.argv[3];
const ROUTES = JSON.parse(readFileSync(process.argv[4], 'utf8'));

const env = readFileSync('.env.test', 'utf8');
const EMAIL = /QA_TEST_EMAIL\s*=\s*(.+)/.exec(env)[1].trim();
const PASS = /QA_TEST_PASSWORD\s*=\s*(.+)/.exec(env)[1].trim();

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

await p.goto(BASE + '/2nd-B/', { waitUntil: 'load' });
await p.waitForTimeout(2500);
await p.evaluate(() => sessionStorage.setItem('secondB_intro_played_v1', '1'));
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(2500);
if (await p.locator('input[type="email"]').count()) {
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', PASS);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(5000);
}
await p.evaluate(() => {
  const now = new Date(2026, 0, 1).toISOString();
  for (const k of Object.keys(localStorage)) {
    if (k.includes('coachmark') || k.includes('onboarding')) localStorage.setItem(k, now);
  }
  localStorage.setItem('sb_notice_seen', 'n_999');
  localStorage.setItem('onboarding.cosmicPixel.v2.completedAt', now);
  sessionStorage.setItem('secondB_intro_played_v1', '1');
});

const rows = [];
for (const route of ROUTES) {
  try {
    await p.goto(BASE + '/2nd-B' + route, { waitUntil: 'load' });
    await p.waitForTimeout(2000);
    const r = await p.evaluate(() => {
      const isTranslucent = (v) => {
        const m = /rgba?\([^)]*?,\s*([0-9.]+)\s*\)/.exec(v || '');
        return !!m && Number(m[1]) > 0 && Number(m[1]) < 1;
      };
      let elOpacity = 0;
      let rgbaColor = 0;
      let svgOpacity = 0;
      const samples = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const o = Number(cs.opacity);
        if (o > 0 && o < 1) {
          elOpacity += 1;
          if (samples.length < 6) samples.push(`opacity=${cs.opacity} <${el.tagName.toLowerCase()}>`);
        }
        for (const prop of ['backgroundColor', 'color', 'borderTopColor', 'fill', 'stroke']) {
          if (isTranslucent(cs[prop])) {
            rgbaColor += 1;
            if (samples.length < 12) samples.push(`${prop}=${cs[prop]}`);
            break;
          }
        }
        const fo = el.getAttribute && el.getAttribute('fill-opacity');
        const so = el.getAttribute && el.getAttribute('stroke-opacity');
        for (const v of [fo, so]) {
          if (v != null && Number(v) > 0 && Number(v) < 1) svgOpacity += 1;
        }
      }
      return { elOpacity, rgbaColor, svgOpacity, total: document.querySelectorAll('*').length, samples };
    });
    const alpha = r.elOpacity + r.rgbaColor + r.svgOpacity;
    rows.push({ route, alpha, ...r });
    console.log(`${String(alpha).padStart(4)} 반투명  (${r.total} 원소)  ${route}`);
  } catch (e) {
    console.log(`  !! ${route}: ${String(e).slice(0, 70)}`);
  }
}
await b.close();

rows.sort((a, b2) => b2.alpha - a.alpha);
writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8');
const total = rows.reduce((a, r) => a + r.alpha, 0);
console.log(`\n화면에 실제로 반투명하게 그려지는 원소 합계 ${total} · 라우트 ${rows.length}`);
console.log('가장 많은 곳:');
for (const r of rows.slice(0, 10)) console.log(`  ${String(r.alpha).padStart(4)} ${r.route}`);
console.log('\n표본:');
for (const s of (rows[0]?.samples ?? [])) console.log('  ' + s);
