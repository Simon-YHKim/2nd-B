import { emptyCoverage, incrementCoverage, type Coverage, type LifePeriod } from "../probe";
import { narrativeStarLevel, cellsCoveredIn } from "../narrative-level";
import { livedPeriods } from "../periods";

const LAYERS = ["fact", "feeling", "meaning", "belief", "echo"] as const;

/** 예전 5시기 사용자. 이 벌의 판정은 **바뀌면 안 된다** — 비율 경계를 옛 절대값
 *  12/25 · 5/25 에서 그대로 옮겨왔기 때문이다. */
const LEGACY_FIVE = ["infancy", "school", "twenties", "later", "now"] as const;

/** `periods` 안에서 앞에서부터 n칸을 하나씩 채운다. */
function coverCells(n: number, periods: readonly LifePeriod[]): Coverage {
  let c = emptyCoverage();
  let count = 0;
  for (const p of periods) {
    for (const l of LAYERS) {
      if (count >= n) return c;
      c = incrementCoverage(c, p, l);
      count++;
    }
  }
  return c;
}

describe("narrativeStarLevel (회상 / star2) — 옛 5시기에서 판정이 안 바뀐다", () => {
  const P = LEGACY_FIVE;

  test("empty coverage is L1", () => {
    expect(narrativeStarLevel(emptyCoverage(), P)).toBe(1);
  });

  test("a few covered cells map to L2", () => {
    expect(narrativeStarLevel(coverCells(1, P), P)).toBe(2);
    expect(narrativeStarLevel(coverCells(4, P), P)).toBe(2);
  });

  test("several covered cells map to L3", () => {
    expect(narrativeStarLevel(coverCells(5, P), P)).toBe(3);
    expect(narrativeStarLevel(coverCells(11, P), P)).toBe(3);
  });

  test("broad coverage maps to L4", () => {
    expect(narrativeStarLevel(coverCells(12, P), P)).toBe(4);
    expect(narrativeStarLevel(coverCells(25, P), P)).toBe(4);
  });

  test("coverage never auto-reaches L5 (ratification only)", () => {
    expect(narrativeStarLevel(coverCells(25, P), P)).toBeLessThan(5);
  });
});

describe("분모가 사람마다 다르다 — 이게 이번 변경의 핵심", () => {
  // ⚠ 칸 수를 **박지 않는다.** 2026-08-24 에 별 구조가 바뀌면서 자리 수가 달라졌고
  // (스물다섯 5자리·마흔여섯 6자리), 숫자를 박아뒀더니 구조가 바뀔 때마다 깨졌다.
  // 지키려는 것은 숫자가 아니라 **"분모가 사람마다 다르다"** 는 성질이다.
  const young = livedPeriods(25);
  const older = livedPeriods(46);
  const cells = (ps: readonly string[]) => ps.length * LAYERS.length;

  it("아직 살지 않은 자리는 분모에 안 들어간다", () => {
    expect(young.length).toBeLessThan(older.length);
    expect(young).not.toContain("later"); // 스물다섯에게 30대 이후는 아직 없다
    expect(older).toContain("later");
  });

  it("각자 자기 분모의 48% 를 채우면 L4 다", () => {
    for (const ps of [young, older]) {
      const need = Math.ceil(cells(ps) * 0.48);
      expect(narrativeStarLevel(coverCells(need - 1, ps), ps)).toBeLessThan(4);
      expect(narrativeStarLevel(coverCells(need, ps), ps)).toBe(4);
    }
  });

  it("⚠ 분모를 고정하면 어린 사용자가 구조적으로 불리해진다 (이 변경이 막은 것)", () => {
    // 같은 절대 문턱을 두 사람에게 쓰면, 자리가 적은 쪽에 더 높은 비율을 요구한다.
    const fixed = Math.ceil(cells(older) * 0.48);
    expect(fixed / cells(young)).toBeGreaterThan(fixed / cells(older));
  });

  it("해당 없는 자리에 답이 있어도 세지 않는다", () => {
    let c = emptyCoverage();
    for (const l of LAYERS) c = incrementCoverage(c, "later", l);
    expect(cellsCoveredIn(c, young)).toBe(0);
    expect(narrativeStarLevel(c, young)).toBe(1);
  });

  it("시기 목록이 비면 L1 (0으로 나누지 않는다)", () => {
    expect(narrativeStarLevel(emptyCoverage(), [])).toBe(1);
  });
});
