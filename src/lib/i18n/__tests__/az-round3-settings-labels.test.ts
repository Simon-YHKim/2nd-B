// A-Z first-use check, round 3 (Z36, Z52). Two labels on the settings side said less than they do.
//
// Z36: "user guide" (a document) sat next to "show the guide again" (replays the hints on home).
// English already said "home"; the other languages did not, so the two rows read as the same thing.
//
// Z52: the permissions screen ends with one button that only closes the screen. It said "continue",
// which promises a next step that does not exist.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const HOME_WORD: Record<(typeof LOCALES)[number], string> = { en: "home", ko: "홈", es: "inicio", pt: "inicial", id: "beranda" };
const OLD_CONTINUE: Record<(typeof LOCALES)[number], string> = { en: "Continue", ko: "계속", es: "Continuar", pt: "Continuar", id: "Lanjut" };

describe.each(LOCALES)("%s", (lng) => {
  test("Z36: the replay row names the home screen and differs from the guide row", () => {
    const settings = read(`locales/${lng}/settings.json`) as { manual: string; resetCoachmarks: string };
    expect(settings.resetCoachmarks.toLowerCase()).toContain(HOME_WORD[lng]);
    expect(settings.resetCoachmarks).not.toBe(settings.manual);
  });

  test("Z52: the permissions screen's closing button does not say continue", () => {
    const permissions = (read(`locales/${lng}/deepspace.json`) as { permissions: { continue: string } }).permissions;
    expect(permissions.continue.length).toBeGreaterThan(0);
    expect(permissions.continue).not.toBe(OLD_CONTINUE[lng]);
  });
});

test("Z52: that button still only closes the screen", () => {
  const screens = fs.readFileSync(path.join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"), "utf8");
  const start = screens.indexOf("export function DeepSpacePermissionsScreen");
  const end = screens.indexOf("\nexport function ", start + 1);
  const screen = screens.slice(start, end);
  expect(screen).toContain("onPress={() => router.back()}");
  expect(screen).toContain('accessibilityLabel={t("permissions.continue")}');
});
