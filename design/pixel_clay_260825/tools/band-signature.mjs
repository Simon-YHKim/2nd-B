// 화면의 **세로 리듬**을 이미지에서 뽑는다 — C축(구조 일치)의 눈금.
//
// ## 왜 DOM 이 아니라 이미지인가
//
// 레퍼런스 구조 다이제스트는 얕은 DOM 이고 앱은 RN-web 이라 같은 화면을 View 로
// 겹겹이 싼다. 그래서 "폭이 넓은 블록"을 세면 앱이 27~41 개, 레퍼런스가 몇 개로
// 잡혀 **디자인 차이가 아니라 렌더 엔진 차이**를 재게 된다. 깊이를 잘라도 안 맞는다.
//
// 픽셀에는 그 비대칭이 없다. 두 화면 모두 **가로 밴드의 나열**이고, 밴드가
// 어디서 시작하고 끝나는지는 엔진과 무관하다.
//
// ## 무엇을 밴드로 보나
//
// 행마다 "내용이 있는 정도"(가로 방향 밝기 변화량)를 재서, 그 값이 문턱을 넘는
// 구간을 밴드로 묶는다. 바탕만 있는 행은 변화량이 0 에 가깝다.
//
// ⚠ 절대 위치가 아니라 **비율**로 낸다. 화면 높이가 다르면 위치는 달라도 리듬은
//   같을 수 있다.
// ⚠ 밴드 사이의 빈 구간(여백)도 같이 낸다 — PIXEL-CLAY 에서 여백은 리듬의 일부다.
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

/** 한 행의 가로 방향 변화량. 바탕만 있으면 0 에 가깝다. */
function rowEnergy(png, y) {
  let acc = 0;
  const w = png.width;
  let prev = null;
  for (let x = 0; x < w; x += 2) {
    const i = (w * y + x) << 2;
    const lum = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    if (prev !== null) acc += Math.abs(lum - prev);
    prev = lum;
  }
  return acc / (w / 2);
}

/**
 * 이미지의 밴드 서명. `[{start, end}]` 를 **높이 비율**로 낸다.
 *
 * @param {Buffer|string} src PNG 버퍼 또는 경로
 * @param {{threshold?: number, minBand?: number}} opts
 */
export function bandSignature(src, opts = {}) {
  const png = PNG.sync.read(typeof src === 'string' ? readFileSync(src) : src);
  const threshold = opts.threshold ?? 2.0;
  const minBand = opts.minBand ?? 6; // 이보다 얇은 밴드는 잡음으로 본다

  const energy = [];
  for (let y = 0; y < png.height; y++) energy.push(rowEnergy(png, y));

  const bands = [];
  let start = null;
  for (let y = 0; y < png.height; y++) {
    const on = energy[y] > threshold;
    if (on && start === null) start = y;
    if (!on && start !== null) {
      if (y - start >= minBand) bands.push({ start, end: y });
      start = null;
    }
  }
  if (start !== null && png.height - start >= minBand) bands.push({ start, end: png.height });

  return {
    height: png.height,
    bands: bands.map((b) => ({
      start: +(b.start / png.height).toFixed(4),
      end: +(b.end / png.height).toFixed(4),
    })),
  };
}

/**
 * 두 서명이 얼마나 같은 리듬인가. 0~1.
 *
 * 개수와 겹침을 반반으로 본다:
 *   - 개수: 밴드 수가 얼마나 가까운가
 *   - 겹침: 짝지은 밴드들이 세로로 얼마나 겹치는가(IoU 평균)
 *
 * ⚠ 순서를 유지한 채 짝짓는다. 정렬해서 짝지으면 위아래가 뒤바뀐 화면도 만점이 된다.
 */
export function compareSignatures(refSig, appSig) {
  const a = refSig.bands;
  const b = appSig.bands;
  if (a.length === 0 && b.length === 0) return { score: 1, countScore: 1, overlapScore: 1, refBands: 0, appBands: 0 };
  if (a.length === 0 || b.length === 0) return { score: 0, countScore: 0, overlapScore: 0, refBands: a.length, appBands: b.length };

  const countScore = 1 - Math.min(1, Math.abs(a.length - b.length) / Math.max(a.length, b.length));

  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const inter = Math.max(0, Math.min(a[i].end, b[i].end) - Math.max(a[i].start, b[i].start));
    const union = Math.max(a[i].end, b[i].end) - Math.min(a[i].start, b[i].start);
    sum += union > 0 ? inter / union : 0;
  }
  const overlapScore = sum / n;

  return {
    score: +(countScore * 0.5 + overlapScore * 0.5).toFixed(4),
    countScore: +countScore.toFixed(4),
    overlapScore: +overlapScore.toFixed(4),
    refBands: a.length,
    appBands: b.length,
  };
}
