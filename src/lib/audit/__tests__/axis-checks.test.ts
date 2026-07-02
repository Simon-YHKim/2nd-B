import { AXIS_CHECKS } from "../axis-checks";
import { labelFramework } from "../frameworkLabels";

describe("axis checks (P3b 동기/강점/가치관)", () => {
  test("three axes, six questions each, EN+KO complete", () => {
    expect(Object.keys(AXIS_CHECKS).sort()).toEqual(["motivation", "strengths", "values"]);
    for (const check of Object.values(AXIS_CHECKS)) {
      expect(check.questions).toHaveLength(6);
      expect(check.title.en.length).toBeGreaterThan(0);
      expect(check.title.ko.length).toBeGreaterThan(0);
      expect(check.intro.en.length).toBeGreaterThan(0);
      expect(check.intro.ko.length).toBeGreaterThan(0);
      for (const q of check.questions) {
        expect(q.prompt.en.length).toBeGreaterThan(10);
        expect(q.prompt.ko.length).toBeGreaterThan(10);
      }
    }
  });

  test("question ids are unique across both axes", () => {
    const ids = Object.values(AXIS_CHECKS).flatMap((c) => c.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("frameworks come from the shared audit vocabulary (labels resolve)", () => {
    for (const check of Object.values(AXIS_CHECKS)) {
      for (const q of check.questions) {
        // labelFramework falls back to the raw id when unknown — require a
        // real label (contains the locale separator dot) for every framework.
        expect(labelFramework(q.framework, "ko")).not.toBe(q.framework);
        expect(labelFramework(q.framework, "en")).not.toBe(q.framework);
      }
    }
  });

  test("motivation covers all three self-determination needs, twice each", () => {
    const byFramework = AXIS_CHECKS.motivation.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.framework] = (acc[q.framework] ?? 0) + 1;
      return acc;
    }, {});
    expect(byFramework).toEqual({ "sdt:autonomy": 2, "sdt:competence": 2, "sdt:relatedness": 2 });
  });

  test("axis tags are namespaced and distinct", () => {
    expect(AXIS_CHECKS.motivation.tag).toBe("axis_check:motivation");
    expect(AXIS_CHECKS.strengths.tag).toBe("axis_check:strengths");
    expect(AXIS_CHECKS.values.tag).toBe("axis_check:values");
  });

  test("values covers each Schwartz anchor exactly once", () => {
    const frameworks = AXIS_CHECKS.values.questions.map((q) => q.framework).sort();
    expect(frameworks).toEqual([
      "values:achievement",
      "values:authenticity",
      "values:benevolence",
      "values:security",
      "values:self_direction",
      "values:stimulation",
    ]);
  });

  test("no em dashes in user-visible copy", () => {
    for (const check of Object.values(AXIS_CHECKS)) {
      const copy = [check.title.en, check.title.ko, check.intro.en, check.intro.ko, ...check.questions.flatMap((q) => [q.prompt.en, q.prompt.ko])].join(" ");
      expect(copy).not.toMatch(/—/);
    }
  });
});
