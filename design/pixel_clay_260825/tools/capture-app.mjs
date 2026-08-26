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
 *      PW_PATH(Playwright 모듈 경로) · BROWSER_PATH(Chromium 실행 파일, 선택)
 *
 * ⚠ 산출 PNG 는 저장소에 커밋하지 않는다(레퍼런스 93장이 이미 3.4MB). 커밋하는 것은
 * 리포트 JSON 하나뿐이고, 그것도 기본 경로는 OUT 아래다 — 필요할 때만 옮긴다.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  browserLaunchOptions,
  CaptureContractError,
  captureFailureCodes,
  digestPage,
  makeCaptureInitScript,
  previewEnvLines,
  resolvePlaywright,
  shotFailureCodes,
  validateFinalUrl,
  waitForSettledPage,
} from './capture-app-contract.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, '..');
const REPO = path.join(KIT, '..', '..');

// --print-env: eas.json preview 프로필의 값을 셸에 그대로 흘린다. 이 값들이 없으면
// export 는 성공하는데 앱이 mock 으로 돈다 — 실패가 아니라 침묵이라 더 나쁘다.
if (process.argv.includes('--print-env')) {
  const eas = JSON.parse(readFileSync(path.join(REPO, 'eas.json'), 'utf8'));
  const env = eas.build?.preview?.env ?? {};
  const lines = previewEnvLines(env);
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error('BASE_URL required — serve the PARENT of a directory named 2nd-B');
  process.exit(1);
}
const OUT = process.env.OUT || path.join(REPO, '.app-shots');
let playwright;
try {
  playwright = resolvePlaywright(require, process.env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const chromium = playwright.chromium ?? playwright.default.chromium;

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
const mapFile = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};
const routeMap = mapFile.routes || {};
// 라우트는 맞는데 이 하네스로는 못 재는 화면들(로그인된 세션이면 리다이렉트되는 인증
// 화면, 유효한 토큰이 없으면 오류 상태를 그리는 화면). 백분율을 내면 그건 디자인
// 점수가 아니라 하네스 상태를 잰 값이라 **숫자 대신 사유를 낸다.**
const unmeasurable = { ...(mapFile.unmeasurable || {}) };
delete unmeasurable._note;
const only = process.env.SCREENS ? process.env.SCREENS.split(',').map((s) => s.trim()) : null;
const TARGETS = manifest.screens
  .filter((s) => s.port === true && routeMap[s.id] && !unmeasurable[s.id])
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
const report = {
  baseUrl: new URL(BASE_URL).origin,
  shots: [],
  consoleErrorCount: 0,
  compare: [],
  unmeasurable: {},
};

const browser = await chromium.launch(browserLaunchOptions(process.env));
const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 1 });
await ctx.addInitScript(makeCaptureInitScript(FIXED_TIME));

const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrorCount += 1;
});
let activeShot = null;
page.on('response', (response) => {
  if (!activeShot) return;
  activeShot.responses.push({ url: response.url(), status: response.status() });
});
page.on('pageerror', () => {
  if (activeShot) activeShot.pageErrorCount += 1;
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
/**
 * 화면이 자리 잡을 때까지 기다린다.
 *
 * ⚠ 고정 대기(2.2초)로는 **로딩 화면이 찍힌다.** 이 앱은 부팅 뒤 세션·프로필·원장을
 * 차례로 읽어서, 실측상 첫 실행에서 여섯 화면이 전부 "영차영차! 별가루 한 줌"
 * (로딩 문구)으로 찍혔다. 그래서 로딩 문구가 사라지고 본문이 자랄 때까지 본다.
 */
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
  return page.evaluate(digestPage);
}

// ⚠ 앱은 한국어 줄바꿈을 다듬으려고 글자 사이에 **워드 조이너(U+2060)** 를 심는다
// (src/lib/i18n/keep-all.ts). 눈에는 안 보이지만 문자열 비교에는 잡혀서, 같은 문장이
// 레퍼런스와 다르다고 나온다 — import-hub 의 '무엇을 들여올까요?' 처럼 앱에 글자
// 그대로 있는 문장이 미매칭으로 세어졌다. 비교 전에 지운다(제로폭 문자 일괄).
const INVISIBLE = /[⁠​‌‍﻿]/g;
const norm = (t) => t.replace(INVISIBLE, "");

// 레퍼런스 프레임에만 있는 기기 크롬(가짜 상태바 시계 등)은 대조에서 뺀다.
// 앱에는 원래 없는 것이라, 두면 모든 화면이 영구히 한 칸씩 깎인다.
const CHROME = [/^\d{1,2}\s*[:.]\s*\d{2}$/];
const isChrome = (t) => CHROME.some((re) => re.test(t));

/** 다이제스트를 (텍스트, 박스) 목록으로 눌러 편다 — 트리 모양이 달라도 견줄 수 있게. */
function flatten(node, out = []) {
  if (!node) return out;
  if (node.text && !isChrome(node.text)) {
    out.push({ text: norm(node.text), w: node.box?.[0] ?? 0, h: node.box?.[1] ?? 0 });
  }
  for (const k of node.kids ?? []) flatten(k, out);
  return out;
}

for (const target of TARGETS) {
  const route = routeMap[target.id];
  activeShot = { responses: [], pageErrorCount: 0 };
  try {
    await page.goto(`${BASE_URL}/2nd-B${route}`, { waitUntil: 'load', timeout: 60000 });
    await waitForSettledPage(page);
    await page.screenshot({ path: path.join(OUT, `${target.id}.png`) });
    const appDigest = await digest();
    validateFinalUrl(BASE_URL, route, page.url());
    const failureCodes = shotFailureCodes({
      baseUrl: BASE_URL,
      responses: activeShot.responses,
      pageErrorCount: activeShot.pageErrorCount,
    });
    if (failureCodes.length) {
      throw new CaptureContractError(failureCodes);
    }
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
  } catch (error) {
    report.shots.push({ id: target.id, route, ok: false, failureCodes: captureFailureCodes(error) });
    process.stdout.write(target.id + '(FAIL) ');
  } finally {
    activeShot = null;
  }
}
process.stdout.write('\n');

report.unmeasurable = unmeasurable;
writeFileSync(path.join(OUT, 'app-report.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();

const failed = report.shots.filter((s) => !s.ok);
console.log(
  `app captures ${report.shots.length - failed.length}/${report.shots.length} · console errors ${report.consoleErrorCount}`,
);
for (const c of report.compare) {
  console.log(`  ${c.id.padEnd(12)} ref ${String(c.refNodes).padStart(3)} · app ${String(c.appNodes).padStart(3)} · text match ${c.textMatchPct}%`);
}
// 못 잰 것을 조용히 빼면 "40장 전부 쟀다"로 읽힌다. 왜 못 쟀는지 같이 말한다.
const skipped = Object.entries(unmeasurable).filter(([id]) => !only || only.includes(id));
if (skipped.length) {
  console.log('');
  console.log(`측정 불가 ${skipped.length}장 — 하네스 조건 때문이지 디자인 문제가 아니다:`);
  for (const [id, info] of skipped) {
    console.log(`  ${id.padEnd(12)} ${info.route} — ${info.why}`);
    if (info.needs) console.log(`  ${''.padEnd(12)} 필요: ${info.needs}`);
  }
}
process.exit(failed.length ? 1 : 0);
