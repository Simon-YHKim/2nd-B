import fs from "node:fs";
import path from "node:path";

import { m3 } from "@/lib/theme/m3";

const SRC = fs.readFileSync(path.resolve(__dirname, "..", "onboarding.tsx"), "utf8");

function functionBody(name: string): string {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) return "";

  const open = SRC.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < SRC.length; i += 1) {
    if (SRC[i] === "{") depth += 1;
    if (SRC[i] === "}") {
      depth -= 1;
      if (depth === 0) return SRC.slice(open + 1, i);
    }
  }
  return "";
}

describe("/onboarding PIXEL-CLAY handoff contract", () => {
  test("keeps the signed-out pre-auth carousel and redirects only after completion", () => {
    expect(SRC).toContain("useOnboardingComplete()");
    expect(SRC).not.toMatch(/if\s*\(\s*!userId\s*\)[^\n]*Redirect/);
    expect(SRC).toMatch(/onboardingComplete === true[\s\S]{0,60}<Redirect href="\/"/);
    expect(SRC).toMatch(/loading \|\| onboardingComplete === null/);
  });

  test("keeps all four canon slides and Android Back walks one slide backward", () => {
    expect(SRC).toContain("canonFlows.onboardingSlides");
    expect(SRC).toContain("const AUTH_STEP = SLIDES.length;");
    expect(SRC).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(SRC).toMatch(/if \(step > 0\)[\s\S]{0,100}setStep\(\(current\) => current - 1\)/);
  });

  test("the final handoff exposes the real sign-up and sign-in boundaries", () => {
    expect(SRC).toContain('finishOnboarding("/sign-up")');
    expect(SRC).toContain('finishOnboarding("/sign-in")');
    expect(SRC).toContain('finishOnboarding("/")');
    expect(SRC).toContain('t("auth:signUp.submit")');
    expect(SRC).toContain('t("auth:signIn.submit")');
    expect(SRC).toContain('t("common:actions.continue")');
  });

  test("completion is recorded only inside a final handoff action", () => {
    const handoff = functionBody("finishOnboarding");
    expect(handoff).toContain("markOnboardingComplete();");
    expect(handoff).toContain('router.replace("/");');
    expect(handoff).toContain('router.replace("/sign-up");');
    expect(handoff).toContain('router.replace("/sign-in");');
    expect(handoff.indexOf("markOnboardingComplete();")).toBeLessThan(
      handoff.indexOf('router.replace("/");'),
    );
    expect(SRC.match(/markOnboardingComplete\(\)/g)).toHaveLength(1);
    expect(SRC).toMatch(/onPress=\{\(\) => finishOnboarding\("\/sign-up"\)\}/);
    expect(SRC).toMatch(/onPress=\{\(\) => finishOnboarding\("\/sign-in"\)\}/);
  });

  test("DOB input, storage, and age-tier decisions stay outside onboarding", () => {
    expect(SRC).not.toMatch(/BirthDateField|TextInput|setBirthDate|ageInYears|MIN_SELF_CONSENT_AGE/);
    expect(SRC).not.toMatch(/18\+|adultState|guardianState|pending_guardian_consent/);
    expect(SRC).toContain('t("auth:signUp.ageNotice")');
    expect(SRC).toContain('t("auth:signUp.birthDateHelper")');
  });

  test("uses Pixel primitives with the Fabric-safe 44dp press contract", () => {
    for (const primitive of ["PixelGateShell", "PixelSurface", "PixelPressable", "PixelGlyph"]) {
      expect(SRC).toContain(`<${primitive}`);
    }
    expect(m3.minTouch).toBe(44);
    expect(SRC).not.toMatch(/\bPressable\b/);
    expect(SRC).not.toMatch(/style\s*=\s*\{\s*\(/);
    expect(SRC).not.toMatch(/withAlpha|\bopacity\s*:|\bopacity=/);
    expect(SRC).not.toMatch(/LinearGradient|RadialGradient|blurRadius|shadowRadius/);
    expect(SRC).not.toMatch(/borderRadius:\s*[1-9]/);
  });

  test("keeps 390x820 copy reflowable without clipping caps", () => {
    expect(SRC).not.toContain("numberOfLines=");
    expect(SRC).toContain("contentContainerStyle={styles.shellContent}");
    expect(SRC).toMatch(/shellContent:\s*\{[\s\S]{0,120}flexGrow:\s*1/);
  });
});
