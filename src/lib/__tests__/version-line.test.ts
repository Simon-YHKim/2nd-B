// A-Z first-use check, round 7 (Z94). Settings ended in the raw bundle identity
// ("v1275e8cd0ca0… · ? · embedded cab1b35f"); a first-time user read the "?" as an error.
// The support screen, meanwhile, printed a frozen "PolaScope v1.0.0" while app.json said 0.10.0.
// Both now show the real version; the bundle identity opens on a tap of the Settings line.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("the Settings footer shows the app version first", () => {
  const settings = read("src/app/settings.tsx");
  const line = read("src/components/ui/VersionLine.tsx");

  test("Settings draws the version line and no longer prints the bundle identity itself", () => {
    expect(settings).toContain("<VersionLine style={styles.buildMarker} />");
    expect(settings).not.toContain("{buildInfoLine()}");
  });

  test("the bundle identity is drawn only once the line was tapped", () => {
    expect(line).toContain('{t("versionLine", { version })}');
    expect(line).toContain("{open ? <Text");
    expect(line).toContain("onPress={() => setOpen((was) => !was)}");
    expect(line).toContain("accessibilityState={{ expanded: open }}");
    const closed = line.slice(line.indexOf("return (", line.indexOf("if (!version)")), line.indexOf("{open ?"));
    expect(closed).not.toContain("buildInfoLine()");
  });

  // Where the version cannot be read there is nothing friendlier to show, and hiding the
  // only identifier would leave a tester with no way to tell which bundle is running.
  test("with no readable version the bundle identity stays visible", () => {
    expect(line).toContain("if (!version) return <Text");
    expect(line.slice(line.indexOf("if (!version)"), line.indexOf("return (", line.indexOf("if (!version)")))).toContain("{buildInfoLine()}");
  });

  test("the version comes from app.json through one reader", () => {
    expect(read("src/lib/build-info.ts")).toContain('export { getAppVersion as appVersion } from "./notices/version";');
    expect(read("src/lib/notices/version.ts")).toContain("constants?.expoConfig?.version ?? null");
  });

  test.each(LOCALES)("%s names the line and leaves room for the number", (lang) => {
    const bundle = JSON.parse(read(`locales/${lang}/settings.json`)) as { versionLine?: string };
    expect(bundle.versionLine).toMatch(/\S \{\{version\}\}$/);
  });
});

describe("the support footer states the running version, not a frozen one", () => {
  test("the screen hands the real version to the sentence", () => {
    expect(read("src/screens/deepspace/DeepSpaceDesignScreens.tsx")).toContain(
      '{t("support.footer", { version: appVersion() ?? "?" })}',
    );
  });

  test.each(LOCALES)("%s has no version number typed into the sentence", (lang) => {
    const bundle = JSON.parse(read(`locales/${lang}/deepspace.json`)) as { support: { footer: string } };
    expect(bundle.support.footer.startsWith("PolaScope v{{version}} · ")).toBe(true);
    expect(bundle.support.footer).not.toMatch(/v\d/);
  });
});
