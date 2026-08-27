// P1 채점기 — 화면 하나가 레퍼런스에 얼마나 닿았는가를 5축 100점으로 낸다.
//
// ## 왜 5축인가 (그리고 왜 카피 배점이 낮은가)
//
// 기존 눈금은 `textMatchPct` 하나였는데, 레퍼런스 화면의 텍스트 노드가 **5~13개**뿐이다.
// 노드 하나가 8~20점씩 움직이므로 그 눈금의 98점은 100점과 같은 말이고, 100점은
// "레퍼런스 목업의 가짜 문장까지 베껴라"가 된다 — `digest`·`insights` 처럼 목업
// 데이터를 쓰는 화면은 **베끼면 오히려 틀린다.**
//
// 그래서 해상도가 있는 축을 섞는다:
//
//   A 픽셀규율  30  DOM 의 곡선·라운드·블러·정적 반투명 위반 수 (위반 1건당 -6)
//   B 토큰충실도 25  칠한 색이 캐논 램프로 해결되는 **면적** 비율 × 25
//   C 구조일치  20  **세로 밴드 리듬**을 이미지에서 대조 (band-signature.mjs)
//   D 내비도달   15  nav.json 이 선언한 **이동 가능한 라벨**이 화면에 있는 비율 × 15
//   E 카피      10  기존 textMatchPct × 0.1
//
// ⚠ **98 은 게이트지 완성이 아니다.** 여백의 리듬·픽셀의 손맛·타이밍·카피의 온도는
//   점수로 만들지 않는다. 점수를 올리려고 그걸 희생하면 실패다.
//
// ## 이탈은 감점이 아니다 — 사유가 있으면
//
// 레퍼런스가 자동으로 옳지는 않다(`record` 프레임이 목록/상세를 뒤섞어 71% 라는
// 거짓 수치를 냈던 전례). `data/deviations.json` 에 {screen, axis, what, why} 를
// 적으면 그 축의 감점을 면제한다. 단 **`why` 가 비면 면제하지 않는다** — 면제가
// 공짜면 전부 이탈이 된다.
//
// ## 쓰는 법
//
//   node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
//   source /tmp/webenv.sh && npx expo export --platform web --output-dir <dist>
//   # <root>/2nd-B -> <dist> 정션을 만들고 그 부모를 SPA 폴백으로 서빙
//   BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/score.mjs [id ...]
//
// ⚠ `--print-env` 를 건너뛰면 앱이 **에러 없이 조용히 mock 으로** 돌아 수치가 전부 거짓이 된다.
// ⚠ 시각을 고정하지 말 것 — 고정 시각이 토큰 발급보다 뒤면 세션이 만료로 보여
//   **모든 화면이 로그인 월로** 찍힌다(캡처는 성공, 대조만 0%).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
// ⚠ C축을 끄면서 안 쓰게 됐다. `band-signature.mjs` 는 **지우지 않았다** —
//   다시 재는 사람이 거기서 시작하고, 왜 안 됐는지가 이 파일 C축 자리에 적혀 있다.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(KIT, 'data');
const BASE = process.env.BASE_URL || 'http://localhost:8979';
const OUT = process.env.SCORE_OUT || join(DATA, 'score.json');

const WEIGHTS = { A: 30, B: 25, C: 20, D: 15, E: 10 };
// 이보다 글자가 적으면 화면이 안 그려진 것으로 본다(빈 페이지 채점 방지).
const MIN_TEXTS = Number(process.env.MIN_TEXTS || 5);
const A_PENALTY = 6; // 픽셀 규율 위반 1건당

const routes = JSON.parse(readFileSync(join(DATA, 'app-routes.json'), 'utf8'));
const tokens = JSON.parse(readFileSync(join(DATA, 'tokens.json'), 'utf8'));
const nav = existsSync(join(DATA, 'nav.json'))
  ? JSON.parse(readFileSync(join(DATA, 'nav.json'), 'utf8'))
  : {};
const deviations = existsSync(join(DATA, 'deviations.json'))
  ? JSON.parse(readFileSync(join(DATA, 'deviations.json'), 'utf8'))
  : { deviations: [] };

/** 캐논 램프 — tokens.json 안의 모든 hex 값. B축의 기준이다. */
const RAMP = (() => {
  const out = new Set();
  const walk = (o) => {
    for (const v of Object.values(o || {})) {
      if (v && typeof v === 'object') walk(v);
      else if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out.add(v.toLowerCase());
    }
  };
  walk(tokens);
  return out;
})();

/** ⚠ 앱이 심는 워드 조이너(U+2060)가 문자열 비교를 깨뜨려 **있는 문장을 없다고** 셌다. */
const norm = (s) => (s || '').replace(/[⁠​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

function exempt(screen, axis) {
  return (deviations.deviations || []).some(
    (d) => d.screen === screen && d.axis === axis && typeof d.why === 'string' && d.why.trim().length > 0,
  );
}

// 앱 쪽 섹션을 셀 때 볼 최대 깊이. RN-web 은 같은 화면을 레퍼런스보다 훨씬
// 깊게 싼다 — 이 값이 없으면 C 축이 디자인이 아니라 래퍼 수를 잰다.
const SECTION_DEPTH = Number(process.env.SECTION_DEPTH || 14);

const IN_PAGE = () => {
  const CURVE = ['circle', 'ellipse', 'path', 'polyline', 'polygon'];
  const tr = (v) => /rgba?\([^)]*?,\s*0?\.\d+\s*\)/.test(v || '');
  const SECTION_DEPTH = __DEPTH__;
  const res = { curves: 0, rounds: 0, blurs: 0, alphas: 0, colors: {}, sections: [], texts: [], links: [] };
  for (const el of document.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);
    if (CURVE.includes(tag)) res.curves++;
    for (const p of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) {
      if (parseFloat(cs[p]) > 0) { res.rounds++; break; }
    }
    // ⚠ **흐린 그림자만 센다.** `box-shadow` 가 있다고 다 위반이 아니다 —
    //   blur 반경 0 인 오프셋 그림자는 하드에지라 PIXEL-CLAY 가 쓰는 기법이다
    //   (`pixelShadowStyle` 의 `blur: 0`, 4방향 베벨). 처음엔 `!== 'none'` 으로
    //   세다가 `/secondb` 의 A 축이 0/30 으로 찍혔는데, 그 넷은 전부 하드 그림자였다.
    if (cs.filter && /blur\(\s*(?!0(?:px)?\))/.test(cs.filter)) res.blurs++;
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      // `rgb(...) Xpx Ypx Bpx ...` 에서 세 번째 길이가 blur 반경이다.
      const lens = (cs.boxShadow.match(/(-?[\d.]+)px/g) || []).map((v) => parseFloat(v));
      if (lens.length >= 3 && Math.abs(lens[2]) > 0.5) res.blurs++;
    }
    const o = Number(cs.opacity);
    let a = o > 0 && o < 1;
    if (!a) for (const p of ['backgroundColor', 'color', 'borderTopColor', 'fill', 'stroke']) if (tr(cs[p])) { a = true; break; }
    if (a) res.alphas++;

    // B: 색이 칠한 **면적**. 작은 글자 하나와 전면 배경을 같게 세면 안 된다.
    const r = el.getBoundingClientRect();
    const area = Math.max(0, r.width) * Math.max(0, r.height);
    if (area > 0) {
      const bg = cs.backgroundColor;
      const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg || '');
      if (m && !/rgba\([^)]*,\s*0\)/.test(bg)) {
        const hex = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
        res.colors[hex] = (res.colors[hex] || 0) + area;
      }
    }

    // C: 섹션 = 화면 폭의 절반 이상 + **얕은 깊이**의 블록.
    //
    // ⚠ 깊이를 안 자르면 RN-web 이 View 를 겹겹이 싸는 탓에 앱 섹션이 27~41 로
    //   잡히고, 레퍼런스(얕은 DOM)와는 비교가 아니라 **래퍼 깊이 차이**를 재게 된다.
    //   실제로 그래서 C 가 전 화면 2~4/20 이었다.
    let depth = 0;
    for (let p = el.parentElement; p && depth < 40; p = p.parentElement) depth++;
    if (r.width >= innerWidth * 0.5 && r.height >= 24 && depth <= SECTION_DEPTH) {
      res.sections.push(Math.round(r.height));
    }

    // ⚠ `<style>`·`<script>` 안의 내용은 **화면 글자가 아니다.**
    //   이걸 세는 바람에 앱이 안 뜬 화면이 글자 6개(전부 CSS)로 잡혀
    //   빈 화면 게이트를 그대로 **통과했다.** 게이트를 만든 이유가 그건데.
    if (!/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName)) {
      if (el.children.length === 0 && (el.textContent || '').trim()) res.texts.push(el.textContent);
    }
    const href = el.getAttribute && el.getAttribute('href');
    if (href) res.links.push(href);
  }
  return res;
};

async function scoreOne(page, id, route) {
  await page.goto(BASE + '/2nd-B' + route, { waitUntil: 'load' });
  // ⚠ **고정 시간으로 기다리지 않는다.** 2.4초만 쉬고 쟀더니 로딩 화면에 멈춘
  //   상태를 채점해서 여섯 화면이 **전부 같은 점수**(A24·B25·D0·E0)로 나왔다.
  //   화면이 실제로 그려졌는지를 **조건으로** 기다린다.
  let ready = true;
  try {
    await page.waitForFunction(
      (min) => {
        let n = 0;
        for (const el of document.querySelectorAll('body *')) {
          if (/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName)) continue;
          if (el.children.length === 0 && (el.textContent || '').trim()) n++;
        }
        return n >= min;
      },
      MIN_TEXTS,
      { timeout: 25000 },
    );
  } catch {
    ready = false;
  }
  if (!ready) {
    return {
      id, route, A: null, B: null, C: null, D: null, E: null, total: null,
      unmeasured: ['A', 'B', 'C', 'D', 'E'],
      error: '측정 실패 — 25초 안에 화면이 안 그려졌다(로딩 화면에 멈춤). 서버·로그인·번들을 확인할 것.',
    };
  }
  await page.waitForTimeout(900);
  // ⚠ **화면을 덤는 것을 먼저 치운다.** 코치마크만 닫고 있었더니 `/secondb` 가
  //   "안녕하세요, 세컨비입니다" 소개 모달이 덤인 채로 채점됐다 — 밴드가 5개로
  //   잡혀 C축이 3.8/20 이었는데 그건 대화 화면이 아니라 **모달**을 잴 값이다.
  //   하마터면 구조 차이로 보고할 뻔했다.
  //
  //   ⚠ 닫기 라벨에 **화면 고유의 버튼을 넣지 말 것** — 그걸 누르면 채점 대상이
  //     아니라 다음 화면을 재게 된다. 여기 있는 것은 전부 "덤개를 닫는" 말이다.
  const DISMISS = ['다시 보지 않기', '건너뛰기', '알겠습니다', '오늘은 그만 보겠습니다'];
  for (let pass = 0; pass < 3; pass++) {
    let clicked = false;
    for (const label of DISMISS) {
      const b = page.getByText(label, { exact: false });
      if (await b.count()) {
        await b.first().click().catch(() => {});
        await page.waitForTimeout(800);
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }
  await page.waitForTimeout(500);
  const app = await page.evaluate(IN_PAGE_SRC);

  // ⚠ **빈 화면을 채점하지 않는다.**
  //
  // 하네스가 가끔 흰 화면을 찍는다(로그인이 안 끝났거나 라우터가 아직 못 그렸을 때).
  // 그걸 그대로 채점하면 C·D·E 가 0 으로 나오고 **디자인 실패처럼 보인다.**
  // 실제로 그랬다 — 같은 빌드를 두 번 재서 한 번은 chat 70, 한 번은 55(C·D·E 전부 0).
  // 둘 중 하나는 거짓이고 **거짓인 쪽이 조용했다.**
  //
  // 글자가 거의 없으면 못 쟀다고 말한다. **0 점과 측정 실패는 다른 값이다.**
  if (app.texts.length < MIN_TEXTS) {
    return {
      id, route, A: null, B: null, C: null, D: null, E: null, total: null,
      unmeasured: ['A', 'B', 'C', 'D', 'E'],
      error: `측정 실패 — 화면에 글자가 ${app.texts.length}개뿐이다(빈 페이지로 보임). 하네스를 확인할 것.`,
    };
  }

  const structPath = join(DATA, 'structure', `${id}.json`);
  const ref = existsSync(structPath) ? JSON.parse(readFileSync(structPath, 'utf8')) : null;

  // ── A 픽셀 규율
  const violations = app.curves + app.rounds + app.blurs + app.alphas;
  const A = exempt(id, 'A') ? WEIGHTS.A : Math.max(0, WEIGHTS.A - violations * A_PENALTY);

  // ── B 토큰 충실도 (면적 비율)
  let inRamp = 0, total = 0;
  for (const [hex, area] of Object.entries(app.colors)) {
    total += area;
    if (RAMP.has(hex)) inRamp += area;
  }
  const B = exempt(id, 'B') ? WEIGHTS.B : total > 0 ? (inRamp / total) * WEIGHTS.B : WEIGHTS.B;

  // ── C 구조 일치 (세로 밴드 리듬)
  //
  // ⚠ 처음엔 DOM 에서 "폭 넓은 블록"을 세었는데, 레퍼런스는 얕은 DOM 이고 앱은
  //   RN-web 이 View 를 겹겹이 싸서 앱 섹션이 27~41 로 잡혔다. 깊이를 잘라도
  //   **디자인 차이가 아니라 렌더 엔진 차이**를 재는 값이라 그 축은 버렸다.
  //
  // 픽셀에는 그 비대칭이 없다. 두 화면 모두 가로 밴드의 나열이고, 밴드가 어디서
  // 시작하고 끝나는지는 엔진과 무관하다. 그래서 **이미지에서** 리듬을 뽑아 댄다.
  // ⚠⚠ **이 축은 꺼져 있다. 점수가 아니라 `null`(못 잼)을 낸다.** 2026-08-27.
  //
  // 밴드 눈금은 **어느 화면을 보고 있는지조차 구별하지 못했다.** 앱 캡처 6장에게
  // 레퍼런스 6장 중 자기 짝을 고르게 했더니 **0/6** 이었다 — 무작위 기대값 1/6 보다
  // 낮다. `home` 은 `chat` 을 골랐고 `review` 는 `home` 을 골랐다.
  //
  //     앱 home   → chat (0.544)   자기 짝 0.408
  //     앱 review → home (0.529)   자기 짝 0.447
  //
  // 대조군도 같은 말을 했다: **다른 화면끼리 비교한 평균이 같은 화면끼리보다 높다**
  // (벌어짐 -0.068). 가까운 줄을 묶는 gap 을 0·0.01·0.02·0.03·0.05 로 쓸어봐도
  // 다섯 설정 **전부** 음수였다. 튜닝으로 살릴 수 있는 값이 아니다.
  //
  // 원인은 뽑는 것이 틀려서다. 밴드 높이가 전부 0.01~0.03 이었다 — 레이아웃 덩어리가
  // 아니라 **글줄**이다. 글줄은 문장이 한 줄만 늘어도 아래가 전부 밀리므로, 이 눈금은
  // 구조가 아니라 **글 양**을 잰다. 게다가 같은 앱의 화면들은 셸(상태바·헤더·독)과
  // 타입 그리드를 공유해서 리듬이 원래 닮았다. 화면을 가르는 신호가 그 닮음보다 작다.
  //
  // ⚠ 그래서 이전에 나온 C 숫자(3.8·9.0·7.6~9.4)는 **전부 잡음이었다.** 인용 금지.
  // ⚠ 되살리려는 사람에게: 먼저 위의 **자기 짝 찾기 검사부터 통과시킬 것.**
  //   6장 중 6장이 자기 짝을 고르지 못하면 그 눈금으로는 화면을 채점할 수 없다.
  //   구조를 재려면 글줄이 아니라 덩어리를 뽑아야 하고, 그건 밴드가 아니라
  //   영역 분할(가로·세로 양방향)이라야 할 가능성이 크다.
  //
  // `null` 은 0 이 아니다 — 총점은 남은 축으로 재정규화된다(빈 화면 게이트와 같은 규율).
  const C = null;
  const cWhy = '⚠ 축 꺼짐 — 눈금이 화면을 구별 못 함(자기 짝 찾기 0/6, 무작위 1/6 보다 낮음)';

  // ── D 내비 도달
  //
  // ⚠ `nav.json` 은 **링크가 아니라 라벨 목록**이다(처음에 href 로 읽었다가 선언이
  //   하나도 안 잡혀 전 화면이 만점이 됐다 — 축이 통째로 무의미했다).
  //   그래서 "레퍼런스가 이 화면에서 갈 수 있다고 적은 곳들이 화면에 실제로
  //   있는가"를 잰다.
  let D = null;
  const declared = Array.isArray(nav[id]) ? nav[id] : null;
  if (exempt(id, 'D')) D = WEIGHTS.D;
  else if (declared && declared.length) {
    const appTextBlob = app.texts.map(norm).join('  ');
    const hit = declared.filter((label) => {
      const t = norm(label).replace(/[…·]+$/, '');
      return t.length > 0 && appTextBlob.includes(t.slice(0, Math.max(2, Math.min(t.length, 8))));
    }).length;
    D = (hit / declared.length) * WEIGHTS.D;
  }

  // ── E 카피
  let E = WEIGHTS.E;
  if (!exempt(id, 'E') && ref) {
    const refTexts = [];
    (function walk(n) {
      if (!n) return;
      if (n.text) refTexts.push(norm(n.text));
      (n.kids || []).forEach(walk);
    })(ref);
    const appTexts = app.texts.map(norm).filter(Boolean);
    const hit = refTexts.filter((t) => t && appTexts.some((a) => a.includes(t))).length;
    E = refTexts.length ? (hit / refTexts.length) * WEIGHTS.E : WEIGHTS.E;
  }

  // ⚠ **못 잰 축을 만점으로 세지 않는다.** 그렇게 하면 데이터가 없을수록 점수가
  //   올라간다 — 처음 판이 정확히 그랬다(nav 선언이 없어 D 가 전 화면 15/15).
  //   못 잰 축은 총점에서 빼고 남은 축으로 100점 환산하며, 무엇을 못 쟀는지 남긴다.
  const rawParts = { A, B, C, D, E };
  const measured = Object.entries(rawParts).filter(([, v]) => v !== null);
  const unmeasured = Object.entries(rawParts).filter(([, v]) => v === null).map(([k]) => k);
  const gotSum = measured.reduce((n, [, v]) => n + v, 0);
  const maxSum = measured.reduce((n, [k]) => n + WEIGHTS[k], 0);
  const parts = Object.fromEntries(
    Object.entries(rawParts).map(([k, v]) => [k, v === null ? null : +v.toFixed(1)]),
  );
  const total100 = maxSum > 0 ? +((gotSum / maxSum) * 100).toFixed(1) : null;
  return {
    id, route, ...parts, total: total100, unmeasured,
    why: {
      A: `곡선 ${app.curves} · 라운드 ${app.rounds} · 블러 ${app.blurs} · 반투명 ${app.alphas}`,
      B: total > 0 ? `램프 면적 ${(100 * inRamp / total).toFixed(1)}%` : '칠한 면적 없음',
      C: cWhy,
      D: Array.isArray(declared) ? `선언 링크 ${declared.length}` : 'nav 선언 없음',
      E: ref ? '레퍼런스 텍스트 대조' : '레퍼런스 구조 없음',
    },
  };
}

// `page.evaluate` 는 바깥 스코프를 못 본다. 깊이 값을 문자열로 박아 넣는다.
const IN_PAGE_SRC = new Function('return (' + IN_PAGE.toString().replace('__DEPTH__', String(SECTION_DEPTH)) + ')')();

const only = process.argv.slice(2);
const targets = Object.entries(routes.routes).filter(([id]) => !only.length || only.includes(id));
if (!targets.length) {
  console.error('대상이 없다. data/app-routes.json 의 routes 를 확인할 것.');
  process.exit(2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 820 } });
const page = await ctx.newPage();

const env = readFileSync(join(KIT, '..', '..', '.env.test'), 'utf8');
const EMAIL = /QA_TEST_EMAIL\s*=\s*(.+)/.exec(env)[1].trim();
const PASS = /QA_TEST_PASSWORD\s*=\s*(.+)/.exec(env)[1].trim();

await page.goto(BASE + '/2nd-B/', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.evaluate(() => { try { sessionStorage.setItem('secondB_intro_played_v1', '1'); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2500);
if (await page.locator('input[type="email"]').count()) {
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(7000);
}
await page.evaluate(() => {
  try {
    localStorage.setItem('onboarding.cosmicPixel.v2.completedAt', new Date(2026, 0, 1).toISOString());
    localStorage.setItem('sb_notice_seen', 'n_999');
    localStorage.setItem('sb_coachmarks_seen', '1');
    for (const k of Object.keys(localStorage)) if (/coach/i.test(k)) localStorage.removeItem(k);
  } catch (e) {}
});

const rows = [];
for (const [id, route] of targets) {
  try {
    rows.push(await scoreOne(page, id, route));
  } catch (e) {
    rows.push({ id, route, total: null, error: String(e).slice(0, 120) });
  }
}
await browser.close();

rows.sort((a, b) => (a.total ?? -1) - (b.total ?? -1));
console.log('id'.padEnd(16) + 'A     B     C     D     E     합계');
for (const r of rows) {
  if (r.total === null) { console.log(r.id.padEnd(16) + '⚠ ' + (r.error || '측정 실패')); continue; }
  console.log(
    r.id.padEnd(16) +
    [r.A, r.B, r.C, r.D, r.E].map((v) => String(v === null ? '-' : v).padStart(5)).join(' ') +
    String(r.total).padStart(7) + (r.total >= 98 ? '  ✅' : '') +
    (r.unmeasured && r.unmeasured.length ? '  (못 잼: ' + r.unmeasured.join(',') + ')' : ''),
  );
}
const ok = rows.filter((r) => r.total !== null && r.total >= 98).length;
const failed = rows.filter((r) => r.total === null).length;
console.log(`\n98점 이상: ${ok} / ${rows.filter((r) => r.total !== null).length}` +
  (failed ? `   ⚠ 측정 실패 ${failed}건 — 이건 0점이 아니라 **모름**이다` : ''));
writeFileSync(OUT, JSON.stringify({
  note: '5축 채점(A 픽셀규율 30 · B 토큰충실도 25 · C 구조일치 20 · D 내비무결성 15 · E 카피 10). ' +
        '98 은 게이트지 완성이 아니다 — 여백·손맛·타이밍·카피의 온도는 점수로 만들지 않는다.',
  base: BASE, weights: WEIGHTS, rows,
}, null, 1) + '\n');
console.log('wrote', OUT);
