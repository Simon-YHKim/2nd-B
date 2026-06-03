import { crewCountForDensity } from "../crew-density";

describe("crewCountForDensity", () => {
  test("none → always 0", () => {
    expect(crewCountForDensity("none", 100)).toBe(0);
    expect(crewCountForDensity("none", 0)).toBe(0);
  });

  test("scales with node count, within per-density clamps", () => {
    // few: ratio 0.1, min 1, max 3
    expect(crewCountForDensity("few", 0)).toBe(1); // min floor
    expect(crewCountForDensity("few", 100)).toBe(3); // max cap
    // some: ratio 0.25, min 2, max 6
    expect(crewCountForDensity("some", 0)).toBe(2);
    expect(crewCountForDensity("some", 12)).toBe(3);
    expect(crewCountForDensity("some", 100)).toBe(6);
    // many: ratio 0.5, min 3, max 12
    expect(crewCountForDensity("many", 4)).toBe(3); // min floor
    expect(crewCountForDensity("many", 100)).toBe(12);
  });

  test("hardCap (LOD ceiling) wins", () => {
    expect(crewCountForDensity("many", 100, { hardCap: 5 })).toBe(5);
  });

  test("lowEnd halves the count and tightens the default ceiling", () => {
    expect(crewCountForDensity("many", 100, { lowEnd: true })).toBe(4); // 12/2=6 → cap 4
    expect(crewCountForDensity("some", 100, { lowEnd: true })).toBe(3); // 6/2=3
  });

  test("never negative; floors fractional node counts", () => {
    expect(crewCountForDensity("some", -5)).toBe(2);
    expect(crewCountForDensity("few", 3.9)).toBe(1);
  });
});
