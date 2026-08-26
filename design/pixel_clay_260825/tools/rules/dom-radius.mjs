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

// 규칙 2(라운드 0)·3(블러 금지)을 **화면에서** 센다.
// 소스 가드는 이식 목록(108파일)만 보는 래칫이라, 화면 전체가 어디인지는 이걸로만 안다.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2];
const OUT = process.argv[3];
const ROUTES = JSON.parse(readFileSync(process.argv[4], 'utf8'));

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

const rows = [];
for (const route of ROUTES) {
  try {
    await p.goto(BASE + '/2nd-B' + route, { waitUntil: 'load' });
    await p.waitForTimeout(1600);
    const r = await p.evaluate(() => {
      let round = 0;
      let blur = 0;
      const vals = {};
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        for (const k of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) {
          const v = parseFloat(cs[k]);
          if (v > 0) {
            round += 1;
            vals[cs[k]] = (vals[cs[k]] ?? 0) + 1;
            break;
          }
        }
        if ((cs.filter && /blur\(/.test(cs.filter)) || (cs.backdropFilter && /blur\(/.test(cs.backdropFilter))) blur += 1;
        if (cs.textShadow && cs.textShadow !== 'none') blur += 0;
      }
      return { round, blur, vals };
    });
    rows.push({ route, ...r });
    console.log(`${String(r.round).padStart(4)} 라운드  ${String(r.blur).padStart(3)} 블러  ${route}`);
  } catch (e) {
    console.log('  !! ' + route);
  }
}
await b.close();
writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8');
const round = rows.reduce((a, r) => a + r.round, 0);
const blur = rows.reduce((a, r) => a + r.blur, 0);
console.log(`\n라운드 ${round} · 블러 ${blur} · 라우트 ${rows.length}`);
const hist = {};
for (const r of rows) for (const [k, n] of Object.entries(r.vals)) hist[k] = (hist[k] ?? 0) + n;
console.log('라운드 값 상위:');
for (const [k, n] of Object.entries(hist).sort((a, c) => c[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(4)} ${k}`);
console.log('라운드 0인 라우트:', rows.filter((r) => r.round === 0).length, '/', rows.length);
