import { readFileSync } from "node:fs";
import ts from "typescript";
import { createSignInBackHandler, SIGN_IN_TOAST_DURATION_MS } from "../sign-in-back";
import { replaceSignInToast, type SignInToast } from "../sign-in-toast";

const exitNotice = (until = 2800): SignInToast => ({ tone: "info", message: "exit", exitOnBackUntil: until });
const others: SignInToast[] = ["info", "success", "danger"].map(tone => ({ message: "other", tone: tone as SignInToast["tone"] }));

function harness(initial: SignInToast | null) {
  let toast = initial;
  const setToast = (next: SignInToast | null, expected?: SignInToast | null) => {
    toast = replaceSignInToast(toast, next, expected);
  };
  const expire = (expected: SignInToast) => setTimeout(() => setToast(null, expected), SIGN_IN_TOAST_DURATION_MS);
  const exitApp = jest.fn();
  const back = createSignInBackHandler({
    isBusy: () => false, now: Date.now, exitDeadline: () => toast?.exitOnBackUntil,
    showNotice: until => setToast(exitNotice(until)), exitApp,
  });
  return { get: () => toast, setToast, expire, back, exitApp };
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
      expect(h.get()?.exitOnBackUntil).toBe(5600);
      expect(h.exitApp).not.toHaveBeenCalled();
    }
  });

  test("replacement just before expiry preserves other notices, new exit notices and clears", () => {
    for (const old of [exitNotice(), ...others]) for (const replacement of [null, exitNotice(5599), ...others.map(notice => ({ ...notice }))]) {
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
    expect(h.get()?.exitOnBackUntil).toBe(5600);
    expect(h.exitApp).not.toHaveBeenCalled();
    h.back();
    expect(h.exitApp).toHaveBeenCalledTimes(1);
  });

  test("all nine hook writers use the shared transition; timers capture identity and blur preserves other notices", () => {
    const file = "src/lib/auth/useSignInForm.ts";
    const source = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const writes: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "setToast") writes.push(node.arguments.map(arg => arg.getText(ast)).join(", "));
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(writes).toHaveLength(9);
    expect(writes.filter(write => write.startsWith("null"))).toEqual(["null, toast", "null, toastRef.current"]);
    for (const key of ["signIn.exitOnBack", "errors.oauthSignInStartFailed", "errors.signInBusy", "errors.signInFailed", "signIn.resetToast", "signIn.resetSentToast", "errors.passwordResetFailed"]) {
      expect(writes.some(write => write.includes(`t("${key}"`))).toBe(true);
    }
    expect(writes.filter(write => write.includes('t("errors.oauthSignInStartFailed"'))).toHaveLength(2);
    expect(source).toMatch(/next = replaceSignInToast\(toastRef.current, next, expected\);\s*toastRef.current = next;\s*setToastState\(next\);/);
    expect(source.match(/setToastState\(/g)).toHaveLength(1);
    expect(source).toContain("setTimeout(() => setToast(null, toast), duration)");
    expect(source).toContain("clearTimeout(timeout)");
    expect(source).toContain("if (toastRef.current?.exitOnBackUntil !== undefined) setToast(null, toastRef.current)");
  });
});
