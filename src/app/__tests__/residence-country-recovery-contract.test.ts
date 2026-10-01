import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("C10 unreadable-region residence recovery wiring", () => {
  const signUp = read("src/screens/deepspace/dds-sign-up-screen.tsx");
  const hook = read("src/lib/auth/useSignUpForm.ts");
  const completeProfile = read("src/app/(auth)/complete-profile.tsx");

  test("email sign-up asks only when the detected region is unreadable", () => {
    expect(hook).toContain('detectedConsentFloor.source === "region-unreadable"');
    expect(signUp).toContain("{residenceRequired ? (");
    expect(signUp).toContain("<ResidenceCountryField");
    expect(hook).toContain("residenceReady &&");
    expect(hook).toContain("residenceCountry,");
  });

  test("OAuth complete-profile applies the same selector and floor", () => {
    expect(completeProfile).toContain('detectedConsentFloor.source === "region-unreadable"');
    expect(completeProfile).toContain("{residenceRequired ? (");
    expect(completeProfile).toContain("<ResidenceCountryField");
    expect(completeProfile).toContain(
      "ensureUserProfile({ birthDate, locale, displayName, residenceCountry })",
    );
  });

  test("both birth-date fields receive the recovered minimum age", () => {
    expect(signUp).toContain("minAge={minConsentAge}");
    expect(completeProfile).toContain("minAge={minConsentAge}");
  });
});
