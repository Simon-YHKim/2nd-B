import {
  BUTTON_PRESS_MS,
  DRILLDOWN_TRANSITION_MS,
  SCREEN_TRANSITION_DISTANCE_PX,
  SCREEN_TRANSITION_MS,
  pixelMotionDuration,
} from "../pixel-physical";

describe("pixel-physical motion tokens", () => {
  afterEach(() => {
    const g = globalThis as unknown as { matchMedia?: unknown };
    delete g.matchMedia;
  });

  test("keeps interaction timings short and mechanical", () => {
    expect(BUTTON_PRESS_MS).toBe(60);
    expect(DRILLDOWN_TRANSITION_MS).toBe(80);
    expect(SCREEN_TRANSITION_MS).toBe(100);
    expect(SCREEN_TRANSITION_DISTANCE_PX).toBe(8);
  });

  test("collapses motion when reduced motion is requested", () => {
    const g = globalThis as unknown as { matchMedia?: (query: string) => { matches: boolean } };
    g.matchMedia = () => ({ matches: true });
    expect(pixelMotionDuration(SCREEN_TRANSITION_MS)).toBe(0);
    g.matchMedia = () => ({ matches: false });
    expect(pixelMotionDuration(SCREEN_TRANSITION_MS)).toBe(100);
  });
});
