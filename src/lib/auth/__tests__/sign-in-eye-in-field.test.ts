// A-Z first-use check, round 1 (Z11). The show-password button floated on the label row above
// the password field, apart from the field it acts on. It now sits inside the field, at its
// right end, where sign-in screens usually put it.
import fs from "node:fs";
import path from "node:path";

const screen = fs
  .readFileSync(path.join(process.cwd(), "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8")
  .replace(/\r\n/g, "\n");

describe("Z11: the show-password button is inside the password field", () => {
  const input = screen.indexOf("ref={passwordRef}");
  const eye = screen.indexOf("onPress={toggleShowPassword}");
  const surfaceOpen = screen.lastIndexOf("<PixelSurface", input);
  const surfaceClose = screen.indexOf("</PixelSurface>", input);

  test("the button comes after the input and before the field closes", () => {
    expect(input).toBeGreaterThan(-1);
    expect(eye).toBeGreaterThan(input);
    expect(eye).toBeLessThan(surfaceClose);
    expect(screen.slice(surfaceOpen, input)).toContain("contentStyle={styles.passwordContent}");
  });

  test("the field lays the input and the button out in a row, and the input takes the room", () => {
    expect(screen).toMatch(/passwordContent: \{[^}]*flexDirection: "row",[^}]*alignItems: "center",/);
    expect(screen).toContain("style={[styles.input, styles.passwordInput]}");
    // Three longhands, not the `flex` shorthand: mixed with longhands it collapses to 0px on web.
    expect(screen).toContain("passwordInput: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },");
  });

  test("the label stands alone above the field; the old row is gone", () => {
    expect(screen).not.toContain("passwordLabelRow");
    expect(screen).toContain('          <Text style={styles.label}>{t("auth:signIn.password")}</Text>\n');
  });

  test("the button keeps its name, its state and its touch size", () => {
    const block = screen.slice(eye, surfaceClose);
    expect(block).toContain('t("auth:signIn.hidePasswordLabel")');
    expect(block).toContain('t("auth:signIn.showPasswordLabel")');
    expect(block).toContain("accessibilityState={{ selected: showPassword }}");
    expect(screen).toContain("eyeRoot: { width: m3.minTouch, minHeight: m3.minTouch },");
  });

  // #2341 put the sign-in failure notice right after the password field. It must stay there.
  test("the failure notice still follows the password field", () => {
    expect(screen.slice(surfaceClose, surfaceClose + 60)).toContain("{inlineNotice}");
  });
});
