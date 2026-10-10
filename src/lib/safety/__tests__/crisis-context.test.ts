import { classifyInputAnyLocale } from "../classifier";
import { prepareCrisisScanText, createLooseCrisisMatcher } from "../crisis-context";
import { CRISIS_TERMS } from "../lexicon";
import { BENIGN_CRISIS_CONTEXTS, RISK_OR_UNRESOLVED_CRISIS_CONTEXTS, SPACE_SENSITIVE_BENIGN_CONTEXTS } from "./crisis-context.fixtures";

describe("narrow crisis-context corrections", () => {
  test.each(SPACE_SENSITIVE_BENIGN_CONTEXTS)("keeps everyday word boundaries green: %s", (text) => {
    expect(prepareCrisisScanText(text)).toBe(text);
    expect(classifyInputAnyLocale(text, "ko").zone).toBe("green");
    expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
  });

  test("preserves source boundaries in the original context scan", () => {
    expect(prepareCrisisScanText("죽.고 싶어. I want-to-die.")).toBe("죽.고 싶어. i want-to-die.");
    expect(prepareCrisisScanText("I'm\u200bsuicidal.")).toBe("i'm\u200bsuicidal.");
  });

  test("loose matching only adds inserted spellings, not literal context exceptions", () => {
    expect(createLooseCrisisMatcher("I'm not suicidal.")("suicidal", "en")).toBe(false);
    expect(createLooseCrisisMatcher("I'm not sui.cidal.")("suicidal", "en")).toBe(true);
    expect(createLooseCrisisMatcher("오늘 일을 끝내고 싶어요.")("끝내고 싶", "ko")).toBe(false);
    expect(createLooseCrisisMatcher("오늘 일을 끝내고.싶어요.")("끝내고 싶", "ko")).toBe(true);
  });

  test.each(Object.entries(CRISIS_TERMS).flatMap(([locale, terms]) => terms.map(term => [locale, term] as const)))(
    "preserves each original %s term at invisible boundaries: %s", (locale, term) => {
      expect(classifyInputAnyLocale(`prefix\u200b${term}\u200bsuffix`, locale as "en" | "ko").zone).toBe("red");
    },
  );

  test("compiles every existing term into a matcher without changing the lexicon", () => {
    for (const [locale, terms] of Object.entries(CRISIS_TERMS)) {
      for (const term of terms) {
        const inserted = [...term].join("\u200b");
        expect(createLooseCrisisMatcher(inserted)(term, locale as "en" | "ko")).toBe(true);
      }
    }
  });

  test("repeated loose scans are independent and an empty term cannot match", () => {
    const matches = createLooseCrisisMatcher("sui.cide");
    expect(matches("", "en")).toBe(false);
    expect(matches("suicide", "en")).toBe(true);
    expect(matches("suicide", "en")).toBe(true);
    expect(createLooseCrisisMatcher("sui.cide")("suicide", "en")).toBe(true);
  });

  test.each(BENIGN_CRISIS_CONTEXTS)("ordinary context does not route: %s", (text) => {
    expect(classifyInputAnyLocale(text, "ko").zone).not.toBe("red");
    expect(classifyInputAnyLocale(text, "en").zone).not.toBe("red");
  });

  test.each(RISK_OR_UNRESOLVED_CRISIS_CONTEXTS)("risk or unresolved context preserves routing: %s", (text) => {
    expect(classifyInputAnyLocale(text, "ko").zone).toBe("red");
    expect(classifyInputAnyLocale(text, "en").zone).toBe("red");
  });

  test("unnegated risk still uses the age-appropriate hotline", () => {
    const text = "자살하려는 건 아니지만 지금 죽고 싶어.";
    expect(classifyInputAnyLocale(text, "ko", { minor: true }).crisisRouting?.number).toBe("1388");
    expect(classifyInputAnyLocale(text, "ko").crisisRouting?.number).toBe("109");
  });

  test("a benign first occurrence never hides a later unqualified occurrence", () => {
    const result = classifyInputAnyLocale("일을 끝내고 싶어요. 그냥 다 끝내고 싶어요.", "ko");
    expect(result.zone).toBe("red");
    expect(result.matched).toContain("끝내고 싶");
  });
});
