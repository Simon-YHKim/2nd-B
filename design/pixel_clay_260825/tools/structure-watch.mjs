// 화면 배치가 **지난번과 달라졌는가**를 본다.
//
//   node structure-watch.mjs <캡처폴더> [--save]
//
// `--save` 없이 돌리면 `data/structure-baseline.json` 과 견주고, 문턱 아래로 떨어진
// 화면을 이름과 함께 알린다. `--save` 로 돌리면 지금 상태를 새 기준선으로 박는다.
//
// ⚠ 이 도구는 **레퍼런스와 대조하지 않는다.** 왜 못 하는지는 `structure.mjs` 머리에
//   적혀 있다(요약: 레퍼런스는 내용이 찬 목업이고 QA 계정은 비어 있어 비교가
//   성립하지 않는다. 눈금 탓이 아니다).
//
// ⚠ 새 기준선을 박기 전에 **자기 짝 찾기부터 통과시킨다.** 두 벌의 캡처가 서로를
//   못 알아보면 그 캡처들이 뭔가 잘못된 것이고, 그걸 기준선으로 삼으면 이후의
//   모든 비교가 조용히 틀린다.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { structureSignature, compareStructures, selfMatchReport } from './structure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, '..', 'data', 'structure-baseline.json');
const SHOTS = process.argv[2];
const SAVE = process.argv.includes('--save');
/** 이보다 낮으면 "배치가 움직였다"고 본다. 같은 데이터의 두 빌드는 0.94~0.99 였다. */
const FLOOR = Number(process.env.STRUCTURE_FLOOR || 0.9);

if (!SHOTS || !existsSync(SHOTS)) {
  console.error('캡처 폴더를 주세요: node structure-watch.mjs <폴더> [--save]');
  process.exit(2);
}

const files = readdirSync(SHOTS).filter((f) => /^(final|app|shot)-.+\.png$/.test(f));
if (!files.length) {
  console.error(`${SHOTS} 에 final-*.png / app-*.png / shot-*.png 가 없습니다.`);
  process.exit(2);
}

const now = {};
for (const f of files) {
  const id = f.replace(/^(final|app|shot)-/, '').replace(/\.png$/, '');
  now[id] = structureSignature(join(SHOTS, f));
}
const ids = Object.keys(now).sort();
console.log(`캡처 ${ids.length}장: ${ids.join(' · ')}`);

if (SAVE) {
  // ⚠ 기준선을 박기 전에 이 캡처들이 서로 구별되는지부터 본다.
  const self = selfMatchReport(now, now);
  if (!self.pass) {
    console.error('⚠ 자기 짝 찾기 실패 — 캡처들이 서로를 못 알아봅니다. 기준선으로 못 씁니다.');
    process.exit(1);
  }
  writeFileSync(BASELINE, JSON.stringify({ savedFrom: SHOTS, screens: now }, null, 2) + '\n');
  console.log(`기준선 저장: ${BASELINE}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`기준선이 없습니다. 먼저 --save 로 만드세요: ${BASELINE}`);
  process.exit(2);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

let moved = 0, missing = 0;
console.log('\n화면          | 지난번과의 일치 | 판정');
for (const id of ids) {
  const b = base.screens[id];
  if (!b) { console.log(`${id.padEnd(13)}| ${'—'.padStart(15)} | 기준선에 없음(새 화면)`); missing++; continue; }
  const s = compareStructures(b, now[id]);
  const ok = s >= FLOOR;
  if (!ok) moved++;
  console.log(`${id.padEnd(13)}| ${s.toFixed(4).padStart(15)} | ${ok ? 'ok' : '⚠ 배치가 움직였다'}`);
}
for (const id of Object.keys(base.screens)) {
  if (!now[id]) { console.log(`${id.padEnd(13)}| ${'—'.padStart(15)} | ⚠ 이번 캡처에 없음`); moved++; }
}

console.log(`\n문턱 ${FLOOR} · 움직인 화면 ${moved}개${missing ? ` · 새 화면 ${missing}개` : ''}`);
if (moved) {
  console.log('의도한 변경이면 `--save` 로 기준선을 갱신하세요. 의도하지 않았다면 그 화면을 보세요.');
  process.exit(1);
}
