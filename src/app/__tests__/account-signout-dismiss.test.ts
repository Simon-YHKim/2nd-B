import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

interface SignOutPath {
  label: string;
  source: string;
  navigationOwner: "success" | "finally";
}

const PATHS: SignOutPath[] = [
  {
    label: "settings sign-out success",
    source: readFileSync(resolve(ROOT, "src/app/settings.tsx"), "utf8").replace(/\r\n/g, "\n"),
    navigationOwner: "success",
  },
  {
    label: "legacy account deletion",
    source: readFileSync(resolve(ROOT, "src/app/account.tsx"), "utf8").replace(/\r\n/g, "\n"),
    navigationOwner: "finally",
  },
  {
    label: "deep-space account deletion",
    source: readFileSync(
      resolve(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n"),
    navigationOwner: "finally",
  },
];

describe("account sign-out navigation dismissal", () => {
  test.each(PATHS)("$label dismisses the owned stack immediately before replacement", ({
    source,
    navigationOwner,
  }) => {
    const signOutAt = source.indexOf("await signOut();");
    const dismissAt = source.indexOf("router.dismissAll();", signOutAt);
    const replaceAt = source.indexOf('router.replace("/sign-in");', signOutAt);

    expect(source.match(/await signOut\(\);/g)).toHaveLength(1);
    expect(source.match(/router\.dismissAll\(\);/g)).toHaveLength(1);
    expect(source.match(/router\.replace\("\/sign-in"\);/g)).toHaveLength(1);
    expect(signOutAt).toBeGreaterThan(-1);
    expect(dismissAt).toBeGreaterThan(signOutAt);
    expect(replaceAt).toBeGreaterThan(dismissAt);
    expect(source.slice(dismissAt, replaceAt)).toMatch(/^router\.dismissAll\(\);\n\s*$/);

    const catchAt = source.indexOf("} catch (e) {", signOutAt);
    if (navigationOwner === "success") {
      expect(replaceAt).toBeLessThan(catchAt);
    } else {
      const finallyAt = source.indexOf("} finally {", catchAt);
      expect(finallyAt).toBeGreaterThan(catchAt);
      expect(dismissAt).toBeGreaterThan(finallyAt);
    }
  });

  test("complete-profile resets the root and nested auth stacks after every successful sign-out", () => {
    const source = readFileSync(
      resolve(ROOT, "src/app/(auth)/complete-profile.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(source.match(/signOutAndSettle\(\{/g)).toHaveLength(3);
    expect(source.match(/if \(signedOut\) \{/g)).toHaveLength(3);
    expect(source.match(/^\s*resetSignedOutNavigation\(\);$/gm)).toHaveLength(3);
    expect(source.match(/rootNavigation\.resetRoot\(\{/g)).toHaveLength(1);
    expect(source).toContain('name: "(auth)"');
    expect(source).toContain('state: { index: 0, routes: [{ name: "sign-in" }] }');
    expect(source).toMatch(
      /if \(!rootNavigation\) \{[\s\S]*?router\.dismissAll\(\);\n\s*router\.replace\("\/sign-in"\);[\s\S]*?return;/,
    );
  });
});
