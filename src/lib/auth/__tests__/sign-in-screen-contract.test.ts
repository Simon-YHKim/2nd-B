import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resetPasswordHref, runAuthActionOnce } from "../sign-in-screen-contract";

const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

describe("PIXEL-CLAY sign-in interaction contract", () => {
  test("prefills recovery only with a trimmed, complete email address", () => {
    expect(resetPasswordHref("  person@example.com ")).toEqual({
      pathname: "/reset-password",
      params: { email: "person@example.com" },
    });
    expect(resetPasswordHref("person@example")).toEqual({
      pathname: "/reset-password",
      params: {},
    });
    expect(resetPasswordHref("unfinished@")).toEqual({
      pathname: "/reset-password",
      params: {},
    });
  });

  test("closes the same-frame double-submit gap and releases after completion", async () => {
    const lock = { current: false };
    let release: (() => void) | undefined;
    let calls = 0;
    const action = async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    const first = runAuthActionOnce(lock, action);
    await expect(runAuthActionOnce(lock, action)).resolves.toBe(false);
    expect(calls).toBe(1);
    expect(lock.current).toBe(true);

    release?.();
    await expect(first).resolves.toBe(true);
    expect(lock.current).toBe(false);
  });

  test("releases the action lock after an error", async () => {
    const lock = { current: false };
    await expect(
      runAuthActionOnce(lock, async () => {
        throw new Error("expected test error");
      }),
    ).rejects.toThrow("expected test error");
    expect(lock.current).toBe(false);
  });
});

describe("PIXEL-CLAY sign-in renderer wiring", () => {
  const source = read("src/screens/deepspace/dds-sign-in-screen.tsx");

  test("uses the shared signed-out shell and square Pixel primitives", () => {
    expect(source).toContain("<PixelGateShell");
    expect(source).toContain("<PixelSurface");
    expect(source).toContain("<PixelPressable");
    expect(source).toContain("<PixelGlyph");
    expect(source).not.toMatch(/<Pressable\b|RadialGradient|borderRadius|opacity|withAlpha|flattenAlpha/);
    expect(source).toContain("minHeight: m3.minTouch");
  });

  test("keeps the real form, provider visibility, and explicit action gates", () => {
    expect(source).toContain("useSignInForm()");
    expect(source).toContain("visibleProviders.map((provider)");
    expect(source).toContain("{naverEnabled ? (");
    expect(source).toContain('secureTextEntry={!showPassword}');
    expect(source).toContain('returnKeyType="next"');
    expect(source).toContain('returnKeyType="go"');
    expect(source).toContain("runAuthActionOnce(actionLock, handleSubmit)");
    expect(source).toContain("runAuthActionOnce(actionLock, () => handleOAuth(provider))");
    expect(source).toContain("runAuthActionOnce(actionLock, handleNaver)");
    expect(source).not.toContain("useEffect(");
  });

  test("routes to the actual recovery, signup, and three legal surfaces", () => {
    expect(source).toContain("router.push(resetPasswordHref(email))");
    expect(source).toContain('router.push("/sign-up")');
    expect(source).toContain('router.push("/terms")');
    expect(source).toContain('router.push("/privacy-policy")');
    expect(source).toContain('router.push("/refund")');
    expect(source).not.toContain("handleForgotPassword");
  });

  test("does not copy typed credentials into labels, hints, or logs", () => {
    const accessibilityLines = source
      .split("\n")
      .filter((line) => /accessibility(?:Label|Hint)/.test(line))
      .join("\n");
    expect(accessibilityLines).not.toMatch(/\{(?:email|password)\}|resetEmailSentTo/);
    expect(source).not.toMatch(/console\.|captureEvent|analytics/);
  });
});

describe("sign-in extraction boundaries", () => {
  test("preserves the shared auth prefix and signup/consent/reset tail byte-for-byte", () => {
    const source = read("src/screens/deepspace/dds-auth-screens.tsx");
    const split = source.indexOf(
      'export { DeepSpaceSignInDesignScreen } from "./dds-sign-in-screen";',
    );
    const tail = source.indexOf("// Deep-space consent block:");

    expect(split).toBeGreaterThan(0);
    expect(tail).toBeGreaterThan(split);
    expect(sha256(source.slice(0, split))).toBe(
      "ec659de33c4cf7fce1532cb2ba1d628a4caa8c3a9ace335dfb58c62e4f3a99eb",
    );
    expect(sha256(source.slice(tail))).toBe(
      "882e345e25bd5df221f32e98397d72deb924c79d6871f2339a6290b0279a9d29",
    );
  });

  test("preserves the legacy sign-in renderer/styles and shared DDS styles", () => {
    expect(sha256(read("src/app/(auth)/sign-in.tsx"))).toBe(
      "bbd32bd8a44d0b6fc014e571379616fa823dd2001da12cfcfdde6268913b075d",
    );
    expect(sha256(read("src/screens/deepspace/dds-styles.ts"))).toBe(
      "c43cb72316d2da920b9831a757ad00f19022465848595f910cdefd213fb2fee5",
    );
  });
});
