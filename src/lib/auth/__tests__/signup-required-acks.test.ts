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
// 레거시 렌더러는 2026-09-08 에 아카이브로 나갔다. 아래 바이트 핀은 지우지 않고
// 대상만 옮긴다 — 같은 마커·같은 해시·다른 파일이면 옮기면서 안 고쳤다는 증거다.
const legacyArchive = read("legacy/screens/sign-up.tsx");

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
      hook.indexOf("// Stage 3 (O-31)"),
    );
    expect(callback).toContain("invalidateSignUpActions(actionLockRef.current)");
    expect(callback).toContain("setSubmitting(false)");
    expect(callback).toContain("setOauthSubmitting(false)");
    expect(callback).toContain("setConfirmVerifying(false)");
    expect(hook).toContain("consumedUrlRef.current === deepLinkUrl");
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
    // 폴백은 사라졌다 — 레거시 렌더러가 legacy/screens/sign-up.tsx 로 나갔다.
    expect(route).not.toContain("SignUpLegacy");
    expect(route).not.toContain("isDeepSpaceUI");
    expect(legacyArchive).toContain("function SignUpLegacy()");
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
    expect(screen).toContain("ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE");
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
    expect(screen).toContain("PROVIDER_MARK[provider]");
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
    expect(canSubmit).toContain("ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE");
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
  // ConsentNotice·BirthDateField 는 분기 이후 안 바뀌어 값이 그대로다.
  // 2026-09-07: dds-auth-screens digest 하나만 재고정했다. ConsentCheckRow 에
  // 웹 스페이스키 배선(import 1 + prop 1)이 들어갔기 때문이다. legacy · styles ·
  // ConsentNotice · BirthDateField 넷은 값이 그대로 = 안 건드렸다.
  test("legacy renderer, styles, giant auth renderer, and shared form components are unchanged", () => {
    // 대상만 아카이브로 옮겼다. **digest 는 한 글자도 안 바꿨다** — 같은 마커,
    // 같은 해시, 다른 파일이면 옮기면서 고치지 않았다는 증거가 된다.
    const legacy = legacyArchive.slice(
      legacyArchive.indexOf("function SignUpLegacy()"),
      legacyArchive.indexOf("function ChecklistItem"),
    );
    const styles = legacyArchive.slice(
      legacyArchive.indexOf("const styles = StyleSheet.create"),
      legacyArchive.indexOf("export default function SignUp()"),
    );
    expect(sha256(legacy)).toBe("630043be84f94b1b90bfa3a932c98cd4f3886f9e92a44a35fb5487298f782904");
    expect(sha256(styles)).toBe("5df5b8ca23806eb75662a694220d7b48f31351aacfb8d8bf476d66b98a83508e");
    expect(sha256(read("src/screens/deepspace/dds-auth-screens.tsx"))).toBe(
      "c998af24b438c9b3ffb04b487a9b0727e319e86041840a09cac0b0e7be8f892b",
    );
    expect(sha256(read("src/components/consent/ConsentNotice.tsx"))).toBe(
      "60a019c22ceec84ad550f06568763225b82839bc0e743f382aabea233e4ae170",
    );
    expect(sha256(read("src/components/auth/BirthDateField.tsx"))).toBe(
      "9909f26cc188219376e9aeca9a9e46481c74d8d95042a56abfe4858ade4dba0f",
    );
  });

  test("the PIXEL ratchet includes the new renderer", () => {
    expect(read("scripts/check-pixel-rules.ts")).toContain(
      '"src/screens/deepspace/dds-sign-up-screen.tsx"',
    );
  });
});
