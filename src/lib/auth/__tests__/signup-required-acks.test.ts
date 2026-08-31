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
  test("the route imports the isolated renderer directly and keeps legacy as fallback", () => {
    expect(route).toContain(
      'import { DeepSpaceSignUpDesignScreen } from "@/screens/deepspace/dds-sign-up-screen";',
    );
    expect(route).toMatch(/if \(isDeepSpaceUI\(\)\) return <DeepSpaceSignUpDesignScreen \/>;/);
    expect(route).toMatch(/return <SignUpLegacy \/>;/);
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

  test("legacy renderer, styles, giant auth renderer, and shared form components are unchanged", () => {
    const legacy = route.slice(
      route.indexOf("function SignUpLegacy()"),
      route.indexOf("function ChecklistItem"),
    );
    const styles = route.slice(
      route.indexOf("const styles = StyleSheet.create"),
      route.indexOf("export default function SignUp()"),
    );
    expect(sha256(legacy)).toBe("33c5eecd74debd910ff0c76387f8db5ee8adf8071ebf457aac9b39f44f32b22b");
    expect(sha256(styles)).toBe("d45ecb7bbe3ea992ce24132fd1ee2d211081beb8c006c4592c815c99f505d001");
    expect(sha256(read("src/screens/deepspace/dds-auth-screens.tsx"))).toBe(
      "75c6adca3161d855925c9ef3b8e1d01f661787c31de45bb0c7daf0abe1af685b",
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
