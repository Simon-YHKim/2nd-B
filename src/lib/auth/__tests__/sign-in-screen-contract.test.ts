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

// 아래 네 digest 를 통합 머지에서 재고정했다. 옛 값은 전부 5b6bbe71 분기점
// 파일이고, main 이 그 뒤 36c887d1·a72c36be·b39c8dcf(로그인 화면 제자리 수정,
// 사업자 푸터, 법무 화면 back/status bar)를 얹었다. 재고정 전에 넷 다
// main@177a5962 와 바이트 동일임을 확인했다 — 즉 이 PR 의 추출은 공용 prefix ·
// consent tail · 레거시 라우트 · dds-styles 를 실제로 안 건드렸고, 이 검사가
// 지키려는 뜻도 그대로다. 기준선만 옮겼다.
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
      "2591e2d2baec3ce3864e7377124d87fcd17a7bd86addcef3234220dea4962151",
    );
    expect(sha256(source.slice(tail))).toBe(
      "25420f9c3b8856627b3d18ffbfcae6c343b6e365f5e202f3cf4b7c33947210a0",
    );
  });

  test("preserves the legacy sign-in renderer/styles and shared DDS styles", () => {
    expect(sha256(read("src/app/(auth)/sign-in.tsx"))).toBe(
      "2cca972a8464dd1e7bca7dc6cbae00c89581786ac80e2eea87817f73a0b2e5da",
    );
    expect(sha256(read("src/screens/deepspace/dds-styles.ts"))).toBe(
      "f34f82ac9976c8f69eec5827501707a912514b17ed9ff4dc180ce6511edafbbe",
    );
  });
});
