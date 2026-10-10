import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("react-native", () => ({
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: { OS: "web" },
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("expo-linking", () => ({ useURL: jest.fn(() => null) }));
jest.mock("react-i18next", () => ({
  useTranslation: jest.fn(() => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  })),
}));
jest.mock("@/lib/auth/AuthContext", () => ({
  useAuth: jest.fn(() => ({ userId: null, loading: false, refresh: jest.fn() })),
}));
jest.mock("@/lib/supabase/auth", () => ({
  ageInYears: jest.fn(() => 20),
  consumeAuthCallbackUrl: jest.fn(),
  signUpWithEmail: jest.fn(),
  verifySignUpCode: jest.fn(),
  isNaverEnabled: jest.fn(() => false),
  isProviderEnabled: jest.fn(() => true),
  signInWithNaver: jest.fn(),
  MIN_SELF_CONSENT_AGE: 14,
  AgeGateError: class AgeGateError extends Error {},
  BreachedPasswordError: class BreachedPasswordError extends Error {},
  ExistingAccountLikelyError: class ExistingAccountLikelyError extends Error {},
}));
jest.mock("@/lib/auth/auth-providers", () => ({
  OAUTH_PROVIDER_LABEL: {
    google: "Google",
    apple: "Apple",
    kakao: "Kakao",
    facebook: "Facebook",
    github: "GitHub",
  },
  SUPABASE_OAUTH_PROVIDERS: ["google", "apple", "kakao", "facebook", "github"],
  startOAuthProvider: jest.fn(),
}));
jest.mock("@/lib/supabase/consent", () => ({ recordConsentBestEffort: jest.fn() }));
jest.mock("@/lib/auth/sign-up-flow", () => ({ submitSignUp: jest.fn() }));

import { REQUIRED_ACK_KEYS } from "../consent-selections";
import {
  beginSignUpAction,
  createSignUpActionLock,
  invalidateSignUpActions,
  ownsSignUpAction,
  releaseSignUpAction,
} from "../useSignUpForm";

const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const screen = read("src/screens/deepspace/dds-sign-up-screen.tsx");
const hook = read("src/lib/auth/useSignUpForm.ts");
const route = read("src/app/(auth)/sign-up.tsx");
// 레거시 렌더러는 2026-09-08 에 아카이브(legacy/screens/sign-up.tsx)로 나갔고, 그
// 보관본은 2026-10-05 롤백 레버 제거와 함께 E:/Legacy/2ndB 로 나갔다(Simon 결정
// Q-261004-11 C, 같은 바이트). 검사는 보관본을 읽지 않으므로(legacy-archive-integrity.test.ts)
// 그 바이트 핀 둘(630043be… · 5df5b8ca…)도 함께 은퇴했다 - 이제 바이트를 지키는 것은
// E:/Legacy MANIFEST 의 sha256 기록이다.

describe("sign-up action ownership", () => {
  test("one synchronous lock blocks same-frame and cross-action races", () => {
    const lock = createSignUpActionLock();
    const emailOwner = beginSignUpAction(lock, "email");

    expect(emailOwner).not.toBeNull();
    expect(beginSignUpAction(lock, "email")).toBeNull();
    expect(beginSignUpAction(lock, "oauth")).toBeNull();
    expect(ownsSignUpAction(lock, "email", emailOwner as number)).toBe(true);

    expect(releaseSignUpAction(lock, "email", emailOwner as number)).toBe(true);
    expect(beginSignUpAction(lock, "verify")).not.toBeNull();
  });

  test("a stale owner cannot release a newer action", () => {
    const lock = createSignUpActionLock();
    const oldOwner = beginSignUpAction(lock, "oauth") as number;
    invalidateSignUpActions(lock);
    const currentOwner = beginSignUpAction(lock, "naver") as number;

    expect(releaseSignUpAction(lock, "oauth", oldOwner)).toBe(false);
    expect(ownsSignUpAction(lock, "naver", currentOwner)).toBe(true);
    expect(releaseSignUpAction(lock, "naver", currentOwner)).toBe(true);
  });

  test("the hook owns all four writes and releases each terminal path", () => {
    for (const action of ["email", "oauth", "naver", "verify"] as const) {
      expect(hook).toContain(`beginSignUpAction(actionLockRef.current, "${action}")`);
      expect(hook).toContain(`releaseSignUpAction(actionLockRef.current, "${action}", owner)`);
    }
    expect(screen).not.toContain("actionLock");
    expect(screen).not.toMatch(/signUpWithEmail|verifySignUpCode|startOAuthProvider|signInWithNaver/);
  });

  test("callback success invalidates stale work and clears every busy projection", () => {
    const callback = hook.slice(
      hook.indexOf("consumeAuthCallbackUrl(deepLinkUrl)"),
      hook.indexOf("// D2 (Simon 2026-10-10)"),
    );
    expect(callback).toContain("invalidateSignUpActions(actionLockRef.current)");
    expect(callback).toContain("setSubmitting(false)");
    expect(callback).toContain("setOauthSubmitting(false)");
    expect(callback).toContain("setConfirmVerifying(false)");
    expect(hook).toContain("consumedUrlRef.current === deepLinkUrl");
  });

  test("native sign-up callbacks never accept bearer tokens from the URL", () => {
    const callback = hook.slice(
      hook.indexOf("// Supabase's detectSessionInUrl handles web confirmation links."),
      hook.indexOf("// D2 (Simon 2026-10-10)"),
    );
    expect(callback).toContain("(?:code|error_code)");
    expect(callback).not.toContain("access_token");
  });
});

describe("PIXEL-CLAY sign-up renderer", () => {
  test("the route renders the isolated renderer and nothing else", () => {
    // ⚠ 여기서 확인하는 import 경로가 요점이다. dds-auth-screens.tsx 에 같은 이름의
    // 그림자 사본이 있고, 그걸 가리키면 **배송 화면이 조용히 바뀐다**(2026-09-08 에
    // 실제로 그렇게 쓸 뻔했다). shadow-screens.test.ts 가 그 짝을 따로 못박는다.
    expect(route).toContain(
      'import { DeepSpaceSignUpDesignScreen } from "@/screens/deepspace/dds-sign-up-screen";',
    );
    expect(route).toContain("return <DeepSpaceSignUpDesignScreen />;");
    // 폴백은 사라졌다 — 레거시 렌더러는 저장소 밖(E:/Legacy/2ndB)에 있다.
    expect(route).not.toContain("SignUpLegacy");
    expect(route).not.toContain("isDeepSpace" + "UI");
  });

  test("uses the gate shell and only square Pixel interaction primitives", () => {
    expect(screen).toContain("<PixelGateShell");
    expect(screen).toContain("<PixelSurface");
    expect(screen).toContain("<PixelPressable");
    expect(screen).toContain("<PixelGlyph");
    expect(screen).not.toMatch(/<Pressable\b|<Path\b|<Circle\b|<Polyline\b/);
    expect(screen).not.toMatch(
      /borderRadius|\bopacity\b|shadow(?:Color|Opacity|Radius|Offset)|\bblur\b|Gradient|withAlpha|flattenAlpha/,
    );
    expect(screen).toContain("minHeight: m3.minTouch");
    expect(screen).not.toMatch(/style=\{\s*\(\{\s*pressed/);
  });

  test("keeps the real email, password, calendar DOB, validation, and confirmation flow", () => {
    expect(screen).toContain("useSignUpForm()");
    expect(screen).toContain('keyboardType="email-address"');
    expect(screen).toContain("secureTextEntry");
    expect(screen).toContain("<BirthDateField");
    expect(screen).toContain("ageInYears(birthDate) >= minConsentAge");
    expect(screen).toContain('autoComplete="one-time-code"');
    expect(screen).toContain('textContentType="oneTimeCode"');
    expect(screen).toContain("canVerifyConfirmCode");
    expect(screen).toContain('t("auth:signUp.confirmSentBody", { email: confirmSentTo })');
  });

  test("renders every required acknowledgement plus optional marketing and separate details", () => {
    expect(REQUIRED_ACK_KEYS).toEqual([
      "service",
      "llmProcessing",
      "overseasTransfer",
      "sensitiveData",
      "safetyNotice",
    ]);
    expect(screen).toContain("REQUIRED_ACK_KEYS.map((key)");
    for (const key of REQUIRED_ACK_KEYS) expect(screen).toContain(`${key}: "consent:notice.`);
    expect(screen).toContain("checked={value.marketing}");
    expect(screen).toContain('onToggle={() => toggle("marketing")}');
    expect(screen).toContain('pathname: "/consent-notice"');
    expect(screen).toContain('accessibilityRole="checkbox"');
    expect(screen).toContain("accessibilityState={{ checked }}");
  });

  test("provider flags reflow without an empty divider and keep provider-specific marks", () => {
    expect(screen).toContain("{visibleProviders.length > 0 || naverEnabled ? (");
    expect(screen).toContain("visibleProviders.map((provider)");
    expect(screen).toContain("{naverEnabled ? (");
    expect(screen).toContain("<ProviderBrandIcon provider={provider} />");
    expect(screen).not.toContain('name="account"');
    expect(screen).toContain('flexWrap: "wrap"');
    expect(screen).toContain("minWidth: 112");
    expect(screen).toContain("disabled={formLocked}");
  });

  test("keeps actual recovery routes behind the synchronous leave guard", () => {
    expect(screen).toContain('router.push("/sign-in")');
    expect(screen).toContain('router.push("/manual")');
    expect(screen).toContain('router.push("/terms")');
    expect(screen).toContain('router.push("/")');
    expect(screen).toContain("if (canLeaveGate())");
    expect(hook).toContain("if (actionLockRef.current.active !== null) return true;");
    expect(hook).toContain('router.dismissTo("/sign-in")');
    expect(hook).not.toContain('router.push("/")');
  });

  test("the only screen effect reveals the new confirmation primary state", () => {
    expect(screen.match(/useEffect\(/g)).toHaveLength(1);
    const effect = screen.slice(screen.indexOf("useEffect("), screen.indexOf("if (loading)"));
    expect(effect).toContain("scrollRef.current?.scrollTo({ y: 0, animated: false })");
    expect(effect).not.toMatch(/handleSubmit|handleOAuth|handleNaver|handleVerify|router\./);
  });

  test("credentials and raw errors never enter labels, hints, analytics, or logs", () => {
    const accessibilityLines = screen
      .split("\n")
      .filter((line) => /accessibility(?:Label|Hint)/.test(line))
      .join("\n");
    expect(accessibilityLines).not.toMatch(/\{(?:email|password|birthDate|confirmCode)\}/);
    expect(screen).not.toMatch(/console\.|analytics|captureEvent/);
    const logLines = hook
      .split("\n")
      .filter((line) => /console\.(?:warn|error|log)/.test(line))
      .join("\n");
    expect(logLines).not.toMatch(
      /\.message|result\.message|deepLinkUrl|email|password|birthDate|confirmCode|token|\bmsg\b/,
    );
  });
});

describe("sign-up authority and preservation boundaries", () => {
  test("canSubmit and confirmation verification fail closed", () => {
    const canSubmit = hook.slice(
      hook.indexOf("const canSubmit"),
      hook.indexOf("const setEmailAndClearHelp"),
    );
    expect(canSubmit).toContain('email.includes("@")');
    expect(canSubmit).toContain("password.length >= 8");
    expect(canSubmit).toContain("residenceReady &&");
    expect(canSubmit).toContain("ageInYears(birthDate) >= minConsentAge");
    expect(canSubmit).toContain("allRequiredAcksChecked(consent)");
    expect(canSubmit).toContain("!loading");
    expect(canSubmit).toContain("!userId");
    expect(canSubmit).toContain("!confirmSentTo");
    expect(canSubmit).toContain("!submitting");
    expect(canSubmit).toContain("!oauthSubmitting");
    expect(canSubmit).toContain("!confirmVerifying");
    expect(hook).toContain("/^\\d{6}$/.test(confirmCode.trim())");
    expect(hook).toContain("rememberConfirmationTarget(email.trim())");
    expect(screen).toContain("const formLocked = actionBusy || confirmSentTo !== null");
    expect(screen).toContain("editable={!actionBusy}");
    expect(screen).toContain("editable={!formLocked}");
  });

  test("consent recording stays inside the awaited submitSignUp sequence", () => {
    const submit = hook.slice(
      hook.indexOf("const handleSubmit"),
      hook.indexOf("const handleVerifyConfirmCode"),
    );
    expect(submit).toContain("const result = await submitSignUp({");
    expect(submit).toContain("recordConsent: (newUserId) =>");
    expect(submit).toContain("recordConsentBestEffort(");
    expect(submit).toContain("refreshAuth: refresh");
  });

  // 세 digest 를 통합 머지에서 재고정했다(legacy · styles · dds-auth-screens).
  // 옛 값은 5b6bbe71 분기점 파일이고, main 이 그 뒤 f42f4db2(C2·C6 대회 제약과
  // judge 이메일 경로 은퇴)와 be629d2b 를 얹었다. 병합 결과는 셋 다 main 과
  // 바이트 동일이라 "이 PR 이 레거시·공용 폼을 안 건드렸다"는 뜻은 그대로다.
  // ConsentNotice 는 분기 이후 그대로다. BirthDateField 는 2026-09-22 C10
  // unreadable-region 복구에서 선택한 나라의 동적 하한을 받도록 의도적으로 바뀌었다.
  // 2026-09-07: dds-auth-screens digest 하나만 재고정했다. ConsentCheckRow 에
  // 웹 스페이스키 배선(import 1 + prop 1)이 들어갔기 때문이다. legacy · styles ·
  // ConsentNotice 경계는 그대로고 BirthDateField 는 위 C10 변경으로 재고정했다.
  // 2026-09-13: dds-auth-screens 에 reset-password bootstrap 재시도 표면만
  // 추가해 그 digest 만 재고정했다. 나머지 네 경계는 그대로다.
  // 2026-09-30: dds-auth-screens digest 만 재고정했다. Text 를 react-native 대신
  // @/components/ui/PlainText 에서 가져오는 import 두 줄뿐이다(앱 전체 한국어 줄바꿈).
  // 2026-10-05: dds-auth-screens digest 를 재고정했다. 그 파일의 가입 화면 그림자 사본
  // (라우트가 import 하지 않던 DeepSpaceSignUpDesignScreen 과 그 동의 블록)이 롤백 레버
  // 제거 PR 에서 나갔다(Q-261004-11 C). 남은 재설정 화면 구간은 e0b274d0 과 바이트
  // 동일이다(sign-in-screen-contract.test.ts 의 tail 핀). 레거시 보관본 핀 둘은 위
  // legacyArchive 주석대로 은퇴했다.
  // 2026-10-05(키보드): dds-auth-screens digest 만 다시 재고정했다(옛 값 64e12090 = 바로 앞
  // HEAD). AuthShell 의 RN KeyboardAvoidingView + `Platform.OS === "ios"` behavior 분기를
  // 공용 KeyboardAvoidingArea(src/lib/ui/keyboard.tsx)로 바꾼 것(react-native import 1줄 수정 ·
  // import 1줄 추가 · 여는/닫는 태그 · 주석 4줄)뿐이다. Android 에서 키보드가 가입 폼을 가리지 않게 하는 수정이고, 동의 ·
  // 가입 경계와 재설정 화면 tail(sign-in-screen-contract.test.ts)은 그대로다.
  // 2026-10-05(PR #2044 main 병합): dds-auth-screens digest 만 다시 재고정했다(옛 값
  // 23480d40 = 위 main 판). main 판과 대조한 차이는 go-home import 한 줄(빈 줄 자리)과
  // 재설정 화면의 재설정 잠금 등록 useGoHomeStop 한 줄뿐이다. 동의 · 가입 경계는 그대로다.
  // 2026-10-07(#2145 안드로이드 공유, Simon 12:04): dds-auth-screens digest 만 다시
  // 재고정했다(옛 값 713bb9c4 = main 판). 차이는 ShareRefusedLine import 한 줄과 재설정
  // 화면 머리 아래의 `<ShareRefusedLine />` 한 줄(+빈 줄)뿐이다. 문지기가 공유를 재설정
  // 화면으로 돌려보낼 때 그 화면에 한 줄 안내를 그리는 자리다. 동의 · 가입 경계는 그대로다.
  test("preserves shared form boundaries while pinning the auth renderer", () => {
    expect(sha256(read("src/screens/deepspace/dds-auth-screens.tsx"))).toBe(
      "1dd54b7cf8e56e5004fd20c8888997dba5bdf5701cf5185149cdaaff2b11bcac",
    );
    expect(sha256(read("src/components/consent/ConsentNotice.tsx"))).toBe(
      "60a019c22ceec84ad550f06568763225b82839bc0e743f382aabea233e4ae170",
    );
    expect(sha256(read("src/components/auth/BirthDateField.tsx"))).toBe(
      "7f995e7a8031b7761aa44fdc1dc373ff6397b4071d80df22a112534c29cc0848",
    );
  });

  test("the PIXEL ratchet includes the new renderer", () => {
    expect(read("scripts/check-pixel-rules.ts")).toContain(
      '"src/screens/deepspace/dds-sign-up-screen.tsx"',
    );
  });
});
