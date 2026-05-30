import {
  clampScale,
  clampPan,
  clampPanFree,
  cameraOffHome,
  panForFocalZoom,
  ZOOM_MIN,
  ZOOM_MAX,
  type Point,
} from "../zoom-math";

describe("clampPanFree (closeout-v3 #3)", () => {
  const vp = { width: 400, height: 600 };
  it("allows panning into cosmic space even at scale 1", () => {
    // slack 1.2 → maxX = 400*1.2 = 480, maxY = 600*1.2 = 720
    expect(clampPanFree({ x: 300, y: -300 }, 1, vp)).toEqual({ x: 300, y: -300 });
    expect(clampPanFree({ x: 9999, y: 9999 }, 1, vp).x).toBeCloseTo(480);
    expect(clampPanFree({ x: 9999, y: 9999 }, 1, vp).y).toBeCloseTo(720);
  });
  it("adds the zoom overflow on top of the slack", () => {
    // scale 2 → overflowX/2 = 200, + slack 480 = 680
    expect(clampPanFree({ x: 9999, y: 0 }, 2, vp).x).toBeCloseTo(680);
  });
});

describe("cameraOffHome (closeout-v3 #4)", () => {
  it("is off-home when far in distance", () => {
    expect(cameraOffHome({ x: 300, y: 0 }, 1).off).toBe(true);
  });
  it("is off-home when zoomed past thresholds", () => {
    expect(cameraOffHome({ x: 0, y: 0 }, 0.6).off).toBe(true);
    expect(cameraOffHome({ x: 0, y: 0 }, 2.0).off).toBe(true);
  });
  it("is home when centered at default scale", () => {
    expect(cameraOffHome({ x: 10, y: 10 }, 1).off).toBe(false);
  });
});

describe("clampScale", () => {
  it("returns value within bounds untouched", () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(1.4)).toBeCloseTo(1.4);
  });
  it("clamps below min", () => {
    expect(clampScale(0.2)).toBe(ZOOM_MIN);
  });
  it("clamps above max", () => {
    expect(clampScale(10)).toBe(ZOOM_MAX);
  });
  it("uses exposed ZOOM_MIN/ZOOM_MAX constants", () => {
    expect(ZOOM_MIN).toBeGreaterThan(0);
    expect(ZOOM_MAX).toBeGreaterThan(ZOOM_MIN);
  });
});

describe("panForFocalZoom — focal-point preserving zoom", () => {
  // Coordinate model:
  //   - `focal` is in screen space (pixels)
  //   - `pan` is the translation applied to the content
  //   - `scale` is the multiplier
  // The visible point under `focal` should not move when the user zooms.
  //
  // Formula: graphX = (focalX - panX) / scale
  //          nextPanX = focalX - graphX * nextScale

  it("keeps focal point stable when scale changes", () => {
    const focal: Point = { x: 200, y: 150 };
    const prevPan: Point = { x: 0, y: 0 };
    const prevScale = 1;
    const nextScale = 2;

    const nextPan = panForFocalZoom(prevScale, nextScale, focal, prevPan);

    // Same graph point projected with new scale + pan should land at focal.
    const graphX = (focal.x - prevPan.x) / prevScale;
    const graphY = (focal.y - prevPan.y) / prevScale;
    const projectedX = graphX * nextScale + nextPan.x;
    const projectedY = graphY * nextScale + nextPan.y;

    expect(projectedX).toBeCloseTo(focal.x);
    expect(projectedY).toBeCloseTo(focal.y);
  });

  it("works with non-zero starting pan", () => {
    const focal: Point = { x: 300, y: 400 };
    const prevPan: Point = { x: -50, y: 30 };
    const prevScale = 1.5;
    const nextScale = 0.75;

    const nextPan = panForFocalZoom(prevScale, nextScale, focal, prevPan);

    const graphX = (focal.x - prevPan.x) / prevScale;
    const graphY = (focal.y - prevPan.y) / prevScale;
    const projectedX = graphX * nextScale + nextPan.x;
    const projectedY = graphY * nextScale + nextPan.y;

    expect(projectedX).toBeCloseTo(focal.x);
    expect(projectedY).toBeCloseTo(focal.y);
  });

  it("returns prevPan unchanged when scale is unchanged", () => {
    const prevPan: Point = { x: 12, y: 34 };
    const next = panForFocalZoom(1.5, 1.5, { x: 100, y: 100 }, prevPan);
    expect(next.x).toBeCloseTo(prevPan.x);
    expect(next.y).toBeCloseTo(prevPan.y);
  });
});

describe("clampPan", () => {
  // Pan is clamped so the content can't drift entirely off-screen.
  // The allowed pan range at a given scale = viewport * (scale - 1) / 2
  // (centered content can drift at most half the overflow in each direction).
  // At scale=1, max pan = 0 (no over-pan when content fits exactly).
  // At scale<1, we still allow zero pan, because shrunk content stays
  // anchored to the center (no need to drag).

  it("clamps to zero at scale=1", () => {
    const out = clampPan({ x: 100, y: 100 }, 1, { width: 400, height: 600 });
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it("clamps to zero when scale < 1", () => {
    const out = clampPan({ x: 50, y: -50 }, 0.7, { width: 400, height: 600 });
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it("allows pan up to half the overflow at scale=2", () => {
    const out = clampPan({ x: 9999, y: -9999 }, 2, { width: 400, height: 600 });
    // overflow x = 400 * (2-1) = 400 → max pan = 200
    expect(out.x).toBeCloseTo(200);
    // overflow y = 600 * (2-1) = 600 → max pan = 300, negated
    expect(out.y).toBeCloseTo(-300);
  });

  it("leaves pan untouched when within bounds", () => {
    const out = clampPan({ x: 10, y: -20 }, 2, { width: 400, height: 600 });
    expect(out).toEqual({ x: 10, y: -20 });
  });
});
