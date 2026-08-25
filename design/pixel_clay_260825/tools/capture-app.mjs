#!/usr/bin/env node
/**
 * capture-app.mjs — **앱** 화면을 레퍼런스와 같은 규격으로 찍고, 구조를 대조한다.
 *
 * 키트의 빈 칸을 메운다. capture-bundle.mjs 가 레퍼런스(번들) 93장을 뜨는 도구라면
 * 이쪽은 우리 앱을 같은 눈금(390x820·결정적)으로 떠서 **얼마나 닮았는지**를 숫자로
 * 만든다. 그 전까지 이 저장소가 가진 것은 "레퍼런스가 무엇인지"뿐이었다.
 *
 * ── 이 도구가 밟은 함정 (다시 밟지 말 것) ──────────────────────────────────
 *
 * 1. **baseUrl 이 /2nd-B 다.** dist 를 그냥 서빙하면 에셋이 /2nd-B/assets/... 로
 *    404 나고, http-server 가 HTML 을 돌려줘 "Unexpected token '<'" 만 남는다.
 *    그래서 dist 를 `<root>/2nd-B` 로 두고 그 부모를 서빙한다(정션이면 충분).
 * 2. **`/2nd-B/index.html` 이 아니라 `/2nd-B/`.** 라우터가 .html 경로를 못 알아보고
 *    not-found 를 그린다. 실측으로 확인했다.
 * 3. **env 를 안 넘긴 export 는 조용히 mock 으로 돈다.** Supabase URL·anon key 가
 *    번들에 들어갔는지 확인하고 시작한다(--check-creds 로 강제).
 *
 * 실행:
 *   # 1) export (eas.json preview 의 env 를 그대로 넘긴다)
 *   node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
 *   source /tmp/webenv.sh && npx expo export --platform web --output-dir <dist>
 *   # 2) <root>/2nd-B -> <dist> 로 두고 그 부모를 서빙
 *   # 3) 캡처 + 대조
 *   BASE_URL=http://localhost:8977 DIST=<dist> OUT=<out> \
 *     node design/pixel_clay_260825/tools/capture-app.mjs
 *
 * Env: BASE_URL(필수, /2nd-B 를 서빙하는 루트) · OUT(기본 .app-shots, gitignore)
 *      SCREENS(쉼표 id) · QA_EMAIL/QA_PASSWORD(기본은 .env.test 에서 읽음)
 *      PW_PATH(Playwright 모듈 경로)
 *
 * ⚠ 산출 PNG 는 저장소에 커밋하지 않는다(레퍼런스 93장이 이미 3.4MB). 커밋하는 것은
 * 리포트 JSON 하나뿐이고, 그것도 기본 경로는 OUT 아래다 — 필요할 때만 옮긴다.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, '..');
const REPO = path.join(KIT, '..', '..');

// --print-env: eas.json preview 프로필의 값을 셸에 그대로 흘린다. 이 값들이 없으면
// export 는 성공하는데 앱이 mock 으로 돈다 — 실패가 아니라 침묵이라 더 나쁘다.
if (process.argv.includes('--print-env')) {
  const eas = JSON.parse(readFileSync(path.join(REPO, 'eas.json'), 'utf8'));
  const env = eas.build?.preview?.env ?? {};
  const wanted = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
  const lines = wanted
    .filter((k) => env[k])
    .map((k) => `export ${k}="${env[k]}"`)
    .concat(['export EXPO_PUBLIC_UI=deep-space', 'export EXPO_PUBLIC_ALLOW_DEV_TIER=true']);
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error('BASE_URL required — serve the PARENT of a directory named 2nd-B');
  process.exit(1);
}
const OUT = process.env.OUT || path.join(REPO, '.app-shots');
const PW_PATH = process.env.PW_PATH || 'C:/Users/202502/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW_PATH);

// QA 계정: 커밋된 .env.test 가 정본(CLAUDE.md — 새로 만들지 말 것).
function qaCreds() {
  if (process.env.QA_EMAIL && process.env.QA_PASSWORD) {
    return { email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD };
  }
  const raw = readFileSync(path.join(REPO, '.env.test'), 'utf8');
  const get = (k) => (raw.match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [])[1]?.trim();
  return { email: get('QA_TEST_EMAIL'), password: get('QA_TEST_PASSWORD') };
}

// 화면 목록은 키트의 매니페스트 + 앱 라우트 매핑. 매핑이 없는 번들 화면은 아직
// 대조 대상이 아니다(앱에 대응 화면이 없거나 id 가 다른 것).
const manifest = JSON.parse(readFileSync(path.join(KIT, 'data', 'screens.json'), 'utf8'));
const mapPath = path.join(KIT, 'data', 'app-routes.json');
const routeMap = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')).routes : {};
const only = process.env.SCREENS ? process.env.SCREENS.split(',').map((s) => s.trim()) : null;
const TARGETS = manifest.screens
  .filter((s) => s.port === true && routeMap[s.id])
  .filter((s) => (only ? only.includes(s.id) : true));

if (TARGETS.length === 0) {
  console.error('no targets — data/app-routes.json 에 번들 id -> 앱 경로 매핑이 필요하다');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, 'structure'), { recursive: true });

// ⚠ 시각을 고정하면 **로그인이 조용히 깨진다.** Supabase 세션 토큰의 만료를
// Date.now() 로 재는데, 고정 시각이 발급 시점보다 뒤면 토큰이 이미 만료된 것으로
// 보여 매 화면이 로그인 월로 튕긴다(실측: 여섯 화면이 전부 sign-in 으로 찍혔다).
// 그래서 기본값은 '지금'이다 — 한 번의 실행 안에서는 고정이라 화면 사이 시각
// 흔들림은 없고, 실행 사이 픽셀 동일이 필요하면 FIXED_ISO 로 과거 시각을 준다
// (그때는 로그인이 안 되므로 세션을 미리 넣어야 한다).
const FIXED_TIME = process.env.FIXED_ISO ? new Date(process.env.FIXED_ISO).getTime() : Date.now();
const report = { baseUrl: BASE_URL, shots: [], consoleErrors: [], compare: [] };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 1 });
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
    // 온보딩·코치마크는 클릭으로 넘기지 않는다(안 먹는 경우가 있다) — 저장 키로 연다.
    localStorage.setItem('secondB_intro_played_v1', '1');
    localStorage.setItem('sb_onboarded', '1');
  } catch (e) {}
})();`);

const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
});

const { email, password } = qaCreds();
await page.goto(`${BASE_URL}/2nd-B/`, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(2500);

// 로그인 월이면 QA 계정으로 통과한다. 이미 세션이 있으면 그냥 지나간다.
if (page.url().includes('/sign-in')) {
  await page.getByRole('textbox', { name: /이메일|email/i }).fill(email);
  await page.getByRole('textbox', { name: /비밀번호|password/i }).fill(password);
  await page.locator('button:has-text("로그인"), button:has-text("Sign in")').first().click();
  await page.waitForTimeout(5000);
}
// 로그인이 됐는지 **확인하고 넘어간다.** 안 되면 모든 화면이 같은 로그인 월로
// 찍히는데, 캡처는 6/6 성공으로 보이고 대조 수치만 0% 가 된다 — 가장 오래 헤매게
// 만드는 실패 모양이라 여기서 크게 실패시킨다.
if (page.url().includes('/sign-in')) {
  console.error('FAIL: still on /sign-in after login — creds or clock. 캡처를 중단한다.');
  await browser.close();
  process.exit(2);
}
/** 온보딩을 끝까지 밀어낸다. 건너뛰기가 없으면 '다음'을 눌러 마지막까지 간다. */
async function passOnboarding(p) {
  for (let i = 0; i < 8; i += 1) {
    if (!p.url().includes('/onboarding')) return;
    let clicked = false;
    for (const label of ['건너뛰기', 'Skip', '시작하기', 'Get started', '다음', 'Next']) {
      const el = p.locator(`text=${label}`).first();
      if ((await el.count()) > 0) {
        try {
          await el.click({ timeout: 3000 });
          clicked = true;
        } catch {
          /* 다음 라벨로 */
        }
        if (clicked) break;
      }
    }
    if (!clicked) return;
    await p.waitForTimeout(1200);
  }
}

if (page.url().includes('/onboarding')) {
  // 온보딩이 뜨면 건너뛴다. 캡처 대상이 아니고, 여기 갇히면 전부 같은 화면이 찍힌다.
  await passOnboarding(page);
  await settle(page);
}

await page.addStyleTag({
  content: '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }',
});

/**
 * 화면이 자리 잡을 때까지 기다린다.
 *
 * ⚠ 고정 대기(2.2초)로는 **로딩 화면이 찍힌다.** 이 앱은 부팅 뒤 세션·프로필·원장을
 * 차례로 읽어서, 실측상 첫 실행에서 여섯 화면이 전부 "영차영차! 별가루 한 줌"
 * (로딩 문구)으로 찍혔다. 그래서 로딩 문구가 사라지고 본문이 자랄 때까지 본다.
 */
async function settle(p, maxMs = 20000) {
  const started = Date.now();
  let lastLen = -1;
  let stable = 0;
  while (Date.now() - started < maxMs) {
    const info = await p.evaluate(() => {
      const t = document.body.innerText || '';
      return { len: t.length, loading: /영차영차|불러오는|Loading|읽는 중/.test(t) };
    });
    if (!info.loading && info.len > 40) {
      // 두 번 연속 같은 길이면 렌더가 멎은 것으로 본다.
      if (info.len === lastLen && ++stable >= 2) return;
    } else {
      stable = 0;
    }
    lastLen = info.len;
    await p.waitForTimeout(700);
  }
}

/**
 * 앱 DOM 을 훑는다.
 *
 * ⚠ 레퍼런스 쪽 다이제스트는 depth 6 에서 끊는데, **앱에는 그 컷이 맞지 않는다.**
 * RN-web 은 View 를 겹겹이 감싸서 실제 글자가 8~12 depth 에 있다. 처음 이 도구를
 * 깊이 6 으로 돌렸더니 앱 노드가 전부 0 으로 나왔다 — 화면은 멀쩡히 찍히는데
 * 대조 수치만 0% 인, 가장 헷갈리는 실패였다. 그래서 앱은 깊이를 24 까지 본다.
 * 대조는 트리 모양이 아니라 **텍스트 집합**으로 하므로 이 비대칭은 문제가 안 된다.
 */
async function digest() {
  return page.evaluate(() => {
    const walk = (el, depth) => {
      if (depth > 24) return null;
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
        box: [Math.round(r.width), Math.round(r.height)],
        ...(own ? { text: own.slice(0, 120) } : {}),
        ...(kids.length ? { kids } : {}),
      };
    };
    return walk(document.body, 0);
  });
}

// 레퍼런스 프레임에만 있는 기기 크롬(가짜 상태바 시계 등)은 대조에서 뺀다.
// 앱에는 원래 없는 것이라, 두면 모든 화면이 영구히 한 칸씩 깎인다.
const CHROME = [/^\d{1,2}\s*[:.]\s*\d{2}$/];
const isChrome = (t) => CHROME.some((re) => re.test(t));

/** 다이제스트를 (텍스트, 박스) 목록으로 눌러 편다 — 트리 모양이 달라도 견줄 수 있게. */
function flatten(node, out = []) {
  if (!node) return out;
  if (node.text && !isChrome(node.text)) {
    out.push({ text: node.text, w: node.box?.[0] ?? 0, h: node.box?.[1] ?? 0 });
  }
  for (const k of node.kids ?? []) flatten(k, out);
  return out;
}

for (const target of TARGETS) {
  const route = routeMap[target.id];
  try {
    await page.goto(`${BASE_URL}/2nd-B${route}`, { waitUntil: 'load', timeout: 60000 });
    await settle(page);
    // ⚠ 온보딩은 **매 이동마다 다시 뜬다.** 완료 표시가 이 세션의 localStorage 가
    // 아니라 계정 상태에 걸려 있어서, 루프 앞에서 한 번 건너뛰는 것으로는 홈이
    // 영영 안 찍힌다(실측: home 이 온보딩으로 찍혀 대조 0%). 화면마다 확인한다.
    if (page.url().includes('/onboarding') && !route.includes('onboarding')) {
      await passOnboarding(page);
      await page.goto(`${BASE_URL}/2nd-B${route}`, { waitUntil: 'load', timeout: 60000 });
      await settle(page);
    }
    await page.screenshot({ path: path.join(OUT, `${target.id}.png`) });
    const appDigest = await digest();
    writeFileSync(
      path.join(OUT, 'structure', `${target.id}.json`),
      JSON.stringify(appDigest, null, 1) + '\n',
    );

    // 대조: 레퍼런스에 있는 텍스트 노드 중 앱에도 있는 비율 + 노드 수 차이.
    const refPath = path.join(KIT, 'data', 'structure', `${target.id}.json`);
    if (existsSync(refPath)) {
      const ref = flatten(JSON.parse(readFileSync(refPath, 'utf8')));
      const app = flatten(appDigest);
      const appText = new Set(app.map((n) => n.text));
      const matched = ref.filter((n) => appText.has(n.text)).length;
      report.compare.push({
        id: target.id,
        route,
        refNodes: ref.length,
        appNodes: app.length,
        textMatched: matched,
        textMatchPct: ref.length ? Math.round((matched / ref.length) * 100) : null,
      });
    }
    report.shots.push({ id: target.id, route, ok: true });
    process.stdout.write(target.id + ' ');
  } catch (e) {
    report.shots.push({ id: target.id, route, ok: false, error: String(e).slice(0, 200) });
    process.stdout.write(target.id + '(FAIL) ');
  }
}
process.stdout.write('\n');

writeFileSync(path.join(OUT, 'app-report.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();

const failed = report.shots.filter((s) => !s.ok);
console.log(
  `app captures ${report.shots.length - failed.length}/${report.shots.length} · console errors ${report.consoleErrors.length}`,
);
for (const c of report.compare) {
  console.log(`  ${c.id.padEnd(12)} ref ${String(c.refNodes).padStart(3)} · app ${String(c.appNodes).padStart(3)} · text match ${c.textMatchPct}%`);
}
process.exit(failed.length ? 1 : 0);
