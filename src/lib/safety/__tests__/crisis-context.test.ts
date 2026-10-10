import { classifyInputAnyLocale } from "../classifier";
import { prepareCrisisScanText } from "../crisis-context";
import { BENIGN_CRISIS_CONTEXTS, RISK_OR_UNRESOLVED_CRISIS_CONTEXTS, SPACE_SENSITIVE_BENIGN_CONTEXTS } from "./crisis-context.fixtures";

describe("narrow crisis-context corrections", () => {
  test.each(SPACE_SENSITIVE_BENIGN_CONTEXTS)("keeps everyday word boundaries green: %s", (text) => {
    expect(prepareCrisisScanText(text)).toBe(text);
    expect(classifyInputAnyLocale(text, "ko").zone).toBe("green");
    expect(classifyInputAnyLocale(text, "en").zone).toBe("green");
  });

  test("normalizes inserted characters before the risk-context early return", () => {
    expect(prepareCrisisScanText("죽.고 싶어. I want-to-die.")).toBe("죽고 싶어. i want to die.");
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
