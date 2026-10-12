import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const signupPath = "src/screens/deepspace/dds-sign-up-screen.tsx";
const profilePath = "src/app/(auth)/complete-profile.tsx";
const legalPath = "src/screens/deepspace/dds-legal-doc-screen.tsx";
const settingsPath = "src/app/settings.tsx";

describe("N2-2 notice placement", () => {
  test.each([signupPath, profilePath])("%s always shows the notice immediately after DOB using the existing age flag", (path) => {
    const source = read(path);
    expect(source).toMatch(/<BirthDateField\b[^]*?\/>(\s*)<GuardianSupervisionNotice emphasized=\{isMinorAge\}[^]*?\/>/);
    expect(source.match(/<GuardianSupervisionNotice\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/(?:useState|useEffect)[^\n]*[Gg]uardian/);
  });

  test("settings shows one muted notice immediately below the account group", () => {
    const source = read(settingsPath);
    expect(source).toMatch(/<M3SectionLabel>\{t\("account"\)\}<\/M3SectionLabel>\s*<M3Group>[^]*?<\/M3Group>\s*<GuardianSupervisionNotice\s*\/>/);
    expect(source.match(/<GuardianSupervisionNotice\b/g)).toHaveLength(1);
  });

  test("terms opts in to the notice outside the body, below the document title", () => {
    expect(read("src/app/(auth)/terms.tsx")).toMatch(/doc=\{TERMS_DOC\}\s+showGuardianSupervisionNotice\s/);
    const source = read(legalPath);
    expect(source).toContain("showGuardianSupervisionNotice = false");
    expect(source).toContain("showGuardianSupervisionNotice?: boolean");
    expect(source).toMatch(/\{doc.title\}\s*<\/Text>\s*<\/View>\s*\{showGuardianSupervisionNotice \? <GuardianSupervisionNotice \/> : null\}/);
    const body = source.indexOf("<View style={styles.card}>");
    expect(body).toBeGreaterThan(source.indexOf("<GuardianSupervisionNotice />"));
    expect(source.slice(body)).not.toContain("GuardianSupervisionNotice");
  });

  test("privacy policy and refund never enable the terms-only notice", () => {
    for (const route of ["privacy-policy", "refund"]) {
      const source = read(`src/app/(auth)/${route}.tsx`);
      expect(source).toContain("<DeepSpaceLegalDocScreen");
      expect(source).not.toContain("GuardianSupervisionNotice");
    }
  });

  test("all four surfaces share the component without duplicating any notice wording or key", () => {
    for (const path of [signupPath, profilePath, settingsPath, legalPath]) {
      const source = read(path);
      expect(source).toContain('import { GuardianSupervisionNotice } from "@/components/consent/GuardianSupervisionNotice"');
      expect(source).toContain("<GuardianSupervisionNotice");
      expect(source).not.toContain("notice.guardianSupervision");
      for (const locale of ["ko", "en", "es", "pt", "id"]) {
        const text = JSON.parse(read(`locales/${locale}/consent.json`)).notice.guardianSupervision;
        expect(source).not.toContain(text);
      }
    }
  });
});
