// 2026-08-25: 검사 대상이 새 일곱(seven-stars)이다. 문장 라벨은 프롬프트용
// EN 코드 상수(EN_NAME)에서 온다.
import { lensSummaryLine } from "../lens-signal";

describe("lensSummaryLine (axis1→axis2 trusted fact line)", () => {
  test("names strongest + building star (EN anchor)", () => {
    const line = lensSummaryLine({ work: 4, infancy: 1, now: 2 });
    expect(line).toContain("strongest");
    expect(line).toContain("Work=L4");
    expect(line).toContain("building");
    expect(line).toContain("L1");
  });

  test("empty when nothing recorded (all default L1)", () => {
    expect(lensSummaryLine({})).toBe("");
    expect(lensSummaryLine({ now: 1 })).toBe("");
  });

  test("flat-but-lit reads as evenly at level", () => {
    const line = lensSummaryLine({
      profile: 3, infancy: 3, school: 3, twenties: 3, later: 3, work: 3, now: 3,
    });
    expect(line).toContain("evenly at L3");
  });

  test("levels clamp to 1..5", () => {
    const line = lensSummaryLine({ work: 9, infancy: 0 });
    expect(line).toContain("L5");
  });
});
