import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clearSignUpFailure, signUpToastTimeoutMs, type SignUpToast } from "../sign-up-notice";
import { submitSignUp } from "../sign-up-flow";
import { resendCooldownAfter, SIGN_UP_RESEND_COOLDOWN_SECONDS, type ResendSignUpCodeResult } from "../sign-up-resend";
import { AgeGateError, BreachedPasswordError, ExistingAccountLikelyError } from "../../supabase/auth";

const file = "src/lib/auth/useSignUpForm.ts";
const source = readFileSync(file, "utf8");
const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const hook = tree.statements.find((n): n is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(n) && n.name?.text === "useSignUpForm")!;
const declarations = hook.body!.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : []);
const returned = (hook.body!.statements.find(ts.isReturnStatement)!.expression as ts.ObjectLiteralExpression).properties;

// Execute actual callback/effect source, following auth-back-layout.test.ts.
// No RN import, component mount, or test-only copy of the production decisions.
function evaluate(expression: string, scope: Record<string, unknown>): unknown {
  const js = ts.transpileModule(`(function ({ ${Object.keys(scope).join(", ")} }) { return (${expression}); })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(js, {})(scope);
}

function callback(name: string, scope: Record<string, unknown>): (...args: unknown[]) => unknown {
  const property = returned.find(p => p.name?.getText(tree) === name)!;
  const local = ts.isPropertyAssignment(property) ? property.initializer.getText(tree) : name;
  const declaration = declarations.find(d => d.name.getText(tree) === local);
  return evaluate(declaration?.initializer?.getText(tree) ?? local, scope) as (...args: unknown[]) => unknown;
}

function effect(marker: string, scope: Record<string, unknown>): (() => void) | undefined {
  const statement = hook.body!.statements.find(n => ts.isExpressionStatement(n) &&
    ts.isCallExpression(n.expression) && n.expression.expression.getText(tree) === "useEffect" &&
    n.getText(tree).includes(marker)) as ts.ExpressionStatement;
  const call = statement.expression as ts.CallExpression;
  return (evaluate(call.arguments[0].getText(tree), scope) as () => (() => void) | undefined)();
}

function harness(notice: SignUpToast | null = { tone: "danger", message: "errors.signUpFailed" }) {
  const state = { toast: notice, email: "mailbox@example.invalid", password: "fixture-password",
    birthDate: "1990-01-01", residenceCountry: "KR", consent: {}, confirmCode: "123456", confirmSentTo: "mailbox@example.invalid" as string | null,
    confirmResendSeconds: 0, confirmResending: false };
  const setToast = jest.fn((value: SignUpToast | null | ((current: SignUpToast | null) => SignUpToast | null)) => {
    state.toast = typeof value === "function" ? value(state.toast) : value;
  });
  const setters = Object.fromEntries(Object.keys(state).filter(k => k !== "toast").map(key => [
    `set${key[0].toUpperCase()}${key.slice(1)}`,
    jest.fn((value: unknown) => {
      const data = state as Record<string, unknown>;
      data[key] = typeof value === "function" ? value(data[key]) : value;
    }),
  ]));
  const scope: Record<string, unknown> = {
    ...state, ...setters, setToast, clearSignUpFailure, signUpToastTimeoutMs,
    setTimeout, clearTimeout, isFocused: true,
    useCallback: (fn: unknown) => fn,
    canSubmit: true, loading: false, userId: null, submitting: false, oauthSubmitting: false, confirmVerifying: false,
    actionLockRef: { current: { active: null, owner: 0 } }, mountedRef: { current: true },
    beginSignUpAction: jest.fn(() => 1), ownsSignUpAction: () => true, releaseSignUpAction: jest.fn(),
    setSubmitting: jest.fn(), setOauthSubmitting: jest.fn(), setConfirmVerifying: jest.fn(),
    setAvatarSetupAfterConfirmation: jest.fn(),
    locale: "ko", isMinorAge: false, minConsentAge: 14, t: (key: string) => key,
    submitSignUp, signUpWithEmail: jest.fn(async () => { throw new ExistingAccountLikelyError("DB rejection"); }),
    AgeGateError, BreachedPasswordError, ExistingAccountLikelyError,
    verifySignUpCode: jest.fn(), refresh: jest.fn(),
    resendSignUpCode: jest.fn(async (): Promise<ResendSignUpCodeResult> => ({ ok: true })), resendCooldownAfter, SIGN_UP_RESEND_COOLDOWN_SECONDS,
    isProviderEnabled: () => true, isNaverEnabled: () => true,
    startOAuthProvider: jest.fn(), signInWithNaver: jest.fn(),
    PROVIDER_LABEL: { google: "Google" }, console: { warn: jest.fn() },
  };
  return { state, scope, setToast, input: (name: string, value: unknown) => callback(name, { ...scope, ...state })(value),
    action: (name: string) => callback(name, { ...scope, ...state })("google"),
    timer: () => effect("signUpToastTimeoutMs", { ...scope, ...state }),
    focus: (isFocused: boolean) => effect("if (isFocused) return", { ...scope, ...state, isFocused }) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("Z1 notice policy and actual effect", () => {
  test("danger survives 2.8 seconds and later without state writes or repeat announcements", () => {
    const h = harness();
    const original = h.state.toast;
    expect(signUpToastTimeoutMs(original)).toBeNull();
    expect(h.timer()).toBeUndefined();
    jest.advanceTimersByTime(2800);
    expect(h.state.toast).toBe(original);
    jest.advanceTimersByTime(60000);
    expect(h.state.toast).toBe(original);
    expect(h.setToast).not.toHaveBeenCalled();
  });

  test.each(["success", "info"] as const)("%s expires at 2.8 seconds", tone => {
    const h = harness({ tone, message: "fixture" });
    h.timer();
    jest.advanceTimersByTime(2799);
    expect(h.state.toast).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(h.state.toast).toBeNull();
  });

  test("null schedules no timer", () => {
    const h = harness(null);
    expect(signUpToastTimeoutMs(null)).toBeNull();
    expect(h.timer()).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("an old queued timer cannot clear a replacement danger notice", () => {
    const h = harness({ tone: "success", message: "old" });
    h.timer();
    const next: SignUpToast = { tone: "danger", message: "next failure" };
    h.setToast(next);
    jest.advanceTimersByTime(2800);
    expect(h.state.toast).toBe(next);
  });

  test("effect cleanup cancels its timer on replacement or unmount", () => {
    const h = harness({ tone: "success", message: "fixture" });
    h.timer()!();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(2800);
    expect(h.setToast).not.toHaveBeenCalled();
  });

  test.each([
    ["setEmail", "other@example.invalid"], ["setPassword", "new-password"],
    ["setBirthDate", "1991-01-01"], ["setResidenceCountry", "US"],
    ["setConsent", { service: true }], ["setConfirmCode", "654321"],
  ])("%s clears danger through the returned input handler", (name, value) => {
    const h = harness();
    h.input(name as string, value);
    expect(h.state.toast).toBeNull();
    const key = (name as string).slice(3);
    expect((h.state as Record<string, unknown>)[key[0].toLowerCase() + key.slice(1)]).toEqual(value);
  });

  test.each(["success", "info"] as const)("normal input preserves the same %s object", tone => {
    const notice: SignUpToast = { tone, message: "fixture" };
    const h = harness(notice);
    expect(clearSignUpFailure(notice)).toBe(notice);
    h.input("setPassword", "new-password");
    expect(h.state.toast).toBe(notice);
  });

  test.each(["handleSubmit", "handleVerifyConfirmCode", "handleOAuth", "handleNaver"])(
    "%s clears old feedback before awaiting the next attempt", async name => {
      const h = harness();
      h.state.confirmSentTo = name === "handleVerifyConfirmCode" ? h.state.email : null;
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      const producer = {
        handleSubmit: "signUpWithEmail", handleVerifyConfirmCode: "verifySignUpCode",
        handleOAuth: "startOAuthProvider", handleNaver: "signInWithNaver",
      }[name]!;
      h.scope[producer] = jest.fn(async () => { await pending; throw new Error("fixture failure"); });
      const action = h.action(name);
      expect(h.state.toast).toBeNull();
      expect(h.scope[producer]).toHaveBeenCalledTimes(1);
      release();
      await action;
      expect(h.state.toast?.tone).toBe("danger");
      if (name === "handleVerifyConfirmCode") expect(h.state.toast?.message).toBe("signUp.confirmCodeInvalid");
      h.timer();
      jest.advanceTimersByTime(2800);
      expect(h.state.toast?.tone).toBe("danger");
    },
  );

  test("focus loss clears notice, including a late result on the covered route", () => {
    const h = harness();
    h.focus(true);
    expect(h.setToast).not.toHaveBeenCalled();
    h.focus(false);
    expect(h.state.toast).toBeNull();
    h.setToast({ tone: "danger", message: "late failure" });
    h.focus(false);
    h.focus(true);
    expect(h.state.toast).toBeNull();
  });

  // The sequence above re-runs the blur effect by hand, so it cannot tell whether a failure that
  // arrives AFTER the blur re-triggers the effect. That depends on the dependency list alone:
  // without `toast` in it, a late result would stay on the covered route
  // and be announced again on return.
  test("the blur effect re-runs when a late notice arrives", () => {
    const hook = readFileSync(join(__dirname, "..", "useSignUpForm.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(hook).toMatch(
      /if \(isFocused\) return;\s*setToast\(null\);\s*\}, \[isFocused, toast\]\);/,
    );
  });

  // Review decision (2026-10-13, PR #2335 round 1): a rejected new-user INSERT has ONE public shape
  // (500 + unexpected_failure + "Database error saving new user") for every trigger, constraint or
  // database fault. Mapping that shape to "you may already have an account" guesses a cause the API
  // does not expose and turns an unspecific failure into an account-existence hint. Until the server
  // can name the cause, the sign-up call must pass the error through to the generic failure notice.
  test("the sign-up call does not guess an existing account from a database rejection", () => {
    const auth = readFileSync(join(__dirname, "..", "..", "supabase", "auth.ts"), "utf8");
    expect(auth).not.toMatch(/new ExistingAccountLikelyError\(/);
    expect(auth).not.toMatch(/Database error saving new user/);
  });
});

describe("T06 single notice lifetime", () => {
  test("T06 explicit hook refusal uses the persistent button notice without the recovery card", async () => {
    const h = harness();
    h.state.confirmSentTo = null;
    h.scope.signUpWithEmail = jest.fn().mockRejectedValue({
      status: 403, code: "unknown", message: "polascope_signup_refused",
    });
    await h.action("handleSubmit");
    expect(h.state.toast).toEqual({ tone: "danger", message: "errors.signUpRefused" });
    h.timer();
    jest.advanceTimersByTime(60000);
    expect(h.state.toast?.message).toBe("errors.signUpRefused");
    h.input("setEmail", "next@example.invalid");
    expect(h.state.toast).toBeNull();
  });

  test("T06 keeps the current 500 on the existing generic submit notice", async () => {
    const h = harness();
    h.state.confirmSentTo = null;
    h.scope.signUpWithEmail = jest.fn().mockRejectedValue({
      status: 500, code: "unexpected_failure", message: "Database error saving new user",
    });
    await h.action("handleSubmit");
    expect(h.state.toast).toEqual({ tone: "danger", message: "errors.signUpSubmitFailed" });
  });

  test("the legacy typed error shows a persistent generic failure instead of silently returning", async () => {
    const h = harness();
    h.state.confirmSentTo = null;
    await h.action("handleSubmit");
    expect(h.state.toast).toEqual({ tone: "danger", message: "errors.signUpSubmitFailed" });
    h.timer();
    jest.advanceTimersByTime(60000);
    expect(h.state.toast?.message).toBe("errors.signUpSubmitFailed");
    h.input("setPassword", "different-password");
    expect(h.state.toast).toBeNull();
    h.input("setEmail", "other@example.invalid");
    expect(h.state.confirmSentTo).toBeNull();
    expect(h.state.confirmCode).toBe("");
  });

  test("fake success opens confirmation instead of the recovery card", async () => {
    const h = harness();
    h.state.confirmSentTo = null;
    h.scope.signUpWithEmail = jest.fn(async () => ({ kind: "confirmationRequired" }));
    await h.action("handleSubmit");
    expect(h.state.confirmSentTo).toBe(h.state.email);
    expect(h.state.toast).toBeNull();
  });
});

// Z18 (2026-10-14, Simon 2026-10-13 "the code entry and send again only"): the code step can ask
// for the mail again. It never signs up a second time, and its one notice line is the same
// whatever the server knows about the address.
describe("Z18 send the code again", () => {
  const answer = (result: ResendSignUpCodeResult) => jest.fn(async () => result);

  test("a submit that needs the code starts the wait before the first resend", async () => {
    const h = harness(null);
    h.state.confirmSentTo = null;
    h.scope.signUpWithEmail = jest.fn(async () => ({ kind: "confirmationRequired" }));
    await h.action("handleSubmit");
    expect(h.state.confirmSentTo).toBe(h.state.email);
    expect(h.state.confirmResendSeconds).toBe(SIGN_UP_RESEND_COOLDOWN_SECONDS);
  });

  test("sent: the card's address is asked again, the wait restarts and one plain line shows", async () => {
    const h = harness(null);
    const resend = h.scope.resendSignUpCode = answer({ ok: true });
    await h.action("handleResendConfirmCode");
    expect(resend.mock.calls).toEqual([["mailbox@example.invalid"]]);
    expect(h.state.confirmResendSeconds).toBe(SIGN_UP_RESEND_COOLDOWN_SECONDS);
    expect(h.state.toast).toEqual({ tone: "success", message: "signUp.confirmCodeResent" });
    expect(h.state.confirmSentTo).toBe("mailbox@example.invalid");
    expect(h.state.confirmResending).toBe(false);
    // Not a second sign-up: the consent given at submit is not sent again.
    expect(h.scope.signUpWithEmail).not.toHaveBeenCalled();
  });

  test("too soon: the button counts the server's seconds and nothing is announced as a failure", async () => {
    const h = harness(null);
    h.scope.resendSignUpCode = answer({ ok: false, reason: "wait", seconds: 37 });
    await h.action("handleResendConfirmCode");
    expect(h.state.confirmResendSeconds).toBe(37);
    expect(h.state.toast).toBeNull();
  });

  test("too soon without a number falls back to the usual wait", async () => {
    const h = harness(null);
    h.scope.resendSignUpCode = answer({ ok: false, reason: "wait" });
    await h.action("handleResendConfirmCode");
    expect(h.state.confirmResendSeconds).toBe(SIGN_UP_RESEND_COOLDOWN_SECONDS);
    expect(h.state.toast).toBeNull();
  });

  test("failed: one failure line, and the button is free to try again", async () => {
    const h = harness(null);
    h.scope.resendSignUpCode = answer({ ok: false, reason: "failed" });
    await h.action("handleResendConfirmCode");
    expect(h.state.toast).toEqual({ tone: "danger", message: "signUp.confirmCodeResendFailed" });
    expect(h.state.confirmResendSeconds).toBe(0);
    expect(h.state.confirmResending).toBe(false);
  });

  test.each([
    ["the wait is still counting", { confirmResendSeconds: 12 }],
    ["a resend is already out", { confirmResending: true }],
    ["there is no card", { confirmSentTo: null }],
  ])("does nothing while %s", async (_name, patch) => {
    const h = harness(null);
    Object.assign(h.state, patch);
    const resend = h.scope.resendSignUpCode = answer({ ok: true });
    await h.action("handleResendConfirmCode");
    expect(resend).not.toHaveBeenCalled();
    expect(h.state.toast).toBeNull();
  });

  test.each(["confirmVerifying", "submitting", "oauthSubmitting"])("does nothing while %s", async (flag) => {
    const h = harness(null);
    h.scope[flag] = true;
    const resend = h.scope.resendSignUpCode = answer({ ok: true });
    await h.action("handleResendConfirmCode");
    expect(resend).not.toHaveBeenCalled();
  });

  test("a write already holding the screen's lock keeps the resend out", async () => {
    const h = harness(null);
    h.scope.beginSignUpAction = jest.fn(() => null);
    const resend = h.scope.resendSignUpCode = answer({ ok: true });
    await h.action("handleResendConfirmCode");
    expect(resend).not.toHaveBeenCalled();
    expect(h.state.confirmResending).toBe(false);
  });

  test("leaving the step returns to the form with what was typed", () => {
    const h = harness({ tone: "danger", message: "signUp.confirmCodeInvalid" });
    h.action("leaveConfirmStep");
    expect(h.state.confirmSentTo).toBeNull();
    expect(h.state.confirmCode).toBe("");
    expect(h.state.toast).toBeNull();
    expect(h.state).toMatchObject({ email: "mailbox@example.invalid", password: "fixture-password", birthDate: "1990-01-01", residenceCountry: "KR" });
    expect(h.scope.setAvatarSetupAfterConfirmation).toHaveBeenCalledWith(false);
  });
});
