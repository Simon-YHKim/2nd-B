import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("visible brand copy", () => {
  test("auth screens render the canonical app-name token", () => {
    // Legacy UI track removed 2026-06-23: src/app/(auth)/sign-in.tsx + sign-up.tsx are
    // now thin wrappers over the deep-space design screens. The canonical brand name is
    // rendered there through the localized t("deepspace:auth.appName") token (the
    // deep-space sign-up header uses its own deepspace:auth.signUpTitle copy), and the
    // hardcoded "2ND-BRAIN" literal is gone — that is the surviving guarantee.
    const root = path.resolve(__dirname, "../../..");
    const screens = readFileSync(
      path.join(root, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    );

    expect(screens).toContain('t("deepspace:auth.appName")');
    expect(screens).not.toContain("2ND-BRAIN");
  });

  // Legacy UI track removed 2026-06-23: the "visible home back affordance beside the
  // brand" case pinned the legacy auth layout (styles.authBackButton + styles.brandSlot
  // + router.push("/") + t("common:navGraph.drilldown.back")). The deep-space AuthShell
  // has no brand-slot home-back affordance — sign-in instead offers route links to
  // /sign-up and /jot — so this legacy-only layout assertion has no surviving equivalent
  // and is removed.

  test("app surfaces use 2nd-Brain instead of informal 2nd-B or 2ndB", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "locales/en/consent.json",
      "locales/ko/consent.json",
      "locales/en/import.json",
      "locales/ko/import.json",
      "locales/en/permissions.json",
      "locales/ko/permissions.json",
      "locales/en/support.json",
      "locales/ko/support.json",
      "src/app/manual.tsx",
      "src/components/premium/surfaces.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/2nd-B(?!rain)|2ndB/);
    }
  });

  test("Korean locale copy uses 세컨비 for the AI companion", () => {
    const root = path.resolve(__dirname, "../../..");
    const localeDir = path.join(root, "locales/ko");

    for (const file of readdirSync(localeDir).filter((name) => name.endsWith(".json"))) {
      const source = readFileSync(path.join(localeDir, file), "utf8");
      expect(source).not.toMatch(/\bSecondB\b/);
    }

    const appFiles = [
      "src/app/core-brain.tsx",
      "src/app/secondb.tsx",
      "src/app/settings.tsx",
      "src/app/wiki.tsx",
      "src/components/premium/tab-bar.tsx",
      "src/components/ui/BackArrow.tsx",
    ];

    for (const file of appFiles) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/세컨드비/);
    }
  });
});
