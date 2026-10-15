import { prefersReducedMotion } from "../signature";

// 옛 시그니처 모션 스펙(SAVE/CONNECTION/IMAGINE_MOTION · savePopTotalMs)을 지키던 단언 다섯은
// 스펙과 함께 2026-10-05 E:/Legacy/2ndB 로 갔다(QA R2E-12). 남은 것은 reduced-motion 판정이다.
describe("prefersReducedMotion (reduced-motion chokepoint)", () => {
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
