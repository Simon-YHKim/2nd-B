import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as back from "../sign-in-back";
import { selectSignInBranch } from "../sign-in-branch";
import { replaceSignInToast } from "../sign-in-toast";
import { clearSignUpFailure as clearAuthFailure, signUpToastTimeoutMs as authToastTimeoutMs } from "../sign-up-notice";
import * as reset from "../reset-password-helpers";
import { sameRecoveryProof } from "../recovery-proof-store";
import { runAuthActionOnce } from "../sign-in-screen-contract";
import { renderedUiLanguage } from "../../i18n/ui-language";

type Notice = { tone: string; message: string; exitOnBack?: boolean } | null;
type Form = {
  toast: Notice; canSubmit: boolean; canSendCode: boolean; submitting: boolean; oauthSubmitting: boolean;
  setEmail: (value: string) => void; setPassword: (value: string) => void;
  setCode: (value: string) => void; setConfirmPassword: (value: string) => void;
  handleSubmit: (invalid?: (field: string) => void) => Promise<void>;
  handleOAuth: (provider: string) => Promise<void>; handleNaver: () => Promise<void>;
  handleSendCode: (invalid?: () => void) => Promise<void>;
  handleVerifyCode: () => Promise<void>; handleCancelRecovery: () => Promise<void>;
};

function evaluate(expression: string, scope: Record<string, unknown>) {
  const js = ts.transpileModule(`(function ({ ${Object.keys(scope).join(",")} }) { return (${expression}); })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(js, {})(scope);
}

// Small hook scheduler, NOT a form implementation: execute the entire actual hook
// body and its dependency arrays. No RN import, mounted screen, or auth request.
function harness(kind: "signIn" | "reset") {
  const name = kind === "signIn" ? "useSignInForm" : "useResetPasswordForm";
  const source = readFileSync(`src/lib/auth/${name}.ts`, "utf8");
  const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  const slots: { value: unknown; deps?: unknown[]; cleanup?: () => void }[] = [];
  let index = 0;
  let dirty = true;
  let pending: (() => void)[] = [];
  const depsChanged = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const memo = (make: () => unknown, deps: unknown[]) => {
    const i = index++;
    if (!slots[i] || depsChanged(slots[i].deps, deps)) slots[i] = { value: make(), deps };
    return slots[i].value;
  };
  const effect = (fn: () => (() => void) | undefined, deps: unknown[]) => {
    const i = index++;
    if (!slots[i] || depsChanged(slots[i].deps, deps)) {
      const cleanup = slots[i]?.cleanup;
      slots[i] = { value: null, deps };
      pending.push(() => { cleanup?.(); slots[i].cleanup = fn(); });
    }
  };
  const auth = {
    userId: null as string | null, loading: false, refresh: jest.fn(),
    recoveryUserId: null as string | null, recoverySessionId: null as string | null,
    recoveryOperation: null as unknown, recoveryPendingGlobal: false,
    activateRecoverySession: jest.fn(), completeRecovery: jest.fn(async () => true),
  };
  const environment = { focused: true, language: "ko", packReady: true };
  const calls = {
    signInWithEmail: jest.fn(async () => { throw new Error("invalid credentials"); }),
    startOAuthProvider: jest.fn(async () => { throw new Error("provider failed"); }),
    signInWithNaver: jest.fn(async () => { throw new Error("provider failed"); }),
    sendPasswordResetEmail: jest.fn(async () => { throw new Error("send failed"); }),
    verifyPasswordResetCode: jest.fn(async () => { throw new Error("code failed"); }),
    updatePasswordForRecovery: jest.fn(async () => { throw new Error("update failed"); }),
    cancelRecoverySession: jest.fn(async () => { throw new Error("cancel failed"); }),
  };
  let onBack: (() => boolean) | undefined;
  const scope = {
    ...back, ...reset, ...calls, selectSignInBranch, replaceSignInToast, clearAuthFailure, authToastTimeoutMs, sameRecoveryProof, renderedUiLanguage,
    useState: (initial: unknown) => {
      const i = index++;
      slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next: unknown) => {
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(slots[i].value, value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef: (initial: unknown) => { const i = index++; slots[i] ??= { value: { current: initial } }; return slots[i].value; },
    useCallback: (fn: unknown, deps: unknown[]) => memo(() => fn, deps), useMemo: memo,
    useEffect: effect, useLayoutEffect: effect,
    useAuth: () => auth, useIsFocused: () => environment.focused,
    useTranslation: () => ({ t: (key: string) => `${environment.language}:${key}`, i18n: { language: environment.language, hasResourceBundle: (lng: string) => lng === "en" || environment.packReady } }),
    Platform: { OS: "android" },
    BackHandler: { addEventListener: (_event: string, fn: () => boolean) => { onBack = fn; return { remove: jest.fn() }; }, exitApp: jest.fn() },
    router: { replace: jest.fn() }, setTimeout, clearTimeout, setInterval, clearInterval,
    useLinkingURL: () => null, useLocalSearchParams: () => ({}),
    isPasswordRecoveryCallbackUrl: () => false, clearInitialURL: jest.fn(), consumeAuthCallbackUrl: jest.fn(),
    persistRecoveryPending: jest.fn(), passwordUpdateFailure: () => "unknown",
    SIGN_IN_PROVIDERS: ["google"], PROVIDER_LABEL: { google: "Google" }, RESEND_COOLDOWN_SECONDS: 60, SIGN_IN_LONG_WAIT_MS: 15000,
    isProviderEnabled: () => true, isNaverEnabled: () => true, isProviderNotEnabledError: () => false,
    observeAuthConversion: jest.fn(), createSignInProgress: jest.fn(), AuthLockWaitTimeoutError: class extends Error {},
    console: { warn: jest.fn() },
  };
  const hook = evaluate(node.getText(ast).replace(/^export /, ""), scope) as (receipt: null) => Form;
  let form!: Form;
  const flush = () => {
    dirty = true;
    let renders = 0;
    while (dirty) {
      if (++renders > 30) throw new Error("effect render loop");
      dirty = false; index = 0; pending = [];
      form = hook(null);
      pending.forEach(fn => fn());
    }
    return form;
  };
  flush();
  return { get form() { return form; }, flush, calls, auth, environment, scope,
    back: () => onBack?.(), unmount: () => slots.forEach(slot => slot.cleanup?.()) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("Z12/Z13 actual submit handlers", () => {
  test.each(["", "abc", "   "])("sign-in rejects email %p locally and focuses email", async email => {
    const h = harness("signIn"); h.form.setEmail(email); h.form.setPassword("x"); h.flush();
    const focus = jest.fn(); await h.form.handleSubmit(focus); h.flush();
    expect(h.calls.signInWithEmail).not.toHaveBeenCalled();
    expect(h.form.toast).toEqual({ tone: "danger", message: "ko:signIn.resetToast" });
    expect(focus).toHaveBeenCalledWith("email");
  });
  test("sign-in rejects missing password locally and focuses password", async () => {
    const h = harness("signIn"); h.form.setEmail("reader@example.invalid"); h.flush();
    const focus = jest.fn(); await h.form.handleSubmit(focus); h.flush();
    expect(h.calls.signInWithEmail).not.toHaveBeenCalled();
    expect(h.form.toast).toEqual({ tone: "danger", message: "ko:errors.signInFailed" });
    expect(focus).toHaveBeenCalledWith("password");
  });
  test.each(["", "abc", "   "])("reset accepts press with email %p but makes no request", async email => {
    const h = harness("reset"); h.form.setEmail(email); h.flush();
    expect(h.form.canSendCode).toBe(true);
    const focus = jest.fn(); await h.form.handleSendCode(focus); h.flush();
    expect(h.calls.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(h.form.toast).toEqual({ tone: "danger", message: "ko:signIn.resetToast" });
    expect(focus).toHaveBeenCalledTimes(1);
  });
  test.each(["wrong password", "missing account", "deleted account"])("sign-in %s has the same generic failure", async reason => {
    const h = harness("signIn"); h.form.setEmail("reader@example.invalid"); h.form.setPassword("x"); h.flush();
    h.calls.signInWithEmail.mockRejectedValueOnce(new Error(reason));
    await h.form.handleSubmit(); h.flush();
    expect(h.calls.signInWithEmail).toHaveBeenCalledTimes(1);
    expect(h.form.toast).toEqual({ tone: "danger", message: "ko:errors.signInFailed" });
  });
  test.each(["handleSubmit", "handleOAuth", "handleNaver"] as const)("%s locks all concurrent login writers before React renders", async first => {
    const h = harness("signIn"); h.form.setEmail("reader@example.invalid"); h.form.setPassword("x"); h.flush();
    const call = () => first === "handleOAuth" ? h.form.handleOAuth("google") : h.form[first]();
    const action = call();
    await Promise.all([h.form.handleSubmit(), h.form.handleOAuth("google"), h.form.handleNaver()]);
    await action; h.flush();
    expect(Object.values(h.calls).reduce((n, fn) => n + fn.mock.calls.length, 0)).toBe(1);
  });
  test("reset send lock, pending recovery and cooldown still prevent duplicate sends", async () => {
    const h = harness("reset"); h.form.setEmail("reader@example.invalid"); h.flush();
    h.calls.sendPasswordResetEmail.mockResolvedValueOnce(undefined as never);
    const send = h.form.handleSendCode(); const second = h.form.handleSendCode(); h.flush();
    expect(h.form.canSendCode).toBe(false); await Promise.all([send, second]); h.flush();
    expect(h.calls.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(h.form.canSendCode).toBe(false);
    jest.advanceTimersByTime(60000); h.flush(); expect(h.form.canSendCode).toBe(true);
    h.auth.recoveryPendingGlobal = true; h.flush(); expect(h.form.canSendCode).toBe(false);
    await h.form.handleSendCode(); expect(h.calls.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});

describe.each(["signIn", "reset"] as const)("%s persistent failure lifecycle", kind => {
  async function failed() {
    const h = harness(kind);
    await (kind === "signIn" ? h.form.handleSubmit() : h.form.handleSendCode()); h.flush();
    expect(h.form.toast?.tone).toBe("danger");
    return h;
  }
  test("danger survives 2.8 seconds and a minute", async () => {
    const h = await failed(); const notice = h.form.toast;
    jest.advanceTimersByTime(2800); h.flush(); expect(h.form.toast).toBe(notice);
    jest.advanceTimersByTime(60000); h.flush(); expect(h.form.toast).toBe(notice);
  });
  test.each(kind === "signIn" ? ["setEmail", "setPassword"] as const : ["setEmail", "setPassword", "setCode", "setConfirmPassword"] as const)("%s clears the failure", async input => {
    const h = await failed(); h.form[input]("changed"); h.flush(); expect(h.form.toast).toBeNull();
  });
  test("blur clears current and late failures before returning", async () => {
    const h = await failed(); h.environment.focused = false; h.flush(); expect(h.form.toast).toBeNull();
    await (kind === "signIn" ? h.form.handleSubmit() : h.form.handleSendCode()); h.flush();
    h.environment.focused = true; h.flush(); expect(h.form.toast).toBeNull();
  });
  test("changing language clears failure, next attempt uses the selected language", async () => {
    const h = await failed(); h.environment.language = "en"; h.flush(); expect(h.form.toast).toBeNull();
    await (kind === "signIn" ? h.form.handleSubmit() : h.form.handleSendCode()); h.flush();
    expect(h.form.toast?.message).toBe("en:signIn.resetToast");
  });
  test("a late locale pack also clears the previous UI-language failure", async () => {
    const h = harness(kind); h.environment.language = "pt"; h.environment.packReady = false; h.flush();
    await (kind === "signIn" ? h.form.handleSubmit() : h.form.handleSendCode()); h.flush();
    expect(h.form.toast?.tone).toBe("danger");
    h.environment.packReady = true; h.flush(); expect(h.form.toast).toBeNull();
  });
});

test.each(["handleSubmit", "handleOAuth", "handleNaver"] as const)("%s clears prior failure when the next attempt starts", async action => {
  const h = harness("signIn"); h.form.setEmail("reader@example.invalid"); h.form.setPassword("x"); h.flush();
  await h.form.handleSubmit(); h.flush(); expect(h.form.toast?.tone).toBe("danger");
  const pending = action === "handleOAuth" ? h.form.handleOAuth("google") : h.form[action]();
  h.flush(); expect(h.form.toast).toBeNull(); await pending; h.flush(); expect(h.form.toast?.tone).toBe("danger");
});

test("reset resend starts with the previous failure cleared", async () => {
  const h = harness("reset"); h.form.setEmail("reader@example.invalid"); h.flush();
  await h.form.handleSendCode(); h.flush(); expect(h.form.toast?.tone).toBe("danger");
  const pending = h.form.handleSendCode(); h.flush(); expect(h.form.toast).toBeNull(); await pending;
});

test.each(["handleVerifyCode", "handleSubmit", "handleCancelRecovery"] as const)("reset %s clears failure at the next valid attempt", async action => {
  const h = harness("reset");
  h.form.setEmail("reader@example.invalid"); h.form.setCode("123456"); h.flush();
  if (action !== "handleVerifyCode") {
    h.auth.userId = "fixture"; h.auth.recoveryUserId = "fixture"; h.auth.recoverySessionId = "session";
    h.auth.recoveryOperation = { userId: "fixture", sessionId: "session", issuedAt: "fixture", pendingOwnerNonce: "fixture" };
    h.flush(); h.form.setPassword("password-fixture"); h.form.setConfirmPassword("password-fixture"); h.flush();
  }
  await h.form[action](); h.flush(); expect(h.form.toast?.tone).toBe("danger");
  const pending = h.form[action](); h.flush(); expect(h.form.toast).toBeNull();
  await pending; h.flush(); expect(h.form.toast?.tone).toBe("danger");
});

test("success retains sign-in timeout and reset has no notice timeout", async () => {
  for (const kind of ["signIn", "reset"] as const) {
    const h = harness(kind); h.form.setEmail("reader@example.invalid"); h.flush();
    h.calls.sendPasswordResetEmail.mockResolvedValueOnce(undefined as never);
    await (kind === "signIn" ? (h.form as Form & { handleForgotPassword: () => Promise<void> }).handleForgotPassword() : h.form.handleSendCode());
    h.flush(); const notice = h.form.toast; expect(notice?.tone).toBe("success");
    h.form.setEmail("other@example.invalid"); h.flush(); expect(h.form.toast).toBe(notice);
    jest.advanceTimersByTime(2800); h.flush(); expect(h.form.toast).toBe(kind === "signIn" ? null : notice);
    h.unmount();
  }
});

test("old info timeout cannot clear a new failure; unmount cancels timers", async () => {
  const h = harness("signIn");
  // The legacy helper still provides a normal info notice with the same timer.
  const form = h.form as Form & { handleForgotPassword: () => Promise<void> };
  await form.handleForgotPassword(); h.flush(); expect(h.form.toast?.tone).toBe("info");
  await h.form.handleSubmit();
  // Fire before the replacing render/effect cleanup: identity is the only guard.
  jest.advanceTimersByTime(2800); h.flush(); expect(h.form.toast?.tone).toBe("danger");
  await form.handleForgotPassword(); h.flush(); expect(jest.getTimerCount()).toBe(1);
  h.unmount(); expect(jest.getTimerCount()).toBe(0);
});

test("ordinary info expires at 2.8 seconds but input and language do not revoke an exit notice", async () => {
  const h = harness("signIn");
  await (h.form as Form & { handleForgotPassword: () => Promise<void> }).handleForgotPassword(); h.flush();
  jest.advanceTimersByTime(2799); h.flush(); expect(h.form.toast?.tone).toBe("info");
  jest.advanceTimersByTime(1); h.flush(); expect(h.form.toast).toBeNull();
  h.back(); h.flush(); const exit = h.form.toast;
  expect(exit?.exitOnBack).toBe(true);
  h.form.setEmail("changed"); h.environment.language = "en"; h.flush(); expect(h.form.toast).toBe(exit);
  // Exit lifetime only starts after the unchanged overlay's attach/paint callback.
  jest.advanceTimersByTime(2800); h.flush(); expect(h.form.toast).toBe(exit);
});

test("screen button/go dispatch retains the busy gate and focuses the invalid input", async () => {
  const file = "src/screens/deepspace/dds-sign-in-screen.tsx";
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = ast.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "DeepSpaceSignInDesignScreen")!;
  const submit = screen.body!.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "submit")!;
  const emailRef = { current: { focus: jest.fn() } }, passwordRef = { current: { focus: jest.fn() } };
  for (const field of ["email", "password"]) for (const submitDisabled of [false, true]) {
    const handleSubmit = jest.fn(async (invalid: (field: string) => void) => invalid(field));
    const press = evaluate(submit.getText(ast), { submitDisabled, runAuthActionOnce, actionLock: { current: false }, handleSubmit, emailRef, passwordRef });
    emailRef.current.focus.mockClear(); passwordRef.current.focus.mockClear(); await press();
    expect(handleSubmit).toHaveBeenCalledTimes(submitDisabled ? 0 : 1);
    expect((field === "email" ? emailRef : passwordRef).current.focus).toHaveBeenCalledTimes(submitDisabled ? 0 : 1);
  }
  expect(source).toContain("const submitDisabled = authBusy;");
  expect(source).toContain("const authBusy = submitting || oauthSubmitting;");
  expect(source).toContain("const submitMuted = !canSubmit || oauthSubmitting;");
  expect(source).toContain("background={submitMuted ? m3.color.surfaceContainerHighest : m3.color.primary}");
  expect(source).toContain('onPress={() => void submit()}');
  expect(source).toContain('if (!submitDisabled) void submit();');
  expect(source).toContain('ref={emailRef}');
  // The notice takes space only while it is shown (same as the sign-up screen, #2325).
  expect(source).not.toContain("fontScale");
  expect(source).toMatch(/\{inlineNotice\}\s*<PixelPressable\s+variant="bevel"\s+onPress=\{\(\) => void submit\(\)\}/);
});

test("reset button and keyboard share the email-focus dispatch and request notice slot", async () => {
  const file = "src/screens/deepspace/dds-auth-screens.tsx";
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = ast.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "DeepSpaceResetPasswordDesignScreen")!;
  const decl = screen.body!.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : []).find(n => n.name.getText(ast) === "sendCode")!;
  const emailRef = { current: { focus: jest.fn() } };
  const dispatch = evaluate(decl.initializer!.getText(ast), { handleSendCode: async (focus: () => void) => focus(), emailRef });
  await dispatch(); expect(emailRef.current.focus).toHaveBeenCalledTimes(1);
  expect(source).toContain("if (canSendCode) void sendCode();");
  expect(source).toContain("onPress={() => void sendCode()}");
  expect(source).toContain("disabled={!canSendCode}");
  expect(source).toContain('ref={emailRef}');
  const slot = source.indexOf('{step === "request" ? resetNotice : null}');
  expect(slot).toBeGreaterThan(-1);
  expect(slot).toBeLessThan(source.indexOf("onPress={() => void sendCode()}"));
  expect(source).not.toContain("bodyMedium.line * 3");
  expect(source).toContain('{step !== "request" ? resetNotice : null}');
});
