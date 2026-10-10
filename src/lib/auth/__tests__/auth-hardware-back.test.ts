import { readFileSync } from "node:fs";
import { SIGN_IN_TOAST_DURATION_MS, signInBackDecision } from "../sign-in-back";

const read = (file: string) => readFileSync(file, "utf8");
const signIn = read("src/lib/auth/useSignInForm.ts");
const signUp = read("src/lib/auth/useSignUpForm.ts");
const inEffect = signIn.slice(signIn.indexOf("useFocusEffect(useCallback("), signIn.indexOf("  const setEmailAndClearReset"));
const upEffect = signUp.slice(signUp.indexOf("useFocusEffect(useCallback("), signUp.indexOf("  // A valid DOB"));

describe("D2 sign-in double Back deadline", () => {
  test("first press and unrelated toasts show a notice instead of exiting", () => {
    expect(signInBackDecision(undefined, 100)).toEqual({ kind: "notice", expiresAt: 100 + SIGN_IN_TOAST_DURATION_MS });
  });

  test("another press only exits during the same notice's display window", () => {
    const first = signInBackDecision(undefined, 100);
    if (first.kind !== "notice") throw new Error("First press exited");
    expect(signInBackDecision(first.expiresAt, 101)).toEqual({ kind: "exit" });
    expect(signInBackDecision(first.expiresAt, first.expiresAt - 1)).toEqual({ kind: "exit" });
    for (const now of [first.expiresAt, first.expiresAt + 1, first.expiresAt + 10000]) {
      expect(signInBackDecision(first.expiresAt, now)).toEqual({ kind: "notice", expiresAt: now + SIGN_IN_TOAST_DURATION_MS });
    }
  });

  test("a dismissed or replaced notice starts a new window", () => {
    const now = 200;
    expect(signInBackDecision(undefined, now).kind).toBe("notice");
    expect(signIn).toContain("toastRef.current = next;");
    expect(signIn).toContain("setToastState(next);");
    expect(signIn).toContain("Math.max(0, toast.exitOnBackUntil - Date.now())");
    expect(signIn).toContain("setTimeout(() => setToast(null), duration)");
    expect(signIn).toContain("clearTimeout(timeout)");
    expect(inEffect).toContain("if (toastRef.current?.exitOnBackUntil !== undefined) setToast(null)");
  });
});

describe("D2 hardware Back ownership", () => {
  test.each([["sign-in", inEffect], ["sign-up", upEffect]])("%s is focus-scoped and removes its subscription", (_name, effect) => {
    expect(effect).toContain("useFocusEffect(useCallback(");
    expect(effect).toContain('Platform.OS !== "android"');
    expect(effect).toContain('BackHandler.addEventListener("hardwareBackPress", onBackPress)');
    expect(effect).toContain("sub.remove()");
    expect(effect).not.toContain('router.push("/")');
  });

  test("sign-in consumes busy presses and calls exit only for an unexpired notice", () => {
    expect(inEffect).toContain('if (Platform.OS !== "android" || loading || userId) return;');
    expect(inEffect).toContain("if (submitting || oauthSubmitting || resetSubmitting) return true;");
    expect(inEffect).toContain("signInBackDecision(toastRef.current?.exitOnBackUntil, Date.now())");
    expect(inEffect).toMatch(/if \(decision.kind === "exit"\)\s*\{\s*BackHandler.exitApp\(\);/);
    expect(inEffect).toContain('message: t("signIn.exitOnBack"), exitOnBackUntil: decision.expiresAt');
    expect(inEffect).toContain("return true;");
  });

  test("sign-up consumes the synchronous auth lock before returning to login", () => {
    expect(upEffect).toMatch(/if \(actionLockRef.current.active !== null\) return true;[\s\S]*router.dismissTo\("\/sign-in"\);\s*return true;/);
    expect(upEffect).not.toContain("exitApp");
    // dismissTo pops an existing login, or replaces direct sign-up entry.
    expect(upEffect).not.toMatch(/router\.(?:push|back)\(/);
  });

  test("the one new notice exists in every supported locale", () => {
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const value = JSON.parse(read(`locales/${locale}/auth.json`)).signIn.exitOnBack;
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toContain("\u2014");
    }
    expect(JSON.parse(read("locales/ko/auth.json")).signIn.exitOnBack).toBe("한 번 더 누르면 앱이 종료됩니다");
  });
});
