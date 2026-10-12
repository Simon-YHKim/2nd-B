import { readFileSync } from "node:fs";
import ts from "typescript";
import { attachSignInExit, createSignInBackHandler, presentSignInExit, replacePresentedSignInExit, type PresentedSignInExit, SIGN_IN_TOAST_DURATION_MS } from "../sign-in-back";
import { replaceSignInToast, type SignInToast } from "../sign-in-toast";

const exitNotice = (): SignInToast => ({ tone: "info", message: "exit", exitOnBack: true });
const others: SignInToast[] = ["info", "success", "danger"].map(tone => ({ message: "other", tone: tone as SignInToast["tone"] }));

function harness(initial: SignInToast | null) {
  let toast = initial;
  let presented: PresentedSignInExit | null = null;
  const setToast = (next: SignInToast | null, expected?: SignInToast | null) => {
    next = replaceSignInToast(toast, next, expected);
    presented = replacePresentedSignInExit(presented, toast, next);
    toast = next;
  };
  const present = () => {
    if (!toast) return;
    presented = attachSignInExit(toast, toast, presented);
    presented = presentSignInExit(toast, toast, presented, Date.now());
  };
  present();
  const expire = (expected: SignInToast) => setTimeout(() => setToast(null, expected), SIGN_IN_TOAST_DURATION_MS);
  const exitApp = jest.fn();
  const back = createSignInBackHandler({
    isGuest: () => true, isBusy: () => false, now: Date.now, presentedExit: () => presented,
    hasPendingExit: () => toast?.exitOnBack === true, showNotice: () => setToast(exitNotice()), exitApp,
  });
  return { get: () => toast, presented: () => presented, present, setToast, expire, back, exitApp };
}

describe("R3-2 notice ownership matrix", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
  afterEach(() => jest.useRealTimers());

  test("all current, next and captured identities follow compare-and-replace", () => {
    const states = [null, exitNotice(), exitNotice(), ...others];
    for (const current of states) for (const next of states) for (const expected of [undefined, ...states]) {
      expect(replaceSignInToast(current, next, expected)).toBe(expected === undefined || current === expected ? next : current);
    }
  });

  test("normal expiry clears each owned notice and the next Back starts a new notice", () => {
    for (const notice of [exitNotice(), ...others]) {
      jest.setSystemTime(0);
      const h = harness(notice);
      h.expire(notice);
      jest.advanceTimersByTime(2800);
      expect(h.get()).toBeNull();
      h.back();
      expect(h.presented()).toBeNull();
      h.present();
      expect(h.presented()?.exitOnBackUntil).toBe(5600);
      expect(h.exitApp).not.toHaveBeenCalled();
    }
  });

  test("replacement just before expiry preserves other notices, new exit notices and clears", () => {
    for (const old of [exitNotice(), ...others]) for (const replacement of [null, exitNotice(), ...others.map(notice => ({ ...notice }))]) {
      jest.setSystemTime(0);
      const h = harness(old);
      h.expire(old);
      jest.advanceTimersByTime(2799);
      h.setToast(replacement);
      jest.advanceTimersByTime(1);
      expect(h.get()).toBe(replacement);
    }
  });

  test("Back at the deadline creates a new notice before the old timer fires", () => {
    const h = harness(exitNotice());
    // The Back event was queued first at the same deadline. The old effect has
    // not cleaned up yet, matching the boundary that the hook must tolerate.
    setTimeout(h.back, 2800);
    h.expire(h.get()!);
    jest.advanceTimersByTime(2800);
    expect(h.presented()).toBeNull();
    h.present();
    expect(h.presented()?.exitOnBackUntil).toBe(5600);
    expect(h.exitApp).not.toHaveBeenCalled();
    h.back();
    expect(h.exitApp).toHaveBeenCalledTimes(1);
  });

  test("all hook writers use the shared transition; timers and failure clearing capture identity", () => {
    const file = "src/lib/auth/useSignInForm.ts";
    const source = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const writes: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "setToast") writes.push(node.arguments.map(arg => arg.getText(ast)).join(", "));
      ts.forEachChild(node, visit);
    };
    visit(ast);
    // 2026-10-13 Z12/Z24: two local validation notices + identity-safe failure clear.
    expect(writes).toHaveLength(12);
    expect(writes).toContain("clearAuthFailure(current), current");
    expect(writes.filter(write => write.startsWith("null"))).toEqual(["null, notice", "null, toast"]);
    for (const key of ["signIn.exitOnBack", "errors.oauthSignInStartFailed", "errors.signInBusy", "errors.signInFailed", "signIn.resetToast", "signIn.resetSentToast", "errors.passwordResetFailed"]) {
      expect(writes.some(write => write.includes(`t("${key}"`))).toBe(true);
    }
    expect(writes.filter(write => write.includes('t("errors.oauthSignInStartFailed"'))).toHaveLength(2);
    expect(source).toMatch(/next = replaceSignInToast\(toastRef.current, next, expected\);\s*presentedExitRef.current = replacePresentedSignInExit\(presentedExitRef.current, toastRef.current, next\);\s*toastRef.current = next;\s*setToastState\(next\);/);
    expect(source.match(/setToastState\(/g)).toHaveLength(1);
    expect(source).toContain("setTimeout(() => setToast(null, toast), duration)");
    expect(source).toContain("const duration = authToastTimeoutMs(toast)");
    expect(source).toContain("if (duration === null) return;");
    expect(source).toContain("clearTimeout(timeout)");
    expect(source).toContain("clearSignInExit(toastRef.current, setToast)");
  });
});
