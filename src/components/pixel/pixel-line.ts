// 선을 **정수 셀**로 놓는다 — PIXEL-CLAY 절대 규칙 1(정수 rect 만).
//
// 곡선을 rect 로 바꾸는 자리가 저장소에 여럿이다(별자리 선, 뮤지엄 타임라인
// 연결선, 성장 그래프…). 각자 계단을 만들면 셀 크기와 이음새가 화면마다 달라져
// "픽셀아트인데 격자가 안 맞는" 상태가 된다. 그래서 계산을 여기 하나로 둔다.
//
// ⚠ 셀 크기를 1로 두면 대각선이 **점선처럼 끊겨 보인다.** 원래 선 굵기가 1
//   안팎이라 그렇다. 규칙을 지키느라 그림을 망가뜨리는 것이므로, 셀은 원래
//   굵기보다 크게 잡는다(대개 2~3).

export interface LineCell {
  x: number;
  y: number;
}

/** 셀 목록에서 중복을 없앤다 — 겹쳐 그리면 알파 없이도 색이 진해 보인다. */
function dedupe(cells: LineCell[]): LineCell[] {
  const seen = new Set<string>();
  const out: LineCell[] = [];
  for (const c of cells) {
    const k = c.x + "," + c.y;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * 두 점 사이 직선을 셀 계단으로(브레젠험).
 *
 * 좌표는 **셀 격자에 스냅된 실좌표**로 돌려준다 — 그대로 `<Rect x y>` 에 넣으면
 * 된다. 격자 밖 값을 넣지 않으므로 안티에일리어싱이 생기지 않는다.
 */
export function stepLine(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cell: number,
): LineCell[] {
  const c = Math.max(1, Math.round(cell));
  let x0 = Math.round(ax / c);
  let y0 = Math.round(ay / c);
  const x1 = Math.round(bx / c);
  const y1 = Math.round(by / c);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out: LineCell[] = [];
  // 안전 상한 — 좌표가 이상해도 무한 루프로 화면을 멈추지 않는다.
  for (let guard = 0; guard < 20000; guard += 1) {
    out.push({ x: x0 * c, y: y0 * c });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/**
 * 2차 베지에를 셀 계단으로.
 *
 * 곡선을 직접 계단으로 만들지 않고 **짧은 직선 여러 개로 쪼갠 뒤** `stepLine`
 * 에 넘긴다. 그래야 직선과 곡선이 같은 격자·같은 이음새를 쓴다.
 *
 * 표본 수는 곡선 길이(제어점 포함 둘레의 근사)에서 정한다 — 짧은 곡선에
 * 100번 표본을 뜨는 낭비도, 긴 곡선이 끊기는 것도 막는다.
 */
export function stepQuad(
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  bx: number,
  by: number,
  cell: number,
): LineCell[] {
  const span = Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy);
  const steps = Math.max(2, Math.min(240, Math.ceil(span / Math.max(1, cell))));
  const cells: LineCell[] = [];
  let px = ax;
  let py = ay;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * ax + 2 * u * t * cx + t * t * bx;
    const y = u * u * ay + 2 * u * t * cy + t * t * by;
    cells.push(...stepLine(px, py, x, y, cell));
    px = x;
    py = y;
  }
  return dedupe(cells);
}

/**
 * 진행률 링 — **사각 테두리**를 도는 셀 목록.
 *
 * `<Circle strokeDasharray>` 로 그리던 원형 진행 표시를 대신한다. 12시에서
 * 시작해 시계방향으로 돈다 — 앞에서부터 n칸을 칠하면 그게 진행률이다.
 *
 * ⚠ 원을 셀로 근사하지 않고 **사각으로 바꾼다.** 24~60px 링에서 원을 셀로
 *   놓으면 계단이 지저분하고, 픽셀아트에서 진행 표시는 원래 사각 테두리다.
 */
export function ringCells(cx: number, cy: number, r: number, cell: number): LineCell[] {
  const c = Math.max(1, Math.round(cell));
  const x0 = cx - r;
  const x1 = cx + r;
  const y0 = cy - r;
  const y1 = cy + r;
  // 12시 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래 → 왼쪽 위 → 12시.
  const out = [
    ...stepLine(cx, y0, x1, y0, c),
    ...stepLine(x1, y0, x1, y1, c),
    ...stepLine(x1, y1, x0, y1, c),
    ...stepLine(x0, y1, x0, y0, c),
    ...stepLine(x0, y0, cx, y0, c),
  ];
  return dedupe(out);
}

/** 여러 점을 잇는 꺾은선. `<Polyline>` 이 하던 일. */
export function stepPolyline(pts: readonly (readonly [number, number])[], cell: number): LineCell[] {
  const cells: LineCell[] = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    cells.push(...stepLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], cell));
  }
  return dedupe(cells);
}
