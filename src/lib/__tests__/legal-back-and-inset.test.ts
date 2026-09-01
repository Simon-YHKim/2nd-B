import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(SRC, relativePath), "utf8").replace(/\r\n/g, "\n");

const AUTH_SCREENS = read("screens/deepspace/dds-auth-screens.tsx");
const LEGAL_SCREENS = [
  "screens/deepspace/dds-legal-doc-screen.tsx",
  "screens/deepspace/dds-consent-notice-screen.tsx",
] as const;

describe("legal auth-shell frame", () => {
  const authShell = AUTH_SCREENS.slice(
    AUTH_SCREENS.indexOf("export function AuthShell"),
    AUTH_SCREENS.indexOf("// Provider leading marks"),
  );

  test("puts the top safe inset on the non-scroll frame, not the scroll surface", () => {
    // KAV (a plain View on Android; iOS behavior="padding" only manages its own
    // bottom padding) owns the top inset, so the viewport starts below the
    // status bar at EVERY scroll position — including /consent-notice's mount
    // auto-scroll to ?item=, which a contentContainer paddingTop scrolls past.
    expect(authShell).toMatch(/KeyboardAvoidingView[\s\S]{0,160}paddingTop: insets\.top/);
    expect(authShell).not.toMatch(/ScrollView[\s\S]{0,200}paddingTop/);
    expect(authShell).not.toContain("paddingTop: insets.top + spacing.lg");
  });

  test("preserves the Android bottom inset verbatim (QA guideline: dynamic, not fixed)", () => {
    expect(authShell).toContain(
      "contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(40, insets.bottom + 24) }]}",
    );
  });
});

describe.each(LEGAL_SCREENS)("%s back contract", (screenPath) => {
  const screen = read(screenPath);

  test("focus-scopes its registrations — never mount-scopes them", () => {
    // The native stack keeps buried screens mounted; a mount-scoped
    // registerOwnBack would suppress the global chip app-wide from underneath,
    // and a mount-scoped BackHandler would keep intercepting hardware back.
    expect(screen).toMatch(/import \{[^}]*useFocusEffect[^}]*\} from "expo-router"/);
    expect(screen).toContain('import { registerOwnBack } from "@/lib/nav/own-back"');
    expect(screen).toMatch(
      /useFocusEffect\(\s*useCallback\(\(\) => \{\s*const unregister = registerOwnBack\(\);\s*const sub = BackHandler\.addEventListener\("hardwareBackPress", requestBack\);/,
    );
    // Blur must release BOTH registrations together.
    expect(screen).toMatch(/sub\.remove\(\);\s*unregister\(\);/);
    expect(screen).not.toMatch(/useEffect\(\(\) => registerOwnBack/);
  });

  test("one guarded action serves the chevron and hardware back, with a no-history replace", () => {
    // replace, not push: push would leave this screen (and its own-back
    // registration) mounted underneath the home it opens on cold entries.
    expect(screen).toMatch(
      /const requestBack = useCallback\(\(\) => \{\s*if \(router\.canGoBack\(\)\) router\.back\(\);[\s\S]{0,400}else router\.replace\("\/"\);\s*return true;\s*\}, \[\]\);/,
    );
    expect(screen).toContain("onPress={requestBack}");
    expect(screen).not.toContain('router.push("/")');
  });

  test("the surviving chevron keeps the chip-sized touch target", () => {
    expect(screen).toContain("minWidth: m3.minTouch");
    expect(screen).toContain("minHeight: m3.minTouch");
    expect(screen).toContain("style={local.backTarget}");
  });
});
