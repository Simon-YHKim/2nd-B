import { emptyCoverage, incrementCoverage, type Coverage } from "../probe";
import { narrativeStarLevel } from "../narrative-level";

const PERIODS = ["childhood", "teens", "twenties", "thirties", "current"] as const;
const LAYERS = ["fact", "feeling", "meaning", "belief", "echo"] as const;

// Cover the first N of the 25 cells with one answer each.
function coverCells(n: number): Coverage {
  let c = emptyCoverage();
  let count = 0;
  for (const p of PERIODS) {
    for (const l of LAYERS) {
      if (count >= n) return c;
      c = incrementCoverage(c, p, l);
      count++;
    }
  }
  return c;
}

describe("narrativeStarLevel (회상 / star2)", () => {
  test("empty coverage is L1", () => {
    expect(narrativeStarLevel(emptyCoverage())).toBe(1);
  });

  test("a few covered cells map to L2", () => {
    expect(narrativeStarLevel(coverCells(1))).toBe(2);
    expect(narrativeStarLevel(coverCells(4))).toBe(2);
  });

  test("several covered cells map to L3", () => {
    expect(narrativeStarLevel(coverCells(5))).toBe(3);
    expect(narrativeStarLevel(coverCells(11))).toBe(3);
  });

  test("broad coverage maps to L4", () => {
    expect(narrativeStarLevel(coverCells(12))).toBe(4);
    expect(narrativeStarLevel(coverCells(25))).toBe(4);
  });

  test("coverage never auto-reaches L5 (ratification only)", () => {
    expect(narrativeStarLevel(coverCells(25))).toBeLessThan(5);
  });
});
