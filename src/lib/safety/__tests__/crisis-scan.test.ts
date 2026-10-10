import { readFileSync } from "fs";
import { resolve } from "path";
import * as ts from "typescript";
import { classifyInputAnyLocale } from "../classifier";
import { CRISIS_SCAN_POLICY, scanCrisisObfuscation } from "../crisis-context";
import { CRISIS_TERMS } from "../lexicon";
import { SCANLINE_RED, SCANLINE_GREEN, SCANLINE_VARIANTS, SCANLINE_UNRESOLVED, SCANLINE_R2_VARIANTS } from "./crisis-scan.fixtures";

// Exercise the real lexer even while production policy disables loose matches.
// App/Edge GREEN tests alone would not catch a broken dormant port rule.
function loadAddressLexer(): (text: string, kinds: Uint8Array) => void {
  const source = readFileSync(resolve(__dirname, "../crisis-context.ts"), "utf8");
  const js = ts.transpileModule(`${source}\nexports.lex = excludeAddresses;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const result = {} as { lex: (text: string, kinds: Uint8Array) => void };
  new Function("exports", js)(result);
  return result.lex;
}

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
  test.each(SCANLINE_R2_VARIANTS)("round 2 counterexamples: $name", ({ cases }) => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    for (const { text, red } of cases) {
      for (const locale of ["en", "ko"] as const) {
        expect({ text, red: classifyInputAnyLocale(text, locale).zone === "red" }).toEqual({ text, red });
      }
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
  test.each(SCANLINE_UNRESOLVED)("documented coverage limit: $text", ({ text }) => {
    expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
    expect(classifyInputAnyLocale(text, "ko").zone).toBe("green");
  });
  test("addresses are barriers, never removable gaps", () => {
    for (const text of ["want. name@example.com to die", "want. https://x/y to die"]) {
      expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
    }
  });
  test("loose scan never exports an input copy or mutates the caller's string", () => {
    const original = "I.want.to.die,name@example.com";
    expect(scanCrisisObfuscation(original)).toEqual({ en: new Set(), ko: new Set() });
    expect(original).toBe("I.want.to.die,name@example.com");
    const source = readFileSync(resolve(__dirname, "../crisis-context.ts"), "utf8");
    expect(source).not.toMatch(/\\p\{/);
    expect(source.slice(source.indexOf("export function scanCrisisObfuscation"))).not.toContain("new RegExp");
  });
  test("SL-02 port lexer marks only host:digits/path, including long ports", () => {
    const lex = loadAddressLexer();
    for (const port of ["8", "8080", "9".repeat(50_000)]) {
      const address = `example.com:${port}/want/to/die`;
      const prefix = "문서는 ";
      const suffix = "—I.want.to.die.";
      const text = prefix + address + suffix;
      const kinds = new Uint8Array(text.length);
      const start = performance.now();
      lex(text, kinds);
      expect(performance.now() - start).toBeLessThan(1500);
      expect(Array.from(kinds.slice(prefix.length, prefix.length + address.length))).toEqual(Array(address.length).fill(3));
      expect(Array.from(kinds.slice(0, prefix.length))).toEqual(Array(prefix.length).fill(0));
      expect(Array.from(kinds.slice(prefix.length + address.length))).toEqual(Array(suffix.length).fill(0));
    }
  });
  test("SL-02 rejects empty/non-numeric ports and a port without a path", () => {
    const lex = loadAddressLexer();
    for (const text of ["example.com:/want/to/die", "example.com:abc/want/to/die", "example.com:8080"]) {
      const kinds = new Uint8Array(text.length);
      lex(text, kinds);
      expect(Array.from(kinds)).toEqual(Array(text.length).fill(0));
    }
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
