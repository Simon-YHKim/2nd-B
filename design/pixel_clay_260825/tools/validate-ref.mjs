#!/usr/bin/env node
/**
 * validate-ref.mjs — 레퍼런스 키트가 스스로 모순되지 않는지 본다. 브라우저 없음.
 *
 * `npm run verify` 안에서 도는 유일한 레퍼런스 게이트다(캡처는 Playwright 가 필요해
 * verify 에 넣지 않는다 — CI 가 브라우저를 안 갖는다). 여기서 막는 것은 하나다:
 * **키트가 조용히 낡는 것.** 매니페스트에 화면을 추가하고 캡처를 안 뜨거나, 캡처만
 * 지우거나, port 플래그를 사유 없이 뒤집는 일이 소리 없이 지나가면 이 키트는
 * 판정 근거가 아니라 장식이 된다.
 *
 * 검사:
 *   1. screens.json 형식 — id 중복 없음, port 는 true|false|'deferred', false/deferred 는 사유 필수
 *   2. capture:true 인 화면마다 captures/<id>.png 와 data/structure/<id>.json 존재
 *   3. 산출물에 매니페스트에 없는 고아가 없다
 *   4. tokens.json 이 런타임 추출본이고 앵커 값을 갖는다(--u:2px 등) — CSS 텍스트
 *      정규식으로 뜨면 --u 가 4px 로 나온다(실측). 그 사고를 여기서 잡는다.
 *   5. nav.json 의 키가 캡처한 화면의 부분집합이다
 *   6. app-routes.json 이 **거짓 수치를 만들 수 없는 모양**인지 — 한 앱 라우트에
 *      레퍼런스 id 가 둘 이상 붙으면 그중 하나는 반드시 다른 화면과 대조된다
 *      (실측 2026-08-26: record/records 가 둘 다 /records 라 record 71% 가 거짓이었다).
 *      unmeasurable/unmapped 항목은 사유(why)가 필수 — 사유 없는 제외는 은폐다.
 *   7. salvage-plan.json 이 직접 매핑 밖의 디자인 프레임과 production route 를
 *      정확히 한 번씩 분류한다. 재사용 계획이 새 화면 추가나 조용한 폐기로 변질되면 막는다.
 *
 * 실행: node design/pixel_clay_260825/tools/validate-ref.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const fail = [];
const note = (m) => fail.push(m);

function compareExactSet(label, expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const value of expectedSet) {
    if (!actualSet.has(value)) note(`${label}: 누락 ${value}`);
  }
  for (const value of actualSet) {
    if (!expectedSet.has(value)) note(`${label}: 범위 밖 항목 ${value}`);
  }
}

const manifestPath = path.join(ROOT, 'data', 'screens.json');
if (!existsSync(manifestPath)) {
  console.error('FAIL design-ref: data/screens.json 이 없다');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const screens = manifest.screens ?? [];

// 1. 매니페스트 형식
const seen = new Set();
for (const s of screens) {
  if (!s.id || typeof s.id !== 'string') note(`id 없는 항목: ${JSON.stringify(s)}`);
  if (seen.has(s.id)) note(`id 중복: ${s.id}`);
  seen.add(s.id);
  if (![true, false, 'deferred'].includes(s.port)) note(`${s.id}: port 는 true|false|'deferred' 여야 한다 (${s.port})`);
  if (s.port !== true && !s.reason) note(`${s.id}: port=${s.port} 인데 사유가 없다 — 이식 금지/보류는 이유가 근거다`);
}
if (!manifest.phone || manifest.phone.width !== 390 || manifest.phone.height !== 820) {
  note('phone 이 390x820 이 아니다 — 캡처 계약이 바뀌면 대조가 무의미해진다');
}

// 2·3. 산출물 대조
const capDir = path.join(ROOT, 'captures');
const structDir = path.join(ROOT, 'data', 'structure');
const wanted = screens.filter((s) => s.capture !== false).map((s) => s.id);
for (const id of wanted) {
  if (!existsSync(path.join(capDir, `${id}.png`))) note(`캡처 없음: captures/${id}.png (매니페스트에 있는 화면)`);
  if (!existsSync(path.join(structDir, `${id}.json`))) note(`구조 없음: data/structure/${id}.json`);
}
const wantedSet = new Set(wanted);
if (existsSync(capDir)) {
  for (const f of readdirSync(capDir)) {
    if (!f.endsWith('.png')) continue;
    const id = f.slice(0, -4);
    if (!wantedSet.has(id)) note(`고아 캡처: captures/${f} — 매니페스트에 없는 화면`);
  }
}

// 4. 토큰 앵커 — 런타임 추출본인지
const tokPath = path.join(ROOT, 'data', 'tokens.json');
if (!existsSync(tokPath)) {
  note('data/tokens.json 이 없다');
} else {
  const tok = JSON.parse(readFileSync(tokPath, 'utf8'));
  const v = tok.vars ?? {};
  if (tok.palette !== 'midnight') note(`팔레트가 midnight 이 아니다: ${tok.palette}`);
  // --u 는 이 키트가 존재하는 이유 그 자체다: 스타일시트 꼬리 재정의가 이겨 2px 인데
  // 정규식 추출기는 4px 를 뽑는다. 4px 가 잡히면 추출 경로가 잘못된 것이다.
  if (v['--u'] !== '2px') note(`--u 가 2px 이 아니다(${v['--u']}) — CSS 텍스트에서 뜬 값일 수 있다. 런타임 추출만 정본`);
  for (const [k, expected] of [
    ['--ds-star', '#CCFAFF'],
    ['--ds-core', '#46B6FF'],
    ['--ds-polaris', '#C8B6FF'],
    ['--c00', '#0a0e18'],
  ]) {
    if ((v[k] ?? '').toLowerCase() !== expected.toLowerCase()) {
      note(`토큰 앵커 불일치 ${k}: ${v[k]} (기대 ${expected})`);
    }
  }
  if (Object.keys(v).length < 100) note(`토큰이 ${Object.keys(v).length}개뿐 — 런타임 전수 추출이 아닐 수 있다`);
}

// 5. nav
const navPath = path.join(ROOT, 'data', 'nav.json');
if (existsSync(navPath)) {
  const nav = JSON.parse(readFileSync(navPath, 'utf8'));
  for (const id of Object.keys(nav)) {
    if (!wantedSet.has(id)) note(`nav.json 에 매니페스트 밖 화면: ${id}`);
  }
}

// 6. app-routes — 거짓 수치를 만들 수 있는 모양인가
const routesPath = path.join(ROOT, 'data', 'app-routes.json');
if (existsSync(routesPath)) {
  const rf = JSON.parse(readFileSync(routesPath, 'utf8'));
  const routes = rf.routes ?? {};

  // 한 라우트에 id 가 둘 이상 = 그중 하나는 다른 화면과 대조된다.
  const byRoute = new Map();
  for (const [id, route] of Object.entries(routes)) {
    if (!byRoute.has(route)) byRoute.set(route, []);
    byRoute.get(route).push(id);
  }
  for (const [route, ids] of byRoute) {
    if (ids.length > 1) {
      note(`app-routes: ${route} 에 id 가 ${ids.length}개 (${ids.join(', ')}) — 한 화면을 서로 다른 레퍼런스 프레임에 대조하게 된다. 하나만 남기고 나머지는 unmapped 로 사유와 함께 옮길 것`);
    }
  }

  // 매핑된 id 는 매니페스트에 있어야 한다.
  for (const id of Object.keys(routes)) {
    if (!seen.has(id)) note(`app-routes: ${id} 가 screens.json 에 없다`);
  }

  // 제외는 사유가 근거다. 사유 없는 제외는 그냥 숨긴 것이다.
  for (const key of ['unmeasurable', 'unmapped']) {
    for (const [id, info] of Object.entries(rf[key] ?? {})) {
      if (id === '_note') continue;
      if (!seen.has(id)) note(`app-routes.${key}: ${id} 가 screens.json 에 없다`);
      if (!info || !info.why) note(`app-routes.${key}: ${id} 에 why 가 없다 — 왜 못 재는지 적지 않으면 다음 사람이 없는 결함을 쫓는다`);
      if (routes[id]) note(`app-routes: ${id} 가 routes 와 ${key} 에 동시에 있다`);
    }
  }

  // 7. 직접 매핑 밖 자산의 생존 계획. route를 억지로 늘리지 않으면서도 모든 프레임과
  // production 화면의 처리 방향을 명시한다. 이 목록이 screens/screen-index와 같이 낡아야
  // 하므로 두 정본에서 기대 집합을 매번 다시 계산한다.
  const salvagePath = path.join(ROOT, 'data', 'salvage-plan.json');
  if (!existsSync(salvagePath)) {
    note('data/salvage-plan.json 이 없다 — 직접 매핑 밖 프레임/라우트의 생존 계획이 필요하다');
  } else {
    const salvage = JSON.parse(readFileSync(salvagePath, 'utf8'));
    if (salvage.schema !== 1) note(`salvage-plan: schema 는 1이어야 한다 (${salvage.schema})`);

    const designFrames = salvage.designFrames ?? {};
    const unmeasurableIds = new Set(
      Object.keys(rf.unmeasurable ?? {}).filter((id) => id !== '_note'),
    );
    const expectedDesignIds = screens
      .map((screen) => screen.id)
      .filter((id) => !Object.hasOwn(routes, id) && !unmeasurableIds.has(id));
    compareExactSet('salvage-plan.designFrames', expectedDesignIds, Object.keys(designFrames));

    const allowedDispositions = new Set([
      'state',
      'redesign',
      'adapt',
      'defer',
      'embed',
      'exclude',
      'retain',
    ]);
    const allowedReferenceUse = new Set(['direct', 'layout-only', 'none']);
    const screenById = new Map(screens.map((screen) => [screen.id, screen]));
    for (const [id, plan] of Object.entries(designFrames)) {
      const screen = screenById.get(id);
      if (!plan || typeof plan !== 'object') {
        note(`salvage-plan.designFrames.${id}: 객체여야 한다`);
        continue;
      }
      if (!allowedDispositions.has(plan.disposition)) {
        note(`salvage-plan.designFrames.${id}: 알 수 없는 disposition ${plan.disposition}`);
      }
      if (!allowedReferenceUse.has(plan.referenceUse)) {
        note(`salvage-plan.designFrames.${id}: 알 수 없는 referenceUse ${plan.referenceUse}`);
      }
      if (plan.target !== null && (typeof plan.target !== 'string' || !plan.target.trim())) {
        note(`salvage-plan.designFrames.${id}: target 은 비어 있지 않은 문자열 또는 null 이어야 한다`);
      }
      for (const field of ['activation', 'reason']) {
        if (typeof plan[field] !== 'string' || !plan[field].trim()) {
          note(`salvage-plan.designFrames.${id}: ${field} 가 비어 있다`);
        }
      }
      if (screen?.port === false && plan.referenceUse === 'direct') {
        note(`salvage-plan.designFrames.${id}: port:false 프레임을 direct 참고로 쓸 수 없다`);
      }
      if (plan.disposition === 'exclude' && plan.referenceUse !== 'none') {
        note(`salvage-plan.designFrames.${id}: exclude 는 referenceUse=none 이어야 한다`);
      }
    }

    const screenIndexPath = path.join(ROOT, '..', '..', 'src', 'lib', 'dev', 'screen-index.ts');
    if (!existsSync(screenIndexPath)) {
      note('src/lib/dev/screen-index.ts 가 없다 — production route 생존 계획을 대조할 수 없다');
    } else {
      const screenIndex = readFileSync(screenIndexPath, 'utf8');
      const productionHrefs = [];
      for (const line of screenIndex.split(/\r?\n/)) {
        const entry = line.match(
          /^\s*\{\s*file:\s*"[^"]+",\s*href:\s*"([^"]+)",\s*label:\s*"[^"]+"(.*)\},?\s*$/,
        );
        if (!entry || /(?:^|,\s*)dev:\s*true(?:\s*,|\s*$)/.test(entry[2])) continue;
        productionHrefs.push(entry[1]);
      }
      if (productionHrefs.length === 0) {
        note('salvage-plan: screen-index.ts 에서 production route 를 하나도 읽지 못했다');
      }
      const directlyCoveredHrefs = new Set([
        ...Object.values(routes),
        ...Object.entries(rf.unmeasurable ?? {})
          .filter(([id, info]) => id !== '_note' && info && typeof info === 'object')
          .map(([, info]) => info.route)
          .filter(Boolean),
      ]);
      const expectedActualHrefs = productionHrefs.filter(
        (href) => !directlyCoveredHrefs.has(href),
      );
      const actualRoutes = salvage.actualRoutes ?? {};
      compareExactSet(
        'salvage-plan.actualRoutes',
        expectedActualHrefs,
        Object.keys(actualRoutes),
      );

      const allowedStrategies = new Set([
        'adapt-reference',
        'derive-pattern',
        'state-only',
        'redesign',
        'alias',
        'retain',
      ]);
      for (const [href, plan] of Object.entries(actualRoutes)) {
        if (!plan || typeof plan !== 'object') {
          note(`salvage-plan.actualRoutes.${href}: 객체여야 한다`);
          continue;
        }
        if (!allowedStrategies.has(plan.strategy)) {
          note(`salvage-plan.actualRoutes.${href}: 알 수 없는 strategy ${plan.strategy}`);
        }
        if (!Array.isArray(plan.references)) {
          note(`salvage-plan.actualRoutes.${href}: references 는 배열이어야 한다`);
        } else {
          for (const id of plan.references) {
            if (!screenById.has(id)) {
              note(`salvage-plan.actualRoutes.${href}: references 의 ${id} 가 screens.json 에 없다`);
            }
          }
          if (plan.strategy === 'alias' && plan.references.length > 0) {
            note(`salvage-plan.actualRoutes.${href}: alias 는 독립 디자인 reference 를 두지 않는다`);
          }
        }
        for (const field of ['implementation', 'doneWhen']) {
          if (typeof plan[field] !== 'string' || !plan[field].trim()) {
            note(`salvage-plan.actualRoutes.${href}: ${field} 가 비어 있다`);
          }
        }
      }
    }
  }
}

if (fail.length) {
  console.error(`FAIL design-ref (${fail.length})`);
  for (const m of fail) console.error('  - ' + m);
  console.error('  → 캡처를 다시 뜨려면: npx http-server design/pixel_clay_260825 -p 8973 -s &');
  console.error('    BASE_URL=http://localhost:8973 node design/pixel_clay_260825/tools/capture-bundle.mjs');
  process.exit(1);
}
console.log(`OK design-ref: 화면 ${screens.length} (이식 ${screens.filter((s) => s.port === true).length} · 보류 ${screens.filter((s) => s.port === 'deferred').length} · 제외 ${screens.filter((s) => s.port === false).length}) · 캡처/구조 대조 통과 · 토큰 앵커 통과`);
