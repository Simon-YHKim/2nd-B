import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNT_DESTINATIONS } from "../dds-account-actions";

// Z26 · Q-261013-10 (Simon, 2026-10-13): two rows on the account screen read as words with no
// meaning to a first-time user, "IDEN" and "앱 밖에서". They now say what the row does. The second
// row's destination screen carries the same name as the row, so the name does not change on the way in.
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const strings = (locale: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "..", "locales", locale, "deepspace.json"), "utf8"));

describe("the account screen's row names", () => {
  test("every row takes its name from the locale files", () => {
    for (const destination of ACCOUNT_DESTINATIONS) {
      expect(destination.labelKey).toMatch(/^deepspace:account\.nav[A-Z][A-Za-z]+$/);
    }
    expect(ACCOUNT_DESTINATIONS.find((d) => d.route === "/iden")?.labelKey).toBe("deepspace:account.navIden");
  });

  test("neither account screen keeps the bare product word as a row label", () => {
    const live = readFileSync(join(__dirname, "..", "dds-account-screen.tsx"), "utf8");
    const design = readFileSync(join(__dirname, "..", "DeepSpaceDesignScreens.tsx"), "utf8");
    expect(live).toContain("const label = t(destination.labelKey);");
    expect(live).not.toContain('=== "IDEN"');
    expect(design).toContain('<Action label={t("account.navIden")} onPress={() => router.push("/iden")} />');
    expect(design).not.toContain('<Action label="IDEN"');
  });

  test.each(LOCALES)("%s names both rows, and the second row's screen has the row's name", (locale) => {
    const s = strings(locale);
    expect(s.account.navIden.trim().length).toBeGreaterThan(3);
    expect(s.account.navIden).not.toBe("IDEN");
    expect(s.beyond.title).toBe(s.account.navBeyond);
  });

  test("the Korean names are the ones that were decided", () => {
    const s = strings("ko");
    expect(s.account.navIden).toBe("내 요약 내보내기");
    expect(s.account.navBeyond).toBe("위젯 · 알림");
  });
});
