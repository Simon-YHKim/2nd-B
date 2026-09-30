import { createCameraRemote, zoomFromPosition, zoomToPosition } from '../camera-remote';
import { starCameraFlight, starDestinationFrame, starFocusZoom, STAR_CAMERA_STOPS, STAR_FOCUS_BREATH } from '../star-camera';
import { sampleTelescopeMotion } from '../telescope-preview';
import { SKY_ZOOM_MAX, SKY_ZOOM_MIN, SKY_ZOOM_STOPS, clampZoom, dialBaseline, telescopeDial, zoomLabel } from '../telescope-dial';

// Simon 2026-09-30: "별을 터치했을때 확대 되는 수준과 … 사용자가 제어해서 확대했을때의 배율 숫자가
// 달라. 둘이 비율이 똑같이 움직였으면 좋겠어. 기준은 별을 눌렀을때 처럼. … 0보다 아래는 눈금이
// 안보이게 하고, 10배율을 최대로 한 뒤에, 10보다 큰건 눈금이 안보이게 하자."

const RAIL = 235; // slider width measured at a 425px-wide window
const dialAt = (zoom: number, railWidth = RAIL, maxZoom = SKY_ZOOM_MAX, stops = SKY_ZOOM_STOPS) =>
  telescopeDial({ railWidth, zoom, minZoom: SKY_ZOOM_MIN, maxZoom, stops, tickSpacing: 6, rangeRatio: 0.72 });

// The star radius ConstellationHome passes at k = 1 (pixelStarSpan(8 * 1.6) = 13).
const STAR_RADIUS = 13;
const WORLD = { width: 380, height: 366 };

describe('one magnification scale for the home sky', () => {
  test('the scale is 1x..10x with landmarks at both ends', () => {
    expect(SKY_ZOOM_MIN).toBe(1);
    expect(SKY_ZOOM_MAX).toBe(10);
    expect(SKY_ZOOM_STOPS[0]).toBe(SKY_ZOOM_MIN);
    expect(SKY_ZOOM_STOPS[SKY_ZOOM_STOPS.length - 1]).toBe(SKY_ZOOM_MAX);
    expect(dialAt(1).marks.map((m) => m.label)).toEqual(['1', '2', '3', '5', '10']);
  });

  // Viewports: a 320px phone, the 425px phone used for QA, and desktop windows. At 1440x900
  // the ideal fill is 10.81x (measured in the browser before this change), above the ceiling.
  test.each([[320, 480], [425, 565], [768, 700], [1440, 690], [1920, 930]])(
    'a star tap at %ix%i stays on the scale, including the focus breath', (width, height) => {
      const viewport = { width, height };
      for (const camera of [{ x: 0, y: 0, zoom: 1 }, { x: 30, y: -20, zoom: 4 }, { x: -10, y: 5, zoom: SKY_ZOOM_MAX }]) {
        const flight = starCameraFlight({ x: 230, y: 131 }, camera, WORLD, viewport, 0, STAR_RADIUS);
        for (const z of flight.zoom) {
          expect(z).toBeGreaterThanOrEqual(SKY_ZOOM_MIN);
          expect(z).toBeLessThanOrEqual(SKY_ZOOM_MAX);
        }
        // The star's light exactly fills the reticle it lands in, capped or not.
        expect(STAR_RADIUS * flight.zoom[4]).toBeCloseTo(flight.radius);
        expect(flight.diameter).toBeCloseTo(flight.radius * 2);
        expect(flight.radius).toBeLessThanOrEqual(starDestinationFrame(viewport).radius + 1e-9);
      }
    },
  );

  test('below the ceiling the tap still fills the whole frame and breathes; at the ceiling it holds', () => {
    const phone = starDestinationFrame({ width: 425, height: 565 });
    expect(starFocusZoom(phone.radius, STAR_RADIUS)).toBeCloseTo(phone.radius / STAR_RADIUS);
    expect(starFocusZoom(phone.radius, STAR_RADIUS)).toBeCloseTo(6.953, 3);
    const desk = starDestinationFrame({ width: 1920, height: 930 });
    expect(desk.radius / STAR_RADIUS).toBeGreaterThan(SKY_ZOOM_MAX);
    expect(starFocusZoom(desk.radius, STAR_RADIUS)).toBe(SKY_ZOOM_MAX);
    const held = starCameraFlight({ x: 230, y: 131 }, { x: 0, y: 0, zoom: 1 }, WORLD, { width: 1920, height: 930 }, 0, STAR_RADIUS);
    expect(held.zoom.slice(2)).toEqual([SKY_ZOOM_MAX, SKY_ZOOM_MAX, SKY_ZOOM_MAX]);
    expect(held.radius).toBe(STAR_RADIUS * SKY_ZOOM_MAX);
    const free = starCameraFlight({ x: 230, y: 131 }, { x: 0, y: 0, zoom: 1 }, WORLD, { width: 425, height: 565 }, 0, STAR_RADIUS);
    expect(free.zoom[3]).toBeCloseTo(free.zoom[2] * STAR_FOCUS_BREATH);
    expect(free.radius).toBe(phone.radius);
  });

  test('the dial reads a star tap and the manual controls on the same ruler', () => {
    const flight = starCameraFlight({ x: 230, y: 131 }, { x: 0, y: 0, zoom: 1 }, WORLD, { width: 425, height: 565 }, 0, STAR_RADIUS);
    const track = { stops: STAR_CAMERA_STOPS, x: flight.x, y: flight.y, zoom: flight.zoom };
    // What the dial shows once the tap settles is the world's own scale, not a second multiplier.
    const settled = sampleTelescopeMotion(track, 1, 0.99).zoom;
    expect(settled).toBe(flight.zoom[4]);

    // Drive the manual remote to the same number.
    const frames: ((t: number) => void)[] = [];
    let now = 0;
    let manual = 1;
    const remote = createCameraRemote({
      zoom: 1, minZoom: SKY_ZOOM_MIN, maxZoom: SKY_ZOOM_MAX,
      onZoom: (z) => { manual = z; }, onMove: () => {},
      requestFrame: (cb) => frames.push(cb), cancelFrame: () => {},
    });
    remote.setZoom(settled);
    for (let i = 0; i < 240 && frames.length; i++) { now += 1000 / 60; frames.splice(0).forEach((cb) => cb(now)); }
    expect(manual).toBeCloseTo(settled, 6);

    const byTap = dialAt(settled);
    const byHand = dialAt(manual);
    expect(byHand.offset).toBe(byTap.offset);
    expect(byHand.marks).toEqual(byTap.marks);
    expect(byHand.ticks).toEqual(byTap.ticks);
    // And the same ruler step per magnification everywhere: every flight frame lands where
    // the manual dial would put that number.
    for (const progress of [0.45, 0.6, 0.8, 0.9, 1]) {
      const z = sampleTelescopeMotion(track, progress, progress - 0.01).zoom;
      expect(dialAt(z).offset).toBe(Math.round(RAIL / 2 - RAIL - zoomToPosition(z, 1, 10) * RAIL * 0.72));
    }
  });

  test('the manual controls reach exactly 10x and no further', () => {
    const frames: ((t: number) => void)[] = [];
    let now = 0;
    let manual = 1;
    const remote = createCameraRemote({
      zoom: 1, minZoom: SKY_ZOOM_MIN, maxZoom: SKY_ZOOM_MAX,
      onZoom: (z) => { manual = z; }, onMove: () => {},
      requestFrame: (cb) => frames.push(cb), cancelFrame: () => {},
    });
    remote.setZoom(50);
    for (let i = 0; i < 240 && frames.length; i++) { now += 1000 / 60; frames.splice(0).forEach((cb) => cb(now)); }
    expect(manual).toBe(SKY_ZOOM_MAX);
    expect(zoomFromPosition(1, SKY_ZOOM_MIN, SKY_ZOOM_MAX)).toBe(SKY_ZOOM_MAX);
    expect(clampZoom(10.81, SKY_ZOOM_MIN, SKY_ZOOM_MAX)).toBe(SKY_ZOOM_MAX);
    expect(clampZoom(Number.NaN, SKY_ZOOM_MIN, SKY_ZOOM_MAX)).toBe(SKY_ZOOM_MIN);
  });
});

describe('dial graduations stay inside the range', () => {
  const zooms = [1, 1.07, 1.5, 2, 3, 4.4, 6.953, 9.2, 10];
  test.each([96, 140, 235, 300])('rail %ipx: nothing below the minimum or above the maximum', (rail) => {
    for (const zoom of zooms) {
      const dial = dialAt(zoom, rail);
      const min = dial.marks[0];
      const max = dial.marks[dial.marks.length - 1];
      expect(min.value).toBe(SKY_ZOOM_MIN);
      expect(max.value).toBe(SKY_ZOOM_MAX);
      expect(dial.start).toBe(min.x);
      expect(dial.end).toBe(max.x);
      for (const tick of dial.ticks) {
        expect(tick.x).toBeGreaterThanOrEqual(min.x);
        expect(tick.x).toBeLessThanOrEqual(max.x);
        expect(Number.isInteger(tick.x)).toBe(true);
        // Culled to what the rail can show.
        expect(tick.x + dial.offset).toBeGreaterThanOrEqual(-2);
        expect(tick.x + dial.offset).toBeLessThanOrEqual(rail + 2);
      }
      for (const run of dialBaseline(dial.start, dial.end + 2, dial.offset, rail, 4, () => 'shade')) {
        expect(run.x).toBeGreaterThanOrEqual(min.x);
        expect(run.x + run.width).toBeLessThanOrEqual(max.x + 2);
        expect(Number.isInteger(run.x) && Number.isInteger(run.width)).toBe(true);
      }
      expect(Number.isInteger(dial.offset)).toBe(true);
      expect(dial.marks.every((mark) => Number.isInteger(mark.x))).toBe(true);
    }
  });

  test('at 1x the ruler starts under the index and at 10x it ends there', () => {
    const centre = RAIL / 2;
    const low = dialAt(1);
    expect(Math.abs(low.start + low.offset - centre)).toBeLessThanOrEqual(1);
    expect(Math.min(...low.ticks.map((t) => t.x + low.offset))).toBeGreaterThanOrEqual(centre - 1);
    const high = dialAt(10);
    expect(Math.abs(high.end + high.offset - centre)).toBeLessThanOrEqual(1);
    expect(Math.max(...high.ticks.map((t) => t.x + high.offset))).toBeLessThanOrEqual(centre + 1);
  });

  test('the landmark for the current magnification sits under the index', () => {
    for (const mark of dialAt(1).marks) {
      const dial = dialAt(mark.value);
      const here = dial.marks.find((m) => m.value === mark.value)!;
      expect(Math.abs(here.x + dial.offset - RAIL / 2)).toBeLessThanOrEqual(1);
    }
  });

  test('a flight past the maximum no longer stretches the ruler', () => {
    // Before 2026-09-30 the dial used max(maxZoom, ...flight zooms) as its range, so a
    // 7.13x flight turned 3x into a mid-ruler landmark and printed "7.126903846153845×".
    const dial = dialAt(12);
    expect(dial.marks.map((m) => m.value)).toEqual([1, 2, 3, 5, 10]);
    expect(dial.offset).toBe(dialAt(10).offset);
  });

  test('other telescope screens keep their own range, labelled without float noise', () => {
    const graph = dialAt(2.6, RAIL, 2.6, [1, 2, 3, 5]);
    expect(graph.marks.map((m) => m.label)).toEqual(['1', '2', '2.6']);
    expect(zoomLabel(7.126903846153845)).toBe('7.1');
    expect(zoomLabel(10)).toBe('10');
    expect(zoomLabel(2.6)).toBe('2.6');
  });

  test('the baseline is a handful of merged shade runs, not one rect per cell', () => {
    const shade = (fraction: number) => (Math.min(fraction, 1 - fraction) < 0.12 ? 'edge' : 'body');
    const dial = dialAt(3);
    const runs = dialBaseline(dial.start, dial.end + 2, dial.offset, RAIL, 4, shade);
    expect(runs.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].shade).not.toBe(runs[i - 1].shade);
      expect(runs[i].x).toBe(runs[i - 1].x + runs[i - 1].width);
    }
    const cells = Math.ceil(RAIL / 4);
    expect(runs.length).toBeLessThan(cells);
  });
});
