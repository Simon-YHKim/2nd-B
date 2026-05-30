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
  it("default/far view shows tier 1 + 2 only", () => {
    expect(tierVisibility(0.5)).toEqual({ tier1: true, tier2: true, tier3: false, tier4: false });
    expect(tierVisibility(1)).toEqual({ tier1: true, tier2: true, tier3: false, tier4: false });
  });
  it("mid view adds tier 3", () => {
    expect(tierVisibility(1.3)).toEqual({ tier1: true, tier2: true, tier3: true, tier4: false });
  });
  it("close view adds tier 4", () => {
    expect(tierVisibility(2.0)).toEqual({ tier1: true, tier2: true, tier3: true, tier4: true });
  });
});
