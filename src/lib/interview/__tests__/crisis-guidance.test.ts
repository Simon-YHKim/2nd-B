import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { crisisHotlines } from "../../safety/classifier";
import { emergencyGuidance } from "../../safety/emergency-routing";
import { interviewCrisisGuidance } from "../crisis-guidance";

// This helper is a FAILED measured candidate, not a runtime prompt. These
// checks verify the experiment's inputs; they do not establish model quality.
describe("unactivated interview guidance candidate", () => {
  test.each([false, true])("Korean support numbers follow the age-aware table: minor=%s", (minor) => {
    const rule = interviewCrisisGuidance("ko", minor);
    const support = crisisHotlines("ko", minor).map((line) => line.number).join(" 또는 ");
    expect(rule).toContain(`한국에 계실 경우 ${support}로 안내하세요`);
    if (!minor) expect(rule).not.toContain("1388");
  });

  test.each([false, true])("English does not assert a US location: minor=%s", (minor) => {
    const rule = interviewCrisisGuidance("en", minor);
    expect(rule).toContain("988 if they are in the US");
    expect(rule).toContain("Never infer location from language or invent a number");
  });

  test.each(["ko", "en"] as const)("%s includes app emergency guidance without turning self-harm alone into a police instruction", (locale) => {
    const rule = interviewCrisisGuidance(locale, true);
    for (const id of ["KR_119", "KR_112"] as const) expect(rule).toContain(emergencyGuidance(id, locale)!.text);
    expect(rule).toContain(locale === "ko" ? "그 이야기만을 이유로 경찰 번호를 붙이지 마세요" : "Do not add a police number for that reason alone");
  });

  test("no application consumer can use the failed candidate", () => {
    const root = path.resolve(__dirname, "../../..");
    const candidate = path.resolve(__dirname, "../crisis-guidance.ts");
    const consumers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__") continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.tsx?$/.test(file) && file !== candidate && /interviewCrisisGuidance|["'][^"']*crisis-guidance["']/.test(readFileSync(file, "utf8"))) consumers.push(path.relative(root, file));
      }
    };
    walk(root);
    expect(consumers).toEqual([]);
  });
});
