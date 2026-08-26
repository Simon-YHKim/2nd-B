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

// 규칙 1 을 **화면에서** 센다.
//
// ## 왜 소스 스캔으로는 안 되는가
//
// 소스에서 `<Path` 를 세면 **렌더되지 않는 코드까지 센다.** `capture.tsx` 가
// 정확히 그렇다 — 딥스페이스에서는 `CaptureView` 로 일찍 반환하고 파일의 나머지
// (`CaptureLegacy`, 곡선 16개)는 한 번도 그려지지 않는다. 저장소 기억에 남아 있는
// "UI 감사 함정"(grep 으로 채택률을 세면 틀린다)이 이 이주에서도 그대로 재발했다.
//
// 그래서 실제로 띄워서 DOM 의 <path>/<circle>/<ellipse>/<polyline>/<polygon> 를
// 센다. 사용자가 보는 곡선만 남는다.
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
  sessionStorage.setItem('secondB_intro_played_v1', '1');
});

const rows = [];
for (const route of ROUTES) {
  try {
    await p.goto(BASE + '/2nd-B' + route, { waitUntil: 'load' });
    await p.waitForTimeout(2200);
    const r = await p.evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length;
      const paths = [...document.querySelectorAll('path')].map((n) =>
        (n.getAttribute('d') || '').replace(/\s+/g, ' ').slice(0, 46),
      );
      return {
        path: q('path'),
        circle: q('circle'),
        ellipse: q('ellipse'),
        polyline: q('polyline'),
        polygon: q('polygon'),
        rect: q('rect'),
        samples: [...new Set(paths)].slice(0, 6),
      };
    });
    const curves = r.path + r.circle + r.ellipse + r.polyline + r.polygon;
    rows.push({ route, curves, ...r });
    console.log(`${String(curves).padStart(4)} 곡선  ${String(r.rect).padStart(4)} rect  ${route}`);
  } catch (e) {
    console.log(`  !! ${route}: ${String(e).slice(0, 70)}`);
  }
}
await b.close();

rows.sort((a, b2) => b2.curves - a.curves);
writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8');
const total = rows.reduce((a, r) => a + r.curves, 0);
console.log(`\n화면에 실제로 그려지는 곡선 합계 ${total} · 라우트 ${rows.length}`);
console.log('가장 많은 곳:');
for (const r of rows.slice(0, 12)) console.log(`  ${String(r.curves).padStart(4)} ${r.route}`);
