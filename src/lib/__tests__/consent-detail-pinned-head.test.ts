import fs from "node:fs";
import path from "node:path";

// Device round 7 (2026-10-12): /consent-notice opens scrolled to its ?item=
// section, and the chevron sat inside the scroll content, so it opened off the
// top of the screen. The title row now sits in the shell's non-scroll frame.
// (Render tests are blocked in this repo; these read the shipped source.)

const SRC = path.resolve(__dirname, "../..");
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(SRC, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("auth shell head slot", () => {
  const authScreens = read("screens/deepspace/dds-auth-screens.tsx");
  const authShell = authScreens.slice(
    authScreens.indexOf("export function AuthShell"),
    authScreens.indexOf("// Provider leading marks"),
  );

  test("takes an optional head", () => {
    expect(authShell).toMatch(/export function AuthShell\(\{ children, scrollRef, head \}/);
    expect(authShell).toContain("head?: ReactNode");
  });

  test("draws the head below the top inset and above the scroll surface", () => {
    expect(authShell).toMatch(
      /<KeyboardAvoidingArea\s+style=\{\{ flex: 1, paddingTop: insets\.top \}\}\s*>\s*\{head\}\s*<ScrollView/,
    );
  });

  test("never draws the head inside the scroll surface", () => {
    const scroll = authShell.slice(authShell.indexOf("<ScrollView\n"), authShell.indexOf("</ScrollView>"));
    expect(scroll).toContain("{children}");
    expect(scroll).not.toContain("{head}");
  });
});

// The three legal documents share the frame: a long document read to its end
// kept Back a full scroll away. Same head slot (Simon 2026-10-13, remaining work).
describe("/terms, /privacy-policy and /refund keep Back on screen", () => {
  const screen = read("screens/deepspace/dds-legal-doc-screen.tsx");
  const head = screen.slice(screen.indexOf("<AuthShell head={"), screen.indexOf("{meta ? ("));

  test("hands the title row to the shell head", () => {
    expect(screen).toMatch(/<AuthShell head=\{\s*<View style=\{\[styles\.titleRow, local\.head\]\}>/);
    expect(head).toContain("onPress={requestBack}");
    expect(head).toContain("{doc.title}");
    expect(screen.match(/onPress=\{requestBack\}/g)).toHaveLength(1);
  });

  test("the head carries the scroll surface's side gutter", () => {
    expect(screen).toContain("head: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },");
  });
});

describe("/consent-notice keeps Back on screen", () => {
  const screen = read("screens/deepspace/dds-consent-notice-screen.tsx");
  const head = screen.slice(screen.indexOf("head={"), screen.indexOf("consent:detail.intro"));

  test("hands the title row to the shell head", () => {
    expect(screen).toMatch(/<AuthShell\s+scrollRef=\{scrollRef\}\s+head=\{/);
    expect(head).toContain("onPress={requestBack}");
    expect(head).toContain("style={local.backTarget}");
    expect(head).toContain('{t("consent:detail.title")}');
  });

  test("the chevron is drawn once", () => {
    expect(screen.match(/onPress=\{requestBack\}/g)).toHaveLength(1);
  });

  test("the head carries the scroll surface's side gutter, since it left that surface", () => {
    expect(screen).toContain("style={[styles.titleRow, local.head]}");
    expect(screen).toContain("head: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },");
  });

  test("still jumps to the ?item= section", () => {
    expect(screen).toContain("scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true })");
  });
});
