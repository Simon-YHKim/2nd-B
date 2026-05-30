import {
  pingPong,
  walkerPosition,
  walkFrame,
  walkerFacing,
  isResting,
  walkerRoutePose,
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

describe("walkerRoutePose", () => {
  // Unit square, walked clockwise as a closed ring. Perimeter = 40, four
  // equal legs of length 10, so each leg owns a quarter of the cycle.
  const SQUARE = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("degenerates safely for empty / single-point routes", () => {
    expect(walkerRoutePose(0.3, [])).toMatchObject({ x: 0, y: 0, resting: true });
    expect(walkerRoutePose(0.3, [{ x: 4, y: 9 }])).toMatchObject({ x: 4, y: 9, resting: true });
  });

  it("starts at the first waypoint and advances at constant speed", () => {
    expect(walkerRoutePose(0, SQUARE)).toMatchObject({ x: 0, y: 0, seg: 0 });
    // Quarter-cycle = one full leg → sits on the next vertex.
    const q = walkerRoutePose(0.25, SQUARE);
    expect(q.x).toBeCloseTo(10, 6);
    expect(q.y).toBeCloseTo(0, 6);
    // Half-cycle = two legs.
    const h = walkerRoutePose(0.5, SQUARE);
    expect(h.x).toBeCloseTo(10, 6);
    expect(h.y).toBeCloseTo(10, 6);
  });

  it("interpolates the mid-point of a leg", () => {
    const p = walkerRoutePose(0.125, SQUARE); // half of leg 0
    expect(p.x).toBeCloseTo(5, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.seg).toBe(0);
  });

  it("faces the direction of travel (+1 right, -1 left)", () => {
    expect(walkerRoutePose(0.125, SQUARE).facing).toBe(1); // leg 0 goes right
    expect(walkerRoutePose(0.625, SQUARE).facing).toBe(-1); // leg 2 goes left
  });

  it("loops seamlessly (t and t+1 are identical)", () => {
    const a = walkerRoutePose(0.4, SQUARE);
    const b = walkerRoutePose(1.4, SQUARE);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.facing).toBe(a.facing);
  });

  it("lifts the leg mid-point by `arc` (hop), zero at the ends", () => {
    expect(walkerRoutePose(0, SQUARE, { arc: 10 }).y).toBeCloseTo(0, 6);
    expect(walkerRoutePose(0.125, SQUARE, { arc: 10 }).y).toBeCloseTo(-10, 6);
  });

  it("parks at each stop when dwell > 0", () => {
    // Two-point ring: out-and-back, each leg length 10 (total 20). dwell=1 adds
    // one average-leg (10) of rest at each of the 2 stops → cycle length 40.
    const LINE = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    // t=0.3125 → c=12.5 → inside the rest at the far vertex (10,0).
    const rest = walkerRoutePose(0.3125, LINE, { dwell: 1 });
    expect(rest.resting).toBe(true);
    expect(rest.x).toBeCloseTo(10, 6);
    // t=0 → walking out of the first vertex, not resting.
    expect(walkerRoutePose(0, LINE, { dwell: 1 }).resting).toBe(false);
    // Return leg walks leftward. c = 0.625*40 = 25 → mid of the return leg.
    const back = walkerRoutePose(0.625, LINE, { dwell: 1 });
    expect(back.resting).toBe(false);
    expect(back.facing).toBe(-1);
    expect(back.x).toBeCloseTo(5, 6);
  });
});
