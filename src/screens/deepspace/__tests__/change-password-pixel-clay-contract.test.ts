import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SCREEN = join(ROOT, "src", "screens", "deepspace", "dds-change-password-screen.tsx");
const ROUTE = join(ROOT, "src", "app", "change-password.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("PIXEL-CLAY /change-password contract", () => {
  test("keeps auth hydration ahead of the signed-out redirect", () => {
    const source = read(SCREEN);

    expect(source).toContain("const { userId, loading } = useAuth()");
    expect(source).toMatch(/if \(loading\)[\s\S]*?<DeepSpaceLoader/);
    expect(source).toContain('if (!userId) return <Redirect href="/sign-in" />');
  });

  test("owns one signed-in form hook and wires all three secure inputs", () => {
    const source = read(SCREEN);

    expect(occurrences(source, "useChangePasswordForm()")).toBe(1);
    expect(source).not.toContain("useResetPasswordForm");
    expect(source).toContain("value={form.currentPassword}");
    expect(source).toContain("onChangeText={form.setCurrentPassword}");
    expect(source).toContain("value={form.password}");
    expect(source).toContain("onChangeText={form.setPassword}");
    expect(source).toContain("value={form.confirmPassword}");
    expect(source).toContain("onChangeText={form.setConfirmPassword}");
    expect(occurrences(source, "secureTextEntry")).toBe(3);
    expect(occurrences(source, 'autoCapitalize="none"')).toBe(3);
    expect(occurrences(source, "autoCorrect={false}")).toBe(3);
    expect(source).toContain('autoComplete="current-password"');
    expect(occurrences(source, 'autoComplete="new-password"')).toBe(2);
  });

  test("keeps the keyboard flow and Android IME clearance dynamic", () => {
    const source = read(SCREEN);

    expect(source).toContain("const keyboardHeight = useKeyboard()");
    expect(source).toContain("keyboardHeight + m3.spacing.s6 * 2");
    expect(source).toContain('returnKeyType="next"');
    expect(source).toContain("newPasswordRef.current?.focus()");
    expect(source).toContain("confirmPasswordRef.current?.focus()");
    expect(source).toContain('returnKeyType="done"');
    expect(source).not.toMatch(/useWindowDimensions|Dimensions\.get/);
  });

  test("uses the form's validation, submit state, helper, and real reauth route", () => {
    const source = read(SCREEN);

    expect(source).toContain("disabled={!form.canSubmit}");
    expect(source).toContain("accessibilityState={{ busy: form.submitting }}");
    expect(source).toContain("void form.handleSubmit()");
    expect(source).toContain("t(form.helperKey)");
    expect(source).toContain("form.needsReauth ? (");
    expect(source).toContain('router.push("/sign-in")');
    expect(source).toContain('accessibilityRole="link"');
    expect(source).toContain("form.toast ? (");
    expect(source).toContain('accessibilityRole="alert"');
    expect(source).not.toMatch(/(?:fixture|mockSuccess|useResetPasswordForm)/);
  });

  test("uses shared PIXEL-CLAY primitives and Fabric-safe full-width controls", () => {
    const source = read(SCREEN);

    expect(source).toContain("PixelSurface");
    expect(source).toContain("PixelPressable");
    expect(source).toContain("PixelGlyph");
    expect(source).toContain('variant="inset"');
    expect(source).toContain('variant="bevel"');
    expect(source).toContain("fullWidth");
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source).toContain("borderRadius: m3.shape.none");
    expect(source).not.toMatch(/<Pressable\b/);
    expect(source).not.toMatch(/style=\{\s*\(\{?\s*pressed\b/);
    expect(source).not.toMatch(/\b(?:rgba|withAlpha)\s*\(/);
    expect(source).not.toMatch(/\bopacity\s*:\s*0?\.\d+/);
  });

  test("never exposes password values through labels, logs, or snapshots", () => {
    const source = read(SCREEN);

    expect(source).not.toContain("console.");
    expect(source).not.toMatch(/accessibility(?:Label|Hint)=\{form\./);
    expect(source).not.toMatch(/JSON\.stringify\s*\(\s*form/);
    expect(source).not.toMatch(/snapshot/i);
  });

  test("preserves the legacy renderer and styles byte-for-byte", () => {
    const route = read(ROUTE);
    const functionStart = route.indexOf("function ChangePasswordLegacy()");
    const bodyStart = route.indexOf("{", functionStart);
    const stylesStart = route.indexOf("\nconst styles", bodyStart);
    const dispatchStart = route.indexOf("\nexport default function ChangePassword()", stylesStart);

    expect(functionStart).toBeGreaterThan(-1);
    expect(bodyStart).toBeGreaterThan(functionStart);
    expect(stylesStart).toBeGreaterThan(bodyStart);
    expect(dispatchStart).toBeGreaterThan(stylesStart);
    expect(createHash("sha256").update(route.slice(bodyStart, stylesStart)).digest("hex")).toBe(
      "c46d4a7d0223d790461ce56e7ad5e5ef71721b97ecc6f52f12d18a410a91d608",
    );
    expect(createHash("sha256").update(route.slice(stylesStart, dispatchStart).trimEnd()).digest("hex")).toBe(
      "fd3cc62040571ed55a0e89bbc27746a6506073676fbe2a36faadcfc6494699e5",
    );
  });

  test("dispatches by UI mode without conditionally sharing a hook", () => {
    const route = read(ROUTE);

    expect(route).toContain("isDeepSpaceUI()");
    expect(route).toContain("<DeepSpaceChangePasswordScreen />");
    expect(route).toContain("<ChangePasswordLegacy />");
    expect(route).not.toContain("useChangePasswordForm() ?");
  });
});
