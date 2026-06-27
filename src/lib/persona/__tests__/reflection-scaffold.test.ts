import { reflectionScaffold } from "../reflection-scaffold";

describe("reflectionScaffold", () => {
  test("offers exactly two modelled steps + a title + a CTA, per locale", () => {
    for (const locale of ["en", "ko"] as const) {
      const s = reflectionScaffold(locale);
      expect(s.steps).toHaveLength(2);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.cta.length).toBeGreaterThan(0);
      expect(s.steps.every((t) => t.trim().length > 0)).toBe(true);
    }
  });

  test("step 1 models grounding the read in a concrete recent moment", () => {
    expect(reflectionScaffold("en").steps[0]).toMatch(/recall|moment/i);
    expect(reflectionScaffold("ko").steps[0]).toMatch(/순간|떠올려/);
  });

  test("step 2 embeds the anti-Barnum check (find what does NOT fit)", () => {
    expect(reflectionScaffold("en").steps[1]).toMatch(/doesn't fit|different/i);
    expect(reflectionScaffold("ko").steps[1]).toMatch(/맞지 않는|다른/);
  });
});
