import { readFileSync } from "node:fs";
import { SIGN_IN_TOAST_DURATION_MS, createSignInBackHandler } from "../sign-in-back";
import { createSignUpBackHandler } from "../sign-up-back";

const read = (file: string) => readFileSync(file, "utf8");
const signIn = read("src/lib/auth/useSignInForm.ts");
const signUp = read("src/lib/auth/useSignUpForm.ts");
const inEffect = signIn.slice(signIn.indexOf("useFocusEffect(useCallback("), signIn.indexOf("  const setEmailAndClearReset"));
const upEffect = signUp.slice(signUp.indexOf("useFocusEffect(useCallback("), signUp.indexOf("  // A valid DOB"));

function signInHarness() {
  const state = { busy: false, now: 100, toast: null as { message: string; exitOnBackUntil?: number } | null };
  const exitApp = jest.fn();
  const showNotice = jest.fn((expiresAt: number) => {
    state.toast = { message: "exit notice", exitOnBackUntil: expiresAt };
  });
  const back = createSignInBackHandler({
    isBusy: () => state.busy,
    exitDeadline: () => state.toast?.exitOnBackUntil,
    now: () => state.now,
    showNotice,
    exitApp,
  });
  return { state, back, showNotice, exitApp };
}

describe("D2 sign-in Back behavior without RN", () => {
  test("busy writes consume Back without notice or exit", () => {
    const h = signInHarness();
    h.state.busy = true;
    expect(h.back()).toBe(true);
    expect(h.showNotice).not.toHaveBeenCalled();
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test("first press shows one notice and never exits", () => {
    const h = signInHarness();
    expect(h.back()).toBe(true);
    expect(h.showNotice).toHaveBeenCalledTimes(1);
    expect(h.showNotice).toHaveBeenCalledWith(2900);
    expect(SIGN_IN_TOAST_DURATION_MS).toBe(2800);
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test("second press inside the notice window exits once", () => {
    const h = signInHarness();
    h.back();
    h.state.now = 2899;
    expect(h.back()).toBe(true);
    expect(h.exitApp).toHaveBeenCalledTimes(1);
    expect(h.showNotice).toHaveBeenCalledTimes(1);
  });

  test.each([2900, 2901, 10000])("expired notice at %i starts a new window", (now) => {
    const h = signInHarness();
    h.back();
    h.state.now = now;
    expect(h.back()).toBe(true);
    expect(h.showNotice).toHaveBeenCalledTimes(2);
    expect(h.showNotice).toHaveBeenLastCalledWith(now + 2800);
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test("another toast replaces the exit notice without granting exit", () => {
    const h = signInHarness();
    h.back();
    h.state.toast = { message: "auth error" };
    h.state.now += 1;
    expect(h.back()).toBe(true);
    expect(h.showNotice).toHaveBeenCalledTimes(2);
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test("a write starting after the notice blocks the same handler immediately", () => {
    const h = signInHarness();
    h.back();
    h.state.busy = true;
    h.state.now += 1;
    expect(h.back()).toBe(true);
    expect(h.showNotice).toHaveBeenCalledTimes(1);
    expect(h.exitApp).not.toHaveBeenCalled();
    h.state.busy = false;
    expect(h.back()).toBe(true);
    expect(h.exitApp).toHaveBeenCalledTimes(1);
  });
});

describe("D2 sign-up Back behavior without RN", () => {
  test("Back asks the router for sign-in exactly once", () => {
    const router = { dismissTo: jest.fn() };
    const back = createSignUpBackHandler({ isBusy: () => false, router });
    expect(back()).toBe(true);
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith("/sign-in");
  });

  test("the live sign-up write lock blocks navigation", () => {
    const lock = { active: false };
    const router = { dismissTo: jest.fn() };
    const back = createSignUpBackHandler({ isBusy: () => lock.active, router });
    lock.active = true;
    expect(back()).toBe(true);
    expect(router.dismissTo).not.toHaveBeenCalled();
    lock.active = false;
    expect(back()).toBe(true);
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
  });
});

// Wiring only: these do not simulate React focus cleanup or router history.
// Device QA covers blur and both pushed/direct-link sign-up histories.
describe("D2 hardware Back wiring", () => {
  test("guest loading keeps ownership and a confirmed user releases it", () => {
    expect(inEffect).toContain('if (Platform.OS !== "android" || userId) return;');
    expect(inEffect).not.toContain("loading");
    expect(inEffect).toMatch(/\}, \[userId,/);
  });

  test("loading and the form share the existing accessible notice", () => {
    const screen = read("src/screens/deepspace/dds-sign-in-screen.tsx");
    const notice = screen.slice(screen.indexOf("const signInNotice ="), screen.indexOf("  if (loading)"));
    const loading = screen.slice(screen.indexOf("  if (loading)"), screen.indexOf("  if (userId)"));
    expect(notice).toContain("toast ? (");
    expect(notice).toContain('accessibilityRole="alert"');
    expect(notice).toContain('accessibilityLiveRegion={toast.tone === "danger" ? "assertive" : "polite"}');
    expect(notice).toContain("{toast.message}");
    expect(loading).toContain("{signInNotice}");
    expect(screen.slice(screen.indexOf("  if (userId)"))).toContain("{signInNotice}");
  });

  test.each([["sign-in", inEffect], ["sign-up", upEffect]])("%s registers only during focus and removes its subscription", (_name, effect) => {
    expect(effect).toContain("useFocusEffect(useCallback(");
    expect(effect).toContain('Platform.OS !== "android"');
    expect(effect).toContain('BackHandler.addEventListener("hardwareBackPress", onBackPress)');
    expect(effect).toContain("sub.remove()");
    expect(effect).not.toMatch(/router\.(?:push|back)\(/);
  });

  test("sign-in wires the live toast and effects to its pure handler", () => {
    expect(inEffect).toContain("const onBackPress = createSignInBackHandler({");
    expect(inEffect).toContain("exitDeadline: () => toastRef.current?.exitOnBackUntil");
    expect(inEffect).toContain("now: Date.now");
    expect(inEffect).toContain('showNotice: (expiresAt) => setToast({ tone: "info", message: t("signIn.exitOnBack"), exitOnBackUntil: expiresAt })');
    expect(inEffect).toContain("exitApp: () => BackHandler.exitApp()");
    expect(signIn).toMatch(/toastRef.current = next;\s*setToastState\(next\);/);
    expect(signIn).toContain("Math.max(0, toast.exitOnBackUntil - Date.now())");
    expect(signIn).toContain("setTimeout(() => setToast(null), duration)");
    expect(signIn).toContain("clearTimeout(timeout)");
    expect(inEffect).toContain("if (toastRef.current?.exitOnBackUntil !== undefined) setToast(null)");
  });

  test("sign-up wires the synchronous lock and real router to its pure handler", () => {
    expect(upEffect).toContain("const onBackPress = createSignUpBackHandler({");
    expect(upEffect).toMatch(/isBusy: \(\) => actionLockRef.current.active !== null,\s*router,/);
    expect(upEffect).not.toContain("exitApp");
  });

  test("the existing notice exists in every supported locale", () => {
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const value = JSON.parse(read(`locales/${locale}/auth.json`)).signIn.exitOnBack;
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toContain("\u2014");
    }
    expect(JSON.parse(read("locales/ko/auth.json")).signIn.exitOnBack).toBe("한 번 더 누르면 앱이 종료됩니다");
  });
});
