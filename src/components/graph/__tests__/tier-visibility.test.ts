import { scaleBucket, tierVisibility } from "../tier-visibility";

describe("scaleBucket", () => {
  it("returns 0 (far) below 1.15 — includes the default scale of 1", () => {
    expect(scaleBucket(0.5)).toBe(0);
    expect(scaleBucket(1)).toBe(0);
  });
  it("returns 1 (mid) between 1.15 and 1.8", () => {
    expect(scaleBucket(1.2)).toBe(1);
    expect(scaleBucket(1.79)).toBe(1);
  });
  it("returns 2 (close) at or above 1.8", () => {
    expect(scaleBucket(1.8)).toBe(2);
    expect(scaleBucket(2.5)).toBe(2);
  });
});

describe("tierVisibility", () => {
  it("default/far view shows cores + data snowflakes, hides tier-3 sub-menus", () => {
    // Tree redesign (P7): tier-4 Pattern Data snowflakes define the reference's
    // resting state, so they show at home; tier-3 category nodes stay hidden.
    expect(tierVisibility(0.5)).toEqual({ tier1: true, tier2: true, tier3: false, tier4: true });
    expect(tierVisibility(1)).toEqual({ tier1: true, tier2: true, tier3: false, tier4: true });
  });
  it("mid view reveals tier-3 sub-menus", () => {
    expect(tierVisibility(1.3)).toEqual({ tier1: true, tier2: true, tier3: true, tier4: true });
  });
  it("close view keeps everything visible", () => {
    expect(tierVisibility(2.0)).toEqual({ tier1: true, tier2: true, tier3: true, tier4: true });
  });
});
