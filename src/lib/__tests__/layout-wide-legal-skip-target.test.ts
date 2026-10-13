// Two findings of the device lab's layout pass over 8081 (2026-10-13, eight widths):
//   Z120  the legal documents ran edge to edge on a wide screen (a 1,240 px line at 1280),
//   Z121  the opening's skip button was a 66 x 28 px target on the web (hitSlop is native only).
// Render tests are blocked in this repo (RN 0.85), so these read the screens' source.
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8").replace(/\r\n/g, "\n");

describe("Z120: the legal documents keep a reading column", () => {
  const screen = read("screens/deepspace/dds-legal-doc-screen.tsx");

  test("the column is 720 wide at most, centred, and keeps the scroll surface's gap", () => {
    expect(screen).toContain("const LEGAL_COLUMN_MAX = 720;");
    expect(screen).toContain('column: { width: "100%", maxWidth: LEGAL_COLUMN_MAX, alignSelf: "center", gap: spacing.md },');
  });

  test("everything under the head sits in the column: metadata, notice, language switch, body and sibling links", () => {
    const open = screen.indexOf("<View style={local.column}>");
    const close = screen.indexOf("</AuthShell>");
    expect(open).toBeGreaterThan(screen.indexOf("<AuthShell head={"));
    expect(screen.match(/<View style=\{local\.column\}>/g)).toHaveLength(1);
    const column = screen.slice(open, close);
    for (const piece of ["{meta ? (", "<GuardianSupervisionNotice />", "<SegBtn", "<View style={styles.card}>", "(crossLinks ?? []).map"]) {
      expect(column).toContain(piece);
    }
    // The column is the last thing in the shell, so nothing of the body is left outside it.
    expect(screen.slice(open, close).trimEnd().endsWith("</View>")).toBe(true);
  });

  test("the head stays in the shell's fixed slot at full width", () => {
    const head = screen.slice(screen.indexOf("<AuthShell head={"), screen.indexOf("<View style={local.column}>"));
    expect(head).toContain("onPress={requestBack}");
    expect(head).not.toContain("local.column");
  });
});

describe("Z121: the opening's skip button is a 44 dp target that still looks small", () => {
  const screen = read("components/ui/LoadingScreen.tsx");
  const skip = screen.slice(screen.indexOf('<Pressable testID="opening-skip"'), screen.indexOf('testID="opening-retry"'));

  test("the pressable itself is the target: no hitSlop, which the web does not apply", () => {
    expect(skip).not.toContain("hitSlop");
    expect(skip).toContain("style={[styles.skipTarget, {");
    expect(screen).toContain("const SKIP_TARGET_PAD = 8;");
    expect(screen).toContain('skipTarget: { position: "absolute", zIndex: 7, minWidth: 44, minHeight: 44, padding: SKIP_TARGET_PAD, alignItems: "center", justifyContent: "center" },');
  });

  test("the chip inside is the same 28 dp chip, drawn where it was", () => {
    expect(skip).toContain("<View style={styles.skip}><Text style={[styles.skipText, !ready && styles.disabled]}>");
    expect(screen).toContain('skip: { minHeight: 28, justifyContent: "center", paddingHorizontal: 8, backgroundColor: deepSpace.bgEdge, borderWidth: 1, borderColor: deepSpace.accentDim },');
    // The target grew by the pad on every side, so its corner moves out by the same pad.
    expect(skip).toContain("bottom: insets.bottom + 12 - SKIP_TARGET_PAD, right: insets.right + 16 - SKIP_TARGET_PAD");
  });

  test("it is still one button with its name, hint and disabled state", () => {
    expect(skip).toContain("onPress={skip}");
    expect(skip).toContain("disabled={!ready}");
    expect(skip).toContain('accessibilityLabel={t("loadingGate.skip")}');
    expect(skip).toContain("accessibilityState={{ disabled: !ready }}");
  });
});
