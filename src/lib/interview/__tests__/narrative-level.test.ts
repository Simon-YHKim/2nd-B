import { emptyCoverage, incrementCoverage, type Coverage, type LifePeriod } from "../probe";
import { narrativeStarLevel, cellsCoveredIn } from "../narrative-level";
import { periodIdsForAge } from "../periods";

const LAYERS = ["fact", "feeling", "meaning", "belief", "echo"] as const;

/** 예전 5시기 사용자. 이 벌의 판정은 **바뀌면 안 된다** — 비율 경계를 옛 절대값
 *  12/25 · 5/25 에서 그대로 옮겨왔기 때문이다. */
const LEGACY_FIVE = ["childhood", "teens", "twenties", "thirties", "current"] as const;

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
  test("스물다섯 살은 4시기 20칸이고, 그 안에서 꽉 채우면 L4 다", () => {
    const P = periodIdsForAge(25);
    expect(P).toEqual(["childhood", "teens", "twenties", "current"]);
    // 20칸 × 0.48 = 9.6 -> 10칸부터 L4
    expect(narrativeStarLevel(coverCells(9, P), P)).toBe(3);
    expect(narrativeStarLevel(coverCells(10, P), P)).toBe(4);
    expect(narrativeStarLevel(coverCells(20, P), P)).toBe(4);
  });

  test("마흔여섯 살은 6시기 30칸이라 같은 10칸으로는 아직 L4 가 아니다", () => {
    const P = periodIdsForAge(46);
    expect(P).toHaveLength(6);
    // 30칸 × 0.48 = 14.4 -> 15칸부터
    expect(narrativeStarLevel(coverCells(10, P), P)).toBe(3);
    expect(narrativeStarLevel(coverCells(15, P), P)).toBe(4);
  });

  test("⚠ 25 를 상수로 두면 젊은 사용자가 L4 에 못 닿는다 (이 변경이 막은 것)", () => {
    // 스물다섯 살은 20칸이 전부다. 옛 문턱 12칸은 그 20칸의 60% 이고, 그건
    // 마흔여섯 살에게 요구하던 48% 보다 **더 가혹하다**. 살지 않은 시기를 분모에
    // 넣으면 어린 사용자가 구조적으로 불리해진다 -- 그걸 재현해 둔다.
    const young = periodIdsForAge(25);
    const older = periodIdsForAge(46);
    const youngCells = young.length * LAYERS.length;
    const olderCells = older.length * LAYERS.length;
    expect(youngCells).toBe(20);
    expect(olderCells).toBe(30);
    // 옛 절대 문턱(12)을 그대로 쓰면 두 사람에게 요구하는 비율이 달라진다
    expect(12 / youngCells).toBeGreaterThan(12 / olderCells);
    // 지금은 둘 다 같은 비율을 요구한다
    const youngNeeded = Math.ceil(youngCells * 0.48);
    const olderNeeded = Math.ceil(olderCells * 0.48);
    expect(narrativeStarLevel(coverCells(youngNeeded, young), young)).toBe(4);
    expect(narrativeStarLevel(coverCells(olderNeeded, older), older)).toBe(4);
  });

  test("해당 없는 시기에 답이 있어도 세지 않는다", () => {
    const P = periodIdsForAge(25); // 30대 없음
    let c = emptyCoverage();
    for (const l of LAYERS) c = incrementCoverage(c, "thirties", l);
    expect(cellsCoveredIn(c, P)).toBe(0);
    expect(narrativeStarLevel(c, P)).toBe(1);
  });

  test("시기 목록이 비면 L1 (0으로 나누지 않는다)", () => {
    expect(narrativeStarLevel(emptyCoverage(), [])).toBe(1);
  });
});
