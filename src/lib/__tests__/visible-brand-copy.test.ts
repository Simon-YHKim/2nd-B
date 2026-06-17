import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("visible brand copy", () => {
  test("auth screens render the canonical app-name token", () => {
    const root = path.resolve(__dirname, "../../..");
    const signIn = readFileSync(path.join(root, "src/app/(auth)/sign-in.tsx"), "utf8");
    const signUp = readFileSync(path.join(root, "src/app/(auth)/sign-up.tsx"), "utf8");

    expect(signIn).toContain('t("common:app.name")');
    expect(signUp).toContain('t("common:app.name")');
    expect(signIn).not.toContain("2ND-BRAIN");
  });

  test("auth screens keep a visible home back affordance beside the brand", () => {
    const root = path.resolve(__dirname, "../../..");
    const signIn = readFileSync(path.join(root, "src/app/(auth)/sign-in.tsx"), "utf8");
    const signUp = readFileSync(path.join(root, "src/app/(auth)/sign-up.tsx"), "utf8");

    for (const source of [signIn, signUp]) {
      expect(source).toContain("styles.authBackButton");
      expect(source).toContain('router.push("/")');
      expect(source).toContain('t("common:navGraph.drilldown.back")');
      expect(source).toContain("styles.brandSlot");
    }
  });

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
