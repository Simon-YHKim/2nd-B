import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CRISIS_SCAN_POLICY, hasCrisisObfuscation } from "../crisis-obfuscation";
import corpus from "./crisis-obfuscation.corpus.json";

describe("Q-261011-05 obfuscation request gate (not a verdict)", () => {
  test.each([
    "지금 죽.고 싶어.", "I want.to die.", "sui.cide", "지금 죽 고 싶어.",
    "지금 자\u200b살하고 싶어.", "I want-to-die.", "지금 죽/고 싶어.",
    "지금 죽.\n고 싶어.", "I want\u200dto die.", "ｓｕｉ．ｃｉｄｅ",
    "example.com:8080/x—I.want.to.die.", "name@example.com, I.want.to.die.",
  ])("asks about an internal alteration: %s", (text) => {
    expect(hasCrisisObfuscation(text)).toBe(true);
  });

  test.each([
    "혼_자_살고 싶어.", "자_살펴봐.", "I'm ending_it after lunch.", "Let's end.it.all after lunch.",
    "일을 끝낼.거예요.", "일을 끝내고.싶어요.", "끝낼.거", "끝.낼거",
    "오늘 산책을 했어요.", "I enjoyed lunch.", "suicide", "I want to die.", "지금 죽고싶어.",
    "자살", "self harm", "I'm not suicidal.", "I don't want to die.", "자살할 생각은 없어.",
    "https://example.com/sui.cide", "sui.cide@example.com", "example.com:8080/sui.cide",
    "want. name@example.com to die", "want. https://x/y to die", "",
  ])("does not ask: %s", (text) => {
    expect(hasCrisisObfuscation(text)).toBe(false);
  });

  // The source algorithm treats the space in the unspaced KO alias and the
  // hyphen in self-harm as altered gaps. Preserve that behavior; callLlm's
  // preceding lexical RED prevents either literal from reaching this gate.
  test.each(["지금 죽고 싶어.", "self-harm"])("preserves source alias behavior: %s", (text) => {
    expect(hasCrisisObfuscation(text)).toBe(true);
  });

  test("all 34 policy rows have reasons and exactly the five completion terms stay off", () => {
    const policies = [...CRISIS_SCAN_POLICY.en, ...CRISIS_SCAN_POLICY.ko];
    expect(policies).toHaveLength(34);
    expect(policies.filter((p) => !p.loose).map((p) => p.term).sort()).toEqual(
      ["ending it", "end it all", "끝내고 싶", "끝낼 거", "끝낼거"].sort(),
    );
    for (const policy of policies) expect(policy.reason.length).toBeGreaterThan(10);
  });

  test("449 recorded verdicts reproduce the four measured counts exactly", () => {
    const measured = {
      bypass: { n: 0, asked: 0, caught: 0 },
      benign: { n: 0, asked: 0, falseAlarm: 0 },
    };
    expect(corpus.items).toHaveLength(449);
    for (const item of corpus.items) {
      const asked = hasCrisisObfuscation(item.text);
      const red = asked && item.zone === "red";
      if (item.label === "bypass") {
        measured.bypass.n++;
        measured.bypass.asked += Number(asked);
        measured.bypass.caught += Number(red);
      } else {
        expect(item.label).toBe("benign");
        measured.benign.n++;
        measured.benign.asked += Number(asked);
        measured.benign.falseAlarm += Number(red);
      }
    }
    expect(measured).toEqual({
      bypass: { n: 195, asked: 192, caught: 191 },
      benign: { n: 254, asked: 71, falseAlarm: 5 },
    });
    expect(measured).toEqual(corpus.expected);
  });

  test("all nine everyday corpus sentences stay quiet", () => {
    const everyday = corpus.items.filter((item) => item.kind === "corpus");
    expect(everyday).toHaveLength(9);
    expect(everyday.filter((item) => hasCrisisObfuscation(item.text))).toEqual([]);
  });

  test.each(["ko", "en"])("all %s locale strings stay quiet", (locale) => {
    const strings: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === "string") strings.push(value);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    const dir = resolve(__dirname, "../../../..", "locales", locale);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      collect(JSON.parse(readFileSync(resolve(dir, file), "utf8")));
    }
    // 2026-10-15: six approved interview-guidance strings added per locale (4419 + 6).
    // 2026-10-18: one spoken-name string added per locale for the save notice button (Q-261018-51).
    // 2026-10-18: three all-devices sign-out strings added per locale (Q-261018-50).
    // 2026-10-19: the help screen's three fixed notice lines (title and tag each) and their
    // section title left per locale; notices are one row to the notices screen (Z73, 4429 - 7).
    // 2026-10-19: the user guide's four common tasks, a question and an answer each, plus three
    // button labels, added per locale (Z69, 4422 + 11).
    // S2 adds eleven scene-choice and save-receipt strings per locale.
    // 2026-10-24: privacy terms and refund links add two labels (4444 + 2).
    // T06: one explicit hook-refusal notice added per locale (4446 + 1).
    // T06 review: retire the two unused recovery-card strings (4447 - 2).
    // 2026-10-24: T53 dormant report form adds 20 strings per locale (Z74).
    // T53 review: reply route and permanent rejection add two strings per locale.
    // T10: five dormant labels plus 21 approved card/settings strings (Q-71/Q-72).
    // T28: one held-source AI processing notice per locale.
    expect(strings).toHaveLength(4494);
    expect(strings.filter(hasCrisisObfuscation)).toEqual([]);
  });

  // Retain the source scanner's long-gap/address regressions with active policy.
  test.each([
    "self" + "-".repeat(50_000) + "x",
    Array(10_000).fill("https://x/sui.cide").join(" "),
    "example.com:" + "9".repeat(50_000) + "/sui.cide",
  ])("long input is scanned without suffix searches", (text) => {
    const start = performance.now();
    expect(hasCrisisObfuscation(text)).toBe(false);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
