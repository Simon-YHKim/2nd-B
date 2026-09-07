import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const screenPath = "src/app/(auth)/complete-profile.tsx";
const source = readFileSync(join(root, screenPath), "utf8");
const screenManifest = JSON.parse(
  readFileSync(join(root, "design/pixel_clay_260825/data/screens.json"), "utf8"),
) as { screens: Array<{ id: string; port: boolean | "deferred"; stage: number; capture: boolean }> };
const appRoutes = JSON.parse(
  readFileSync(join(root, "design/pixel_clay_260825/data/app-routes.json"), "utf8"),
) as {
  unmeasurable: Record<string, { route?: string; why?: string; needs?: string }>;
  unmapped: Record<string, unknown>;
};

describe("/complete-profile PIXEL-CLAY profilesetup contract", () => {
  test("salvages the tracked Stage 2 reference through production pixel surfaces", () => {
    expect(screenManifest.screens.find(({ id }) => id === "profilesetup")).toEqual({
      id: "profilesetup",
      port: true,
      stage: 2,
      capture: true,
    });
    expect(existsSync(join(root, "design/pixel_clay_260825/captures/profilesetup.png"))).toBe(true);
    expect(appRoutes.unmeasurable.profilesetup).toMatchObject({ route: "/complete-profile" });
    expect(appRoutes.unmapped.profilesetup).toBeUndefined();
    expect(source).toContain('import { PixelSurface } from "@/components/pixel"');
    expect(source).toContain('<PixelSurface variant="inset"');
    expect((source.match(/<PixelSurface variant="frame"/g) ?? [])).toHaveLength(2);
    expect(source).toContain('accessibilityRole="progressbar"');
  });

  test("counts only the two real entry gates, never optional mock profile fields", () => {
    expect(source).toContain("const ageReady = age >= MIN_SELF_CONSENT_AGE");
    expect(source).toContain("const consentReady = allRequiredAcksChecked(consent)");
    expect(source).toContain("const requiredProgress = Number(ageReady) + Number(consentReady)");
    expect(source).toMatch(/userId !== null &&\s*ageReady &&\s*consentReady &&\s*!submitting/);
    // 핀을 객체 형태에서 헬퍼 형태로 옮긴다. 이 단언의 뜻은 "진행 상태가
    // 값으로 announce 된다" 이고, 객체 형태는 React Native Web 이 읽지 않아
    // 웹에서 그 값이 통째로 사라졌다. 뜻은 그대로, 형태만 실제로 닿는 쪽으로.
    expect(source).toContain("{...a11yValue({ min: 0, max: 2, now: requiredProgress })}");
    expect(source).not.toContain("localStorage");
  });

  test("keeps C10, consent recording, auth settlement, and navigation intact", () => {
    expect(source).toContain("ensureUserProfile({ birthDate, locale, displayName })");
    expect(source).toContain("buildSignUpConsentArgs({ userId, isMinor: isMinorAge, locale, selections: consent })");
    expect(source).toContain("<ConsentNotice minor={isMinorAge} value={consent} onChange={setConsent} />");
    expect(source).toContain("submitCompleteProfile({");
    expect(source).toContain("signOutAndSettle({ signOutUser: signOut, refreshAuth: refresh })");
    expect(source).toContain('return <Redirect href="/sign-in" />');
    expect(source).toContain('router.replace("/")');
  });
});
