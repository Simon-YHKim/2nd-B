import {
  pingPong,
  walkerPosition,
  walkFrame,
  walkerFacing,
  isResting,
} from "../walker-path";

const A = { x: 0, y: 0 };
const B = { x: 100, y: 50 };

describe("pingPong", () => {
  it("maps both endpoints to 0 (seamless loop)", () => {
    expect(pingPong(0)).toBe(0);
    expect(pingPong(1)).toBeCloseTo(0, 6);
  });
  it("peaks at the mid-point", () => {
    expect(pingPong(0.5)).toBeCloseTo(1, 6);
  });
  it("wraps values outside [0,1)", () => {
    expect(pingPong(1.25)).toBeCloseTo(pingPong(0.25), 6);
    expect(pingPong(-0.25)).toBeCloseTo(pingPong(0.75), 6);
  });
});

describe("walkerPosition", () => {
  it("sits at `from` at both ends of the loop", () => {
    expect(walkerPosition(0, A, B)).toEqual({ x: 0, y: 0 });
    expect(walkerPosition(1, A, B).x).toBeCloseTo(0, 6);
    expect(walkerPosition(1, A, B).y).toBeCloseTo(0, 6);
  });
  it("reaches `to` at the mid-point", () => {
    const p = walkerPosition(0.5, A, B);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });
  it("lifts the path by the arc at mid-trip and not at the ends", () => {
    expect(walkerPosition(0, A, B, 10).y).toBeCloseTo(0, 6);
    // arc lift is applied at p=0.25 (sin(pi/2*?)) — strictly above the
    // straight-line y there.
    const straight = walkerPosition(0.125, A, B, 0).y;
    const arced = walkerPosition(0.125, A, B, 10).y;
    expect(arced).toBeLessThan(straight);
  });
});

describe("walkFrame", () => {
  it("returns 0 for a single-frame sprite", () => {
    expect(walkFrame(0.3, 1)).toBe(0);
  });
  it("alternates between frames across the loop", () => {
    const frames = new Set<number>();
    for (let i = 0; i < 8; i++) frames.add(walkFrame(i / 8, 2, 8));
    expect(frames).toEqual(new Set([0, 1]));
  });
  it("stays within [0, frameCount)", () => {
    for (let i = 0; i < 20; i++) {
      const f = walkFrame(i / 20, 2, 8);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(2);
    }
  });
});

describe("walkerFacing", () => {
  it("faces toward `to` on the outbound half", () => {
    expect(walkerFacing(0.25, A, B)).toBe(1); // B is to the right
    expect(walkerFacing(0.25, B, A)).toBe(-1); // A is to the left
  });
  it("flips on the return half", () => {
    expect(walkerFacing(0.75, A, B)).toBe(-1);
  });
  it("defaults to +1 for a purely vertical path", () => {
    expect(walkerFacing(0.25, { x: 5, y: 0 }, { x: 5, y: 99 })).toBe(1);
  });
});

describe("isResting", () => {
  it("is true near the turn-around points", () => {
    expect(isResting(0)).toBe(true);
    expect(isResting(0.5)).toBe(true); // mid-trip is the far turn-around
  });
  it("is false mid-stride", () => {
    expect(isResting(0.25)).toBe(false);
  });
});
