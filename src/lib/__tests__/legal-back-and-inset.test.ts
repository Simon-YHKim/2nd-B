import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(SRC, relativePath), "utf8").replace(/\r\n/g, "\n");

const AUTH_SCREENS = read("screens/deepspace/dds-auth-screens.tsx");
// Both legal screens also render inside the dashboard phone (2026-10-02), so
// both pin the phone-aware form of the back contract (the describe block at
// the end of this file): dds-legal-doc-screen.tsx serves /terms, /refund and
// /privacy-policy, dds-consent-notice-screen.tsx serves /consent-notice.
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

// The back contract in its phone-aware form (2026-10-02). /terms, /refund,
// /privacy-policy and /consent-notice can render inside the dashboard phone
// (src/lib/nav/phone-embed.tsx). There a direct BackHandler listener would be
// older than the phone's and lose to it (React runs child effects first), and
// expo-router's `router` would leave the dashboard. So Android Back goes
// through useHardwareBack (a focused BackHandler listener standalone, the
// phone's claim stack inside the phone), navigation through useAppRouter()
// (expo-router's `router` standalone), and the app's floating chip is only
// stood down standalone.
describe.each(LEGAL_SCREENS)("%s back contract (phone-aware)", (screenPath) => {
  const screen = read(screenPath);

  test("focus-scopes its registrations — never mount-scopes them", () => {
    // The native stack keeps buried screens mounted; a mount-scoped
    // registerOwnBack would suppress the global chip app-wide from underneath,
    // and a mount-scoped BackHandler would keep intercepting hardware back.
    expect(screen).toMatch(/import \{[^}]*useFocusEffect[^}]*\} from "expo-router"/);
    expect(screen).toContain('import { registerOwnBack } from "@/lib/nav/own-back"');
    expect(screen).toContain("useHardwareBack(requestBack);");
    // Code, not prose: the screen's comment names BackHandler to explain this.
    expect(screen).not.toContain("BackHandler.addEventListener");
    expect(screen).not.toMatch(/import \{[^}]*\bBackHandler\b[^}]*\} from "react-native"/);
    expect(screen).toMatch(
      /useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(embed\) return undefined;\s*return registerOwnBack\(\);\s*\}, \[embed\]\),\s*\);/,
    );
    expect(screen).not.toMatch(/useEffect\(\(\) => registerOwnBack/);
  });

  test("one guarded action serves the chevron and hardware back, with a no-history replace", () => {
    // replace, not push: push would leave this screen (and its own-back
    // registration) mounted underneath the home it opens on cold entries.
    expect(screen).toContain("const router = useAppRouter();");
    expect(screen).not.toMatch(/import \{[^}]*\brouter\b[^}]*\} from "expo-router"/);
    expect(screen).toMatch(
      /const requestBack = useCallback\(\(\) => \{\s*if \(router\.canGoBack\(\)\) router\.back\(\);[\s\S]{0,400}else router\.replace\("\/"\);\s*return true;\s*\}, \[router\]\);/,
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

// D-08 (QA 261004): /terms, /refund and /privacy-policy put the title in a row
// next to the chevron. Native Text does not shrink by default, so "Refund
// Policy" ran past the right edge on Android. The title must shrink and wrap.
describe("legal document title row", () => {
  const screen = read("screens/deepspace/dds-legal-doc-screen.tsx");

  test("the title wraps inside the row instead of running off the edge", () => {
    expect(screen).toContain('style={[styles.title, local.title]} accessibilityRole="header"');
    expect(screen).toContain("title: { flexShrink: 1 },");
  });
});
