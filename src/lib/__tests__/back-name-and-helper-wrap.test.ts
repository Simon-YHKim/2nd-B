// Device Lab round 6 (2026-10-12), two low findings on signed-out screens.
// O3: the legal and consent-notice screens named their back button "Back to the
// full constellation", the home drilldown's name, while the button goes to the
// previous screen (sign-up or sign-in). R6-1: the date field's helper line was
// capped at two lines, so at 2.0x font scale it ended in "...".
// Source contracts: render tests are not available here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

describe("signed-out screens: the back button says where it goes", () => {
  const SCREENS = ["src/screens/deepspace/dds-legal-doc-screen.tsx", "src/screens/deepspace/dds-consent-notice-screen.tsx"];

  it.each(SCREENS)("%s names its back button Back, not the constellation", (file) => {
    const source = read(file);
    // The button steps back through history (or home when there is none).
    expect(source).toContain("if (router.canGoBack()) router.back();");
    expect(source).toContain('accessibilityLabel={t("common:actions.back")}');
    expect(source).not.toContain("navGraph.drilldown.back");
  });

  it.each(["en", "ko", "es", "pt", "id"])("%s has the plain back name", (lng) => {
    const common = JSON.parse(read(`locales/${lng}/common.json`)) as { actions: Record<string, unknown> };
    expect(typeof common.actions.back).toBe("string");
    expect(String(common.actions.back).length).toBeGreaterThan(0);
  });
});

describe("sign-up: the top-bar control says it goes to sign-in", () => {
  const signUp = read("src/screens/deepspace/dds-sign-up-screen.tsx");

  it("it leaves through the home route, which sends a signed-out visitor to sign-in", () => {
    expect(signUp).toContain('if (canLeaveGate()) router.push("/");');
  });

  it("its spoken name and hint name the sign-in screen, not the constellation", () => {
    // Z18 (2026-10-14): on the confirmation-code step the same arrow goes back to the form, and says so.
    expect(signUp).toContain('accessibilityLabel={confirmSentTo !== null ? t("auth:signUp.confirmBackToForm") : t("auth:signUp.existingAccountSignIn")}');
    expect(signUp).toContain('accessibilityHint={confirmSentTo !== null ? undefined : t("auth:signUp.signInHint")}');
    expect(signUp).not.toContain("navGraph.drilldown");
  });

  it.each(["en", "ko", "es", "pt", "id"])("%s carries both strings", (lng) => {
    const auth = JSON.parse(read(`locales/${lng}/auth.json`)) as { signUp: Record<string, unknown> };
    expect(typeof auth.signUp.existingAccountSignIn).toBe("string");
    expect(typeof auth.signUp.signInHint).toBe("string");
    expect(String(auth.signUp.confirmBackToForm ?? "").length).toBeGreaterThan(0);
  });
});

describe("date field helper: wraps instead of ending in an ellipsis", () => {
  it("the supporting line has no line cap", () => {
    const picker = read("src/components/m3/date-picker/DatePicker.tsx");
    const at = picker.indexOf("{supportingText ? (");
    expect(at).toBeGreaterThan(0);
    const block = picker.slice(at, picker.indexOf(") : null}", at));
    expect(block).toContain("{supportingText}");
    expect(block).not.toContain("numberOfLines");
  });
});
