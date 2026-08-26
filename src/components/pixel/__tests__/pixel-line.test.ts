// 선을 셀로 놓는 계산이 **격자를 벗어나지 않는가**.
//
// 이 계산이 틀리면 증상이 조용하다 — 화면은 뜨고 선도 보이는데 반 픽셀씩
// 어긋나 흐려진다. 그게 규칙 1 이 없애려는 것 그 자체라, 눈으로는 잡기 어렵고
// 검사로 잡아야 한다.
import { stepLine, stepQuad, stepPolyline } from "../pixel-line";

const onGrid = (cells: { x: number; y: number }[], cell: number) =>
  cells.every((c) => Number.isInteger(c.x / cell) && Number.isInteger(c.y / cell));

describe("픽셀 선", () => {
  it("직선의 모든 셀이 격자 위에 있다", () => {
    const cells = stepLine(3, 7, 91, 53, 3);
    expect(cells.length).toBeGreaterThan(10);
    expect(onGrid(cells, 3)).toBe(true);
  });

  it("직선은 양 끝을 포함한다", () => {
    const cells = stepLine(0, 0, 30, 30, 3);
    expect(cells[0]).toEqual({ x: 0, y: 0 });
    expect(cells[cells.length - 1]).toEqual({ x: 30, y: 30 });
  });

  it("한 점짜리 선도 죽지 않는다", () => {
    expect(stepLine(12, 12, 12, 12, 3)).toEqual([{ x: 12, y: 12 }]);
  });

  it("곡선의 모든 셀이 격자 위에 있다", () => {
    const cells = stepQuad(0, 100, 200, 20, 400, 100, 4);
    expect(cells.length).toBeGreaterThan(20);
    expect(onGrid(cells, 4)).toBe(true);
  });

  it("곡선은 실제로 휜다 — 직선과 다른 셀을 지난다", () => {
    // 제어점을 크게 띄운 곡선이 같은 두 끝점의 직선과 같은 자취면
    // 표본이 안 뜨이고 있다는 뜻이다(조용히 직선이 된다).
    const curve = stepQuad(0, 100, 200, 0, 400, 100, 4);
    const line = stepLine(0, 100, 400, 100, 4);
    const key = (c: { x: number; y: number }) => c.x + "," + c.y;
    const lineKeys = new Set(line.map(key));
    expect(curve.some((c) => !lineKeys.has(key(c)))).toBe(true);
  });

  it("셀이 겹쳐 나오지 않는다 — 겹치면 알파 없이도 색이 진해진다", () => {
    const cells = stepQuad(0, 0, 40, 80, 120, 0, 4);
    const keys = cells.map((c) => c.x + "," + c.y);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("꺾은선은 마디를 모두 지난다", () => {
    const pts = [
      [0, 0],
      [30, 30],
      [60, 0],
    ] as const;
    const cells = stepPolyline(pts, 3);
    const has = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
    expect(has(0, 0)).toBe(true);
    expect(has(30, 30)).toBe(true);
    expect(has(60, 0)).toBe(true);
  });

  it("셀 크기가 1보다 작아도 격자를 만든다", () => {
    // 호출부가 0 이나 음수를 넘겨도 무한 루프나 NaN 이 되면 안 된다.
    expect(onGrid(stepLine(0, 0, 10, 10, 0), 1)).toBe(true);
    expect(stepLine(0, 0, 10, 10, -3).length).toBeGreaterThan(0);
  });
});
