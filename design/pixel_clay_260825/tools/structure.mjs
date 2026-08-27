// 화면의 **레이아웃 점유**를 이미지에서 뽑는다.
//
// ## 이 눈금은 무엇을 위한 것인가 — 레퍼런스 대조가 아니라 **회귀 감시**다
//
// 처음에는 P1 채점기의 C축(레퍼런스와의 구조 일치)을 이걸로 되살리려 했다.
// 실측 결과 **그건 안 된다.** 그런데 안 되는 이유가 눈금이 아니었다:
//
//   앱 캡처 6장 ↔ 레퍼런스 6장   : 자기 짝 찾기 **2/6** (24개 설정 중 최고)
//   앱 캡처 6장 ↔ 앱 캡처 6장    : 자기 짝 찾기 **6/6** (24개 설정 **전부**, 벌어짐 +0.60~+0.92)
//
// 같은 데이터끼리 재면 완벽하고, 레퍼런스와 재면 무너진다. 즉 **눈금이 아니라
// 비교가 성립하지 않는다** — 레퍼런스는 내용이 채워진 목업이고 우리 QA 계정은
// 비어 있다. 없는 말풍선·없는 목록의 자리를 이미지로 맞출 방법은 없다.
//
// ⚠ 그러니 **더 영리한 이미지 눈금을 찾지 말 것.** 레퍼런스와 구조를 대조하고
//   싶으면 먼저 **비교 가능한 내용을 계정에 넣어야** 한다. 그건 측정 설계 결정이라
//   도구가 혼자 정할 일이 아니다.
//
// 대신 이 눈금은 **이 화면이 지난번과 달라졌는가**를 아주 잘 잡는다. 개선 루프에
// 정작 필요한 것이 그것이다 — "내가 고친 것 말고 다른 데가 움직였는가".
//
// ## 어떻게 뽑나
//
// 화면을 굵은 격자로 나누고 칸마다 **밝기의 표준편차**를 잰다. 평평한 바탕은 0 에
// 가깝고 글자·아이콘·테두리가 있으면 커진다. 글줄 하나가 밀려도 칸은 잘 안 바뀐다
// (앞선 밴드 눈금이 실패한 이유가 정확히 글줄을 셌기 때문이다).
//
// 기본값 10x20 + 상관계수: 대조 시험에서 벌어짐이 가장 컸다(+0.917).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

export const DEFAULT_COLS = 10;
export const DEFAULT_ROWS = 20;

function lum(png, x, y) {
  const i = (png.width * y + x) << 2;
  return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
}

/**
 * 격자 서명. 칸마다 밝기 표준편차.
 *
 * @param {Buffer|string} src PNG 버퍼 또는 경로
 * @returns {{cols:number, rows:number, cells:number[]}}
 */
export function structureSignature(src, { cols = DEFAULT_COLS, rows = DEFAULT_ROWS, step = 2 } = {}) {
  const png = PNG.sync.read(typeof src === 'string' ? readFileSync(src) : src);
  const cells = [];
  const cw = png.width / cols, ch = png.height / rows;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor(gx * cw), x1 = Math.min(png.width, Math.ceil((gx + 1) * cw));
      const y0 = Math.floor(gy * ch), y1 = Math.min(png.height, Math.ceil((gy + 1) * ch));
      let n = 0, s = 0, s2 = 0;
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const v = lum(png, x, y);
          s += v; s2 += v * v; n++;
        }
      }
      cells.push(n ? +Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)).toFixed(3) : 0);
    }
  }
  return { cols, rows, cells };
}

/** 두 서명이 얼마나 같은 배치인가. -1~1 (상관계수). 격자가 다르면 던진다. */
export function compareStructures(a, b) {
  if (a.cols !== b.cols || a.rows !== b.rows) {
    throw new Error(`격자가 다르다: ${a.cols}x${a.rows} vs ${b.cols}x${b.rows}`);
  }
  const x = a.cells, y = b.cells, n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const u = x[i] - mx, v = y[i] - my;
    num += u * v; dx += u * u; dy += v * v;
  }
  return dx && dy ? +(num / Math.sqrt(dx * dy)).toFixed(4) : 0;
}

/**
 * **자기 짝 찾기** — 이 눈금을 쓰기 전에 반드시 통과시킬 검사.
 *
 * 두 벌의 캡처(같은 화면들)를 주고, 한쪽의 각 화면이 다른 쪽에서 자기 짝을 고르는지
 * 본다. 하나라도 놓치면 그 눈금으로는 화면을 채점할 수 없다.
 *
 * ⚠ 이 검사를 건너뛰지 말 것. 앞선 밴드 눈금은 **0/6** 이었는데도 7.6~9.4/20 이라는
 *   그럴듯한 점수를 내고 있었다. **판별력 없는 자는 0점보다 나쁘다.**
 *
 * @param {Record<string, object>} setA id -> 서명
 * @param {Record<string, object>} setB id -> 서명
 */
export function selfMatchReport(setA, setB) {
  const ids = Object.keys(setA).filter((id) => setB[id]);
  const rows = ids.map((id) => {
    const scored = ids
      .map((other) => ({ id: other, score: compareStructures(setA[other], setB[id]) }))
      .sort((p, q) => q.score - p.score);
    return {
      id,
      picked: scored[0].id,
      pickedScore: scored[0].score,
      selfScore: scored.find((s) => s.id === id).score,
      ok: scored[0].id === id,
    };
  });
  const hit = rows.filter((r) => r.ok).length;
  const same = rows.reduce((n, r) => n + r.selfScore, 0) / (rows.length || 1);
  let cross = 0, crossN = 0;
  for (const id of ids) for (const other of ids) {
    if (other === id) continue;
    cross += compareStructures(setA[other], setB[id]); crossN++;
  }
  return {
    total: ids.length,
    hit,
    pass: ids.length > 0 && hit === ids.length,
    sameAvg: +same.toFixed(4),
    crossAvg: crossN ? +(cross / crossN).toFixed(4) : 0,
    gap: +(same - (crossN ? cross / crossN : 0)).toFixed(4),
    rows,
  };
}
