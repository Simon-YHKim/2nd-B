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
    expect(source).toContain("<PixelStarSvg");
    expect(source).not.toContain("<SecondbHead");
    expect(source).not.toContain("signInEncrypt");
    expect(source).not.toMatch(/<Pressable\b|RadialGradient|borderRadius|opacity|withAlpha|flattenAlpha/);
    expect(source).toContain("minHeight: m3.minTouch");
  });

  test("fills and twinkles the loading Polaris with reduced-motion support", () => {
    expect(source).toContain('import { LoadingPolaris } from "@/components/deepspace/LoadingPolaris"');
    expect(source).toContain(
      '<LoadingPolaris size={112} accessibilityLabel={t("home:ds.home.polaris")} />',
    );
    expect(source).not.toContain("function LoadingPolaris");
  });

  test("lets the form and legal copy share the gate background", () => {
    expect(source).toContain("<View style={[styles.formSurface, styles.form]}>");
    expect(source).toContain("<View style={styles.legal}>");
    expect(source).not.toContain(
      '<PixelSurface variant="frame" style={styles.formSurface} contentStyle={styles.form}>',
    );
    expect(source).not.toContain('<PixelSurface variant="flat" contentStyle={styles.legal}>');
    expect(source.match(/variant="inset"/g)).toHaveLength(2);
  });

  test("keeps the real form, provider visibility, and explicit action gates", () => {
    expect(source).toContain("useSignInForm()");
    expect(source).toContain(
      'const SIGN_IN_PROVIDERS = ["google", "apple", "github"] as const',
    );
    expect(source).toContain("visibleProviders.includes(provider)");
    expect(source).toContain("signInProviders.map((provider)");
    expect(source).toContain("<ProviderBrandIcon provider={provider} />");
    expect(source).toContain('secureTextEntry={!showPassword}');
    expect(source).toContain('returnKeyType="next"');
    expect(source).toContain('returnKeyType="go"');
    expect(source).toContain("runAuthActionOnce(actionLock, handleSubmit)");
    expect(source).toContain("runAuthActionOnce(actionLock, () => handleOAuth(provider))");
    expect(source).not.toContain("PROVIDER_MONOGRAM");
    expect(source).not.toContain("handleNaver");
    expect(source).not.toContain("naverEnabled");
  });

  test("renders the three retained brands as crisp pixel geometry", () => {
    expect(source).toContain('<Svg width={32} height={32} viewBox="0 0 16 16">');
    expect(source).toContain("PIXEL_BRAND_CELLS[provider].map");
    expect(source).toContain("<Rect");
    expect(source).toContain('"#EA4335"');
    expect(source).toContain('"#FBBC05"');
    expect(source).toContain('"#34A853"');
    expect(source).toContain('"#4285F4"');
  });

  test("uses the raised bevel as the standard for sign-in actions and legal links", () => {
    expect(source).toMatch(
      /variant="bevel"\s+onPress=\{\(\) => void submit\(\)\}/,
    );
    expect(source).toMatch(
      /variant="bevel"\s+onPress=\{\(\) => router\.push\(resetPasswordHref\(email\)\)\}/,
    );
    const legalLink = source.slice(source.indexOf("function LegalLink"), source.indexOf("const styles"));
    expect(legalLink).toContain('variant="bevel"');
    expect(source).not.toContain('variant={submitDisabled ? "inset" : "bevel"}');
  });

  test("aligns lower actions to the same horizontal inset as the form controls", () => {
    expect(source).toContain("<View style={styles.actionInset}>");
    expect(source).toContain('<View style={[styles.legalLinks, styles.actionInset]}>');
    expect(source).toContain(
      'actionInset: { alignSelf: "stretch", paddingHorizontal: m3.spacing.s4 },',
    );
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
// 2026-09-13: prefix · tail 두 digest 를 재고정했다. reset-password 가
// AuthContext 의 bounded retry 를 직접 노출하면서 prefix 에 import 한 줄,
// tail 에 announced retry surface 가 추가됐다.
// 2026-09-30: prefix digest 만 재고정했다. Text 를 react-native 대신
// @/components/ui/PlainText 에서 가져오는 import 두 줄뿐이다(앱 전체 한국어
// 줄바꿈, plain-text-guard.test.ts). tail 은 그대로다.
// 2026-10-05: prefix 를 재고정하고 tail 의 표지를 바꿨다. 라우트가 그리지 않던 가입
// 화면 그림자 사본(DeepSpaceSignUpDesignScreen + 그 동의 블록 · 공급자 줄 · 토스트)이
// 롤백 레버 제거 PR(Simon 결정 Q-261004-11 C)에서 나가면서, prefix 는 머리 주석과
// 그 사본만 쓰던 import 가 줄었고 tail 의 옛 표지 "// Deep-space consent block:" 은
// 사본과 함께 사라졌다. 이제 tail 은 재설정 화면(function ResetAction 부터 끝까지)이고,
// 그 바이트는 e0b274d0 의 같은 구간과 **동일**하다(재고정 전 대조) — 재설정 화면은
// 이 PR 에서 한 바이트도 안 바뀌었다.
// 아래 "legacy sign-in renderer" 핀은 은퇴했다(그 테스트 안 주석).
describe("sign-in extraction boundaries", () => {
  test("preserves the shared auth prefix and reset tail byte-for-byte", () => {
    const source = read("src/screens/deepspace/dds-auth-screens.tsx");
    const split = source.indexOf(
      'export { DeepSpaceSignInDesignScreen } from "./dds-sign-in-screen";',
    );
    const tail = source.indexOf("function ResetAction({");

    expect(split).toBeGreaterThan(0);
    expect(tail).toBeGreaterThan(split);
    expect(sha256(source.slice(0, split))).toBe(
      "f37c03e2ac773fca003c7075ac5c173e87e4eff755a8c7f257874c420622e735",
    );
    expect(sha256(source.slice(tail))).toBe(
      "b72fc5f6f9c95fa703d70895db4630b10b233452d526703bf5f3426e60c8fb0c",
    );
  });

  test("preserves the shared DDS styles", () => {
    // 2026-10-05: 여기 있던 레거시 로그인 렌더러 digest(2cca972a…)를 걷었다. 그 보관본
    // legacy/screens/sign-in.tsx 가 E:/Legacy/2ndB 로 나갔고(같은 바이트, MANIFEST batch
    // qa261004-lever), 검사는 보관본을 읽지 않는다(legacy-archive-integrity.test.ts).
    // 이제 바이트를 지키는 것은 E:/Legacy 의 sha256 기록이다.
    expect(sha256(read("src/screens/deepspace/dds-styles.ts"))).toBe(
      "f34f82ac9976c8f69eec5827501707a912514b17ed9ff4dc180ce6511edafbbe",
    );
  });
});
