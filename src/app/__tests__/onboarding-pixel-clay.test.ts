import fs from "node:fs";
import path from "node:path";

import { m3 } from "@/lib/theme/m3";

const SRC = fs.readFileSync(path.resolve(__dirname, "..", "onboarding.tsx"), "utf8");
const FLOWS = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "..", "..", "..", "public", "proto", "data", "screens", "flows.json"),
    "utf8",
  ),
) as {
  onboardingSlides: { tag: string; title: string; icon: string; body: string }[];
};

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
    // QA 261004 D-01: back to the home underneath, never a second home.
    expect(SRC).toMatch(/onboardingComplete === true[\s\S]{0,60}<RedirectHome \/>/);
    expect(SRC).toMatch(/loading \|\| onboardingComplete === null/);
  });

  test("keeps three focused canon slides and Android Back walks one slide backward", () => {
    expect(SRC).toContain("canonFlows.onboardingSlides");
    expect(SRC).toContain("const AUTH_STEP = SLIDES.length;");
    expect(FLOWS.onboardingSlides).toHaveLength(3);
    expect(SRC).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(SRC).toMatch(/if \(step > 0\)[\s\S]{0,100}setStep\(\(current\) => current - 1\)/);
  });

  test("introduces the current seven-star model with concrete starting examples", () => {
    const koBody = FLOWS.onboardingSlides[1]?.body ?? "";
    const enBody =
      SRC.match(/tag: "Getting to know you",[\s\S]*?body: "([^"]+)"/)?.[1] ?? "";

    expect(FLOWS.onboardingSlides[1]?.title).toContain("일곱 별");
    for (const star of ["학창시절", "직장", "지금"]) {
      expect(koBody).toContain(star);
    }
    expect(SRC).toContain("across seven stars");
    for (const star of ["School years", "work", "now"]) {
      expect(enBody).toContain(star);
    }

    expect(koBody).not.toMatch(/커리어|재정|관계|건강|성장|휴식/);
    expect(enBody).not.toMatch(/Career|money|relationships|health|growth|rest/);
  });

  test("removes AI-principles teaching and keeps user approval as the final product message", () => {
    const canonCopy = JSON.stringify(FLOWS.onboardingSlides);

    expect(FLOWS.onboardingSlides[2]).toEqual({
      tag: "내가 결정하기",
      title: "AI의 요약은\n내가 확인합니다",
      icon: "check_circle",
      body: "나에 대한 요약은 제안입니다.\n내가 승인해야 반영됩니다.",
    });
    expect(SRC).toContain('tag: "Your choice"');
    expect(SRC).toContain('title: "AI summaries need\\nyour approval"');
    expect(SRC).toContain('body: "A summary about you is a proposal.\\nIt is applied only if you approve it."');

    for (const removed of ["AI의 원리", "AI 뮤지엄", "함께 배우기", "Learning together", "AI Museum"]) {
      expect(canonCopy).not.toContain(removed);
      expect(SRC).not.toContain(removed);
    }
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
  });

  test("the sign-up age floor is shown once, and only to a signed-out visitor (QA 261004 W-11)", () => {
    // The final slide showed ageNotice as a title and birthDateHelper (the same
    // floor again, plus a birth-date line with no birth-date field here) under
    // it, to every visitor. Behind the login wall that is mostly signed-in users.
    const code = SRC.replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(code.match(/t\("auth:signUp\.ageNotice"\)/g) ?? []).toHaveLength(1);
    expect(code).not.toContain("auth:signUp.birthDateHelper");
    const gate = code.indexOf("{userId ? null : (");
    const notice = code.indexOf('t("auth:signUp.ageNotice")');
    expect(gate).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(gate);
    // The gated block is exactly the age card: it opens right after the gate
    // and its PixelSurface closes after the notice.
    const close = code.indexOf("</PixelSurface>", notice);
    expect(close).toBeGreaterThan(notice);
    expect(code.slice(gate, close).match(/<PixelSurface\b/g) ?? []).toHaveLength(1);
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
