import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guardianSupervisionColor } from "../guardian-supervision-color";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const readNotice = (locale: string) =>
  JSON.parse(read(`locales/${locale}/consent.json`)).notice.guardianSupervision;

describe("N2-2 guardian supervision notice", () => {
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

  test("renders only readable translated Text in the existing signup helper typography", () => {
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
      "fontSize: m3.type.bodySmall.size",
      "lineHeight: m3.type.bodySmall.line",
    ]) expect(source).toContain(style);
    expect(source).not.toMatch(/accessible=\{false\}|accessibilityElementsHidden|importantForAccessibility|numberOfLines|onPress|useState|useEffect|#[0-9a-f]{3,8}\b/i);
  });
});
