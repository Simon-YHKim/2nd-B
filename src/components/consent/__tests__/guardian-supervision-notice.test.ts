import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guardianSupervisionColor } from "../guardian-supervision-color";
import { shouldEmphasizeGuardianSupervision } from "../guardian-supervision-emphasis";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const readNotice = (locale: string) =>
  JSON.parse(read(`locales/${locale}/consent.json`)).notice.guardianSupervision;

describe("N2-2 guardian supervision notice", () => {
  // Local calendar dates keep the birthday boundary independent of the machine timezone.
  const now = new Date(2026, 9, 12, 12);
  test.each([
    ["17 years 364 days", "2008-10-13", true],
    ["18th birthday", "2008-10-12", false],
    ["adult", "2000-10-12", false],
    ["13 years", "2013-10-12", true],
    ["12 years, below registration floors", "2014-10-12", true],
    ["0 years, born today", "2026-10-12", true],
    ["empty", "", false],
    ["malformed", "not-a-date", false],
    ["partial date", "2013-10", false],
    ["non-canonical date", "2013-1-2", false],
    ["overflow day", "2013-02-30", false],
    ["invalid leap day", "2013-02-29", false],
    ["valid leap day", "2012-02-29", true],
    ["future tomorrow, whose truncated age is zero", "2026-10-13", false],
    ["future year", "2027-10-12", false],
  ] as const)("emphasis for %s", (_label, birthDate, expected) => {
    expect(shouldEmphasizeGuardianSupervision(birthDate, now)).toBe(expected);
  });

  test.each(Object.entries({
    ko: "미성년자는 보호자의 감독하에 이 서비스를 이용해야 합니다.",
    en: "Minors must use this service under the supervision of a parent or guardian.",
  }))("preserves the exact %s notice", (locale, text) => {
    expect(readNotice(locale)).toBe(text);
  });

  test.each(["es", "pt", "id"])("ships the %s notice as the English copy", (locale) => {
    // 2026-06-11 policy: consent copy stays in English until a HUMAN reviews the translation.
    expect(readNotice(locale)).toBe(readNotice("en"));
  });

  test("uses body color for minors and returns to muted color for adults or no DOB", () => {
    expect(guardianSupervisionColor(true)).toBe("onSurface");
    expect(guardianSupervisionColor(false)).toBe("onSurfaceVariant");
    expect(guardianSupervisionColor()).toBe("onSurfaceVariant");
    expect(read("src/components/consent/guardian-supervision-color.ts")).not.toMatch(/import\b/);
  });

  test("renders only readable translated Text in bodyMedium typography", () => {
    const source = read("src/components/consent/GuardianSupervisionNotice.tsx");
    expect(source).toContain('import { PlainText as Text } from "@/components/ui/PlainText"');
    expect(source).toContain('useTranslation("consent")');
    expect(source).toContain('const notice = t("notice.guardianSupervision")');
    const render = source.slice(source.indexOf("return ("));
    expect(render.match(/<\w+\b(?=[\s>])/g)).toEqual(["<Text"]);
    expect(source).toMatch(/accessibilityLabel=\{notice\}\s*>\s*\{notice\}\s*<\/Text>/);
    expect(source).toContain("color: m3.color[guardianSupervisionColor(emphasized)]");
    expect(source).toContain("emphasized = false");
    for (const style of [
      "fontFamily: m3.font.brand",
      "fontSize: m3.type.bodyMedium.size",
      "lineHeight: m3.type.bodyMedium.line",
    ]) expect(source).toContain(style);
    expect(source).not.toMatch(/accessible=\{false\}|accessibilityElementsHidden|importantForAccessibility|numberOfLines|onPress|useState|useEffect|#[0-9a-f]{3,8}\b/i);
  });
});
