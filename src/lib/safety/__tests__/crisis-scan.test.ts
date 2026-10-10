import { readFileSync } from "fs";
import { resolve } from "path";
import { classifyInputAnyLocale } from "../classifier";
import { CRISIS_SCAN_POLICY, scanCrisisObfuscation } from "../crisis-context";
import { CRISIS_TERMS } from "../lexicon";
import { SCANLINE_RED, SCANLINE_GREEN, SCANLINE_VARIANTS, SCANLINE_UNRESOLVED } from "./crisis-scan.fixtures";

describe("linear additive crisis scanner", () => {
  test.each(SCANLINE_RED)("gate regression RED: %s", (text) => {
    expect(classifyInputAnyLocale(text, "ko").zone).toBe("red");
    expect(classifyInputAnyLocale(text, "en").zone).toBe("red");
  });
  test.each(SCANLINE_GREEN)("gate regression GREEN", (text) => {
    expect(classifyInputAnyLocale(text, "ko").zone).toBe("green");
    expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
  });
  test.each(SCANLINE_VARIANTS)("generated counterexamples: $name", ({ cases }) => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    for (const { text, red } of cases) {
      expect({ text, red: classifyInputAnyLocale(text, "ko").zone === "red" }).toEqual({ text, red });
    }
  });
  test.each(["en", "ko"] as const)("%s policy covers the unchanged lexicon with reasons", (locale) => {
    expect(CRISIS_SCAN_POLICY[locale].map((p) => p.term)).toEqual(CRISIS_TERMS[locale]);
    for (const policy of CRISIS_SCAN_POLICY[locale]) {
      expect(policy.reason.length).toBeGreaterThan(10);
      if (!policy.loose) {
        const text = Array.from(policy.term).join(".");
        expect(scanCrisisObfuscation(text)[locale].size).toBe(0);
      }
    }
  });
  test("only altered hits are additive; literal exceptions are not reintroduced", () => {
    for (const text of ["I'm not suicidal.", "I don't want to die.", "자살할 생각은 없어."]) {
      const hits = scanCrisisObfuscation(text);
      expect(hits.en.size + hits.ko.size).toBe(0);
    }
  });
  test("enabled phrase rules advance across internal and word seams", () => {
    for (const text of ["k.ill my.self", "end/my.l.ife", "self/ha.rm", "목.숨을/끊", "죽.고싶어"]) {
      expect(classifyInputAnyLocale(text, "ko").zone).toBe("red");
    }
  });
  test.each(SCANLINE_UNRESOLVED)("documented coverage limit: $text", ({ text }) => {
    expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
  });
  test("addresses are barriers, never removable gaps", () => {
    for (const text of ["want. name@example.com to die", "want. https://x/y to die"]) {
      expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
    }
  });
  test("loose scan never exports an input copy or mutates the caller's string", () => {
    const original = "I.want.to.die,name@example.com";
    expect([...scanCrisisObfuscation(original).en]).toContain("want to die");
    expect(original).toBe("I.want.to.die,name@example.com");
    const source = readFileSync(resolve(__dirname, "../crisis-context.ts"), "utf8");
    expect(source).not.toMatch(/\\p\{/);
    expect(source.slice(source.indexOf("export function scanCrisisObfuscation"))).not.toContain("new RegExp");
  });
  test.each([
    "self" + "-".repeat(50_000) + "x",
    Array(10_000).fill("https://x/sui.cide").join(" "),
  ])("long input stays under 1.5 seconds including the legacy classifier", (text) => {
    const start = performance.now();
    expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
