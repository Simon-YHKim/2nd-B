import { readFileSync } from "node:fs";
import { join } from "node:path";

const screen = readFileSync(join(__dirname, "..", "interview.tsx"), "utf8");

describe("interview choice controls", () => {
  it("offers explicit topic skip and factual path alongside the answer field", () => {
    expect(screen).toContain('onPress={() => changeAngle("skip")}');
    expect(screen).toContain('onPress={() => changeAngle("concrete")}');
    expect(screen).toContain('accessibilityLabel={t("drill.skip")}');
    expect(screen).toContain('accessibilityLabel={t("drill.concrete")}');
    expect(screen).toContain('sceneStart: choice === "skip"');
  });

  it("offers stop before the first answer and while a follow-up is pending", () => {
    expect(screen).toContain("{started.current ? (");
    expect(screen).toContain("onPress={finish}");
    const finish = screen.slice(screen.indexOf("const finish ="), screen.indexOf("useEffect(() => {", screen.indexOf("const finish =")));
    expect(finish).toContain("ended.current = true");
    expect(finish).toContain("setBusy(false)");
    expect(finish).not.toMatch(/createRecord|addCoverage/);
  });

  it("ignores late responses before they can change coverage or add another question", () => {
    const response = screen.slice(screen.indexOf("const probe = await nextProbe("));
    expect(response.indexOf("if (ended.current) return;")).toBeLessThan(response.indexOf("confirmedAnswer("));
    expect(response.indexOf("if (ended.current) return;")).toBeLessThan(response.indexOf("incrementCoverage("));
  });

  it("classifies explicit stop text before handling the choice and writes only in save", () => {
    const send = screen.slice(screen.indexOf("async function send("), screen.indexOf("async function keepIt("));
    expect(send.indexOf("classifyInputAnyLocale(")).toBeLessThan(send.indexOf("answerDisposition("));
    expect(send).not.toMatch(/createRecord\(|addCoverage\(/);
    expect(screen).toContain("loading={saving}");
    expect(screen).toContain("onPress={() => void keepIt()}");
  });
});
