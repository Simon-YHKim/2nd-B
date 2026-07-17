import {
  SAVE_MOTION,
  CONNECTION_MOTION,
  IMAGINE_MOTION,
  savePopTotalMs,
  prefersReducedMotion,
} from "../signature";

describe("signature motion specs", () => {
  test("save pop never exceeds the 1.25x bounce cap from DESIGN.md", () => {
    expect(SAVE_MOTION.overshootScale).toBeLessThanOrEqual(1.25);
    expect(SAVE_MOTION.startScale).toBeLessThan(1);
  });

  test("save pop total lands at ~400ms", () => {
    expect(savePopTotalMs()).toBe(400);
  });

  test("connection illumination goes dim → bright over ~500ms", () => {
    expect(CONNECTION_MOTION.fromOpacity).toBeLessThan(CONNECTION_MOTION.toOpacity);
    expect(CONNECTION_MOTION.durationMs).toBe(500);
  });

  test("imagine pulse stays subtle — scale ceiling 1.05, opacity in range", () => {
    expect(IMAGINE_MOTION.maxScale).toBeLessThanOrEqual(1.05);
    expect(IMAGINE_MOTION.minOpacity).toBeLessThan(IMAGINE_MOTION.peakOpacity);
    expect(IMAGINE_MOTION.restOpacity).toBeGreaterThanOrEqual(IMAGINE_MOTION.minOpacity);
    expect(IMAGINE_MOTION.restOpacity).toBeLessThanOrEqual(IMAGINE_MOTION.peakOpacity);
  });

  test("each moment is anchored to its character accent", () => {
    expect(SAVE_MOTION.accent).toBe("lulu");
    expect(CONNECTION_MOTION.accent).toBe("archi");
    expect(IMAGINE_MOTION.accent).toBe("secondb"); // Vela retired (imagine folded into Divergent); legacy motion dormant
  });

  test("prefersReducedMotion is false when matchMedia is unavailable (native)", () => {
    const g = globalThis as unknown as { matchMedia?: unknown };
    const original = g.matchMedia;
    delete g.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
    if (original !== undefined) g.matchMedia = original;
  });

  test("prefersReducedMotion reflects matchMedia when present (web)", () => {
    const g = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } };
    const original = g.matchMedia;
    g.matchMedia = () => ({ matches: true });
    expect(prefersReducedMotion()).toBe(true);
    g.matchMedia = () => ({ matches: false });
    expect(prefersReducedMotion()).toBe(false);
    if (original !== undefined) g.matchMedia = original;
    else delete g.matchMedia;
  });
});
