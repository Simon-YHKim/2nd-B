import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  attachSignInExit, clearSignInExit, createSignInBackHandler, presentSignInExit,
  replacePresentedSignInExit, type PresentedSignInExit,
} from "../sign-in-back";
import { selectSignInBranch } from "../sign-in-branch";
import { replaceSignInToast, type SignInToast } from "../sign-in-toast";
import { createSignUpBackHandler } from "../sign-up-back";

type Screen = "sign-in" | "sign-up";
type Phase = "layout" | "passive";
type Cleanup = void | (() => void);
type Effect = () => Cleanup;
type Cell = { deps?: readonly unknown[]; cleanup?: Cleanup };
const files: Record<Screen, string> = {
  "sign-in": "src/lib/auth/useSignInForm.ts",
  "sign-up": "src/lib/auth/useSignUpForm.ts",
};

// Read the actual hook's top-level effect calls. No RN imports or mounting:
// the real registration/cleanup closures run against explicit phase queues.
function backEffects(screen: Screen) {
  const source = readFileSync(files[screen], "utf8");
  const ast = ts.createSourceFile(files[screen], source, ts.ScriptTarget.Latest, true);
  const hook = ast.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === (screen === "sign-in" ? "useSignInForm" : "useSignUpForm"));
  const calls = hook!.body!.statements.flatMap(node =>
    ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    /hardwareBackPress|isGuestRef\.current\s*=/.test(node.getText(ast)) ? [node.expression] : []);
  return { source, ast, calls };
}

function phaseHarness(screen: Screen, reverseLayout = false, OS = "android") {
  const { ast, calls } = backEffects(screen);
  const code = calls.map(call => ts.transpileModule(call.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const cells: Cell[] = [];
  const pending: Record<Phase, Array<{ cell: Cell; effect: Effect }>> = { layout: [], passive: [] };
  const listeners = new Set<() => boolean>();
  const changes: string[] = [];
  const isGuestRef = { current: false };
  const toastRef = { current: null as SignInToast | null };
  const presentedExitRef = { current: null as PresentedSignInExit | null };
  const actionLockRef = { current: screen === "sign-in" ? 0 : { active: null as string | null } };
  const exitApp = jest.fn();
  const dismissTo = jest.fn();
  // Sign-up's code step (Z18): Back leaves the step for the form before it leaves sign-up.
  const confirmSentToRef = { current: null as string | null };
  const leaveConfirmStep = jest.fn(() => { confirmSentToRef.current = null; });
  const t = (key: string) => key;
  let cursor = 0;
  let phase = "render";
  const now = 100;
  const setToast = jest.fn((next: SignInToast | null, expected?: SignInToast | null) => {
    next = replaceSignInToast(toastRef.current, next, expected);
    presentedExitRef.current = replacePresentedSignInExit(presentedExitRef.current, toastRef.current, next);
    toastRef.current = next;
  });
  function queue(target: Phase, effect: Effect, deps?: readonly unknown[]) {
    const cell = cells[cursor++] ?? (cells[cursor - 1] = {});
    if (!deps || !cell.deps || deps.length !== cell.deps.length || deps.some((value, i) => !Object.is(value, cell.deps![i]))) {
      pending[target].push({ cell, effect });
      cell.deps = deps;
    }
  }
  function flush(target: Phase) {
    phase = target;
    const work = pending[target].splice(0);
    if (target === "layout" && reverseLayout) work.reverse();
    // A commit destroys the changed effects before creating their replacements.
    work.forEach(({ cell }) => cell.cleanup?.());
    work.forEach(({ cell, effect }) => { cell.cleanup = effect(); });
    phase = "painted";
  }
  const BackHandler = {
    exitApp,
    addEventListener: jest.fn((_event: string, handler: () => boolean) => {
      changes.push(`${phase}:add`);
      listeners.add(handler);
      return { remove: () => { changes.push(`${phase}:remove`); listeners.delete(handler); } };
    }),
  };
  return {
    exitApp, dismissTo, setToast, changes, toastRef, presentedExitRef, isGuestRef, BackHandler,
    leaveConfirmStep, codeStep(address: string | null) { confirmSentToRef.current = address; },
    get subscribed() { return listeners.size; },
    get handler() { return [...listeners][0]; },
    render(kind: "deletion" | "loading" | "form" | "home" = "form", isFocused = true, translate = t) {
      phase = "render";
      cursor = 0;
      const branch = selectSignInBranch({
        deletionNotice: kind === "deletion" ? { result: "deleted" } : null,
        loading: kind === "loading", userId: kind === "home" ? "owner" : null,
      });
      const scope = {
        branch, isFocused, Platform: { OS }, isGuestRef, toastRef, presentedExitRef, actionLockRef,
        setToast, t: translate, Date: { now: () => now }, BackHandler, router: { dismissTo },
        createSignInBackHandler, createSignUpBackHandler, clearSignInExit,
        confirmSentToRef, leaveConfirmStep,
        useLayoutEffect: (effect: Effect, deps: readonly unknown[]) => queue("layout", effect, deps),
        useEffect: (effect: Effect, deps: readonly unknown[]) => queue("passive", effect, deps),
        // Regression mutations must actually delay installation until passive.
        useFocusEffect: (effect: Effect) => queue("passive", () => isFocused ? effect() : undefined),
        useCallback: (fn: Effect) => fn,
      };
      code.forEach(effect => runInNewContext(effect, scope));
    },
    layout: () => flush("layout"),
    passive: () => flush("passive"),
    press: () => [...listeners].reverse().some(handler => handler()),
    busy(value: boolean) { actionLockRef.current = screen === "sign-in" ? Number(value) : { active: value ? "email" : null }; },
    paintNotice() {
      const notice = toastRef.current!;
      presentedExitRef.current = presentSignInExit(notice, notice,
        attachSignInExit(notice, notice, presentedExitRef.current), now);
    },
    unmount() {
      phase = "layout";
      cells.forEach(cell => cell.cleanup?.());
    },
  };
}

describe.each([false, true])("R7 login commit phases, reverse layout order=%s", reverse => {
  test.each(["deletion", "loading", "form"] as const)("initial %s owns first Back after layout, before passive", kind => {
    const h = phaseHarness("sign-in", reverse);
    h.render(kind);
    expect(h.subscribed).toBe(0);
    h.layout();
    expect(h.subscribed).toBe(1);
    expect(h.isGuestRef.current).toBe(true);
    expect(h.press()).toBe(true);
    expect(h.toastRef.current?.exitOnBack).toBe(true);
    expect(h.setToast).toHaveBeenCalledTimes(1);
    expect(h.exitApp).not.toHaveBeenCalled();
    h.passive();
    expect(h.subscribed).toBe(1);
    expect(h.changes).toEqual(["layout:add"]);
  });

  test("focused home to notice installs in that layout commit", () => {
    const h = phaseHarness("sign-in", reverse);
    h.render("home"); h.layout(); h.passive();
    expect(h.subscribed).toBe(0);
    h.render("loading"); h.layout();
    expect(h.subscribed).toBe(1);
    expect(h.press()).toBe(true);
    expect(h.setToast).toHaveBeenCalledTimes(1);
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test("home commit removes the listener before passive and cannot exit through an old deadline", () => {
    const h = phaseHarness("sign-in", reverse);
    h.render(); h.layout(); h.passive(); h.press(); h.paintNotice();
    const old = h.handler;
    expect(h.presentedExitRef.current?.exitOnBackUntil).toBe(2900);
    h.render("home"); h.layout();
    expect(h.subscribed).toBe(0);
    expect(h.isGuestRef.current).toBe(false);
    expect(h.press()).toBe(false); // Lower listeners / Android now own this event.
    expect(old()).toBe(true); // Even a separately retained callback cannot exit.
    expect(h.exitApp).not.toHaveBeenCalled();
    expect(h.toastRef.current).toBeNull();
    expect(h.setToast).toHaveBeenCalledTimes(2); // Original notice, then layout clear.
    h.passive();
    expect(h.subscribed).toBe(0);
    expect(h.changes).toEqual(["layout:add", "layout:remove"]);
  });

  test("blur and refocus remove and restore ownership without a passive gap", () => {
    const h = phaseHarness("sign-in", reverse);
    h.render(); h.layout(); h.passive(); h.press(); h.paintNotice();
    h.render("form", false); h.layout();
    expect(h.subscribed).toBe(0);
    expect(h.isGuestRef.current).toBe(false);
    expect(h.press()).toBe(false);
    h.passive();
    h.render(); h.layout();
    expect(h.subscribed).toBe(1);
    expect(h.press()).toBe(true);
    expect(h.exitApp).not.toHaveBeenCalled();
    expect(h.setToast).toHaveBeenCalledTimes(3);
    expect(h.changes).toEqual(["layout:add", "layout:remove", "layout:add"]);
  });

  test("dependency reinstall is all layout and preserves the notice grant", () => {
    const h = phaseHarness("sign-in", reverse);
    h.render(); h.layout(); h.passive(); h.press(); h.paintNotice();
    const grant = h.presentedExitRef.current;
    h.render("form", true, key => `translated:${key}`); h.layout();
    expect(h.subscribed).toBe(1);
    expect(h.presentedExitRef.current).toBe(grant);
    expect(h.changes).toEqual(["layout:add", "layout:remove", "layout:add"]);
    expect(h.press()).toBe(true);
    expect(h.exitApp).toHaveBeenCalledTimes(1);
  });

  test("notice to notice leaves hook ownership alone; unmount clears it in layout", () => {
    const h = phaseHarness("sign-in", reverse);
    h.render("loading"); h.layout(); h.passive(); h.press(); h.paintNotice();
    const grant = h.presentedExitRef.current;
    // Only hook effects run here. Overlay reattachment's accepted two-frame
    // pause is exercised separately in auth-hardware-back.test.ts.
    h.render("form"); h.layout();
    expect(h.changes).toEqual(["layout:add"]);
    expect(h.presentedExitRef.current).toBe(grant);
    h.unmount();
    expect(h.subscribed).toBe(0);
    expect(h.isGuestRef.current).toBe(false);
    expect(h.toastRef.current).toBeNull();
  });
});

test.each([false, true].flatMap(directLink => [false, true].map(busy => ({ directLink, busy }))))(
  "R7 signup first layout Back directLink=$directLink busy=$busy", ({ directLink, busy }) => {
    const h = phaseHarness("sign-up");
    // No history is provided in the direct-link case: the real handler must
    // request dismissTo regardless, leaving resolution to expo-router.
    h.render(directLink ? "loading" : "form"); h.busy(busy);
    expect(h.subscribed).toBe(0);
    h.layout();
    expect(h.subscribed).toBe(1);
    expect(h.press()).toBe(true);
    expect(h.dismissTo).toHaveBeenCalledTimes(busy ? 0 : 1);
    if (!busy) expect(h.dismissTo).toHaveBeenCalledWith("/sign-in");
    expect(h.exitApp).not.toHaveBeenCalled();
    h.passive();
    expect(h.changes).toEqual(["layout:add"]);
  },
);

test("R7 signup focus and live write lock do not wait for passive", () => {
  const h = phaseHarness("sign-up");
  h.render(); h.layout(); h.passive();
  h.busy(true); expect(h.press()).toBe(true); expect(h.dismissTo).not.toHaveBeenCalled();
  h.busy(false); h.press(); expect(h.dismissTo).toHaveBeenCalledWith("/sign-in");
  h.render("form", false); h.layout(); expect(h.subscribed).toBe(0); h.passive();
  h.render(); h.layout(); expect(h.subscribed).toBe(1);
  h.press(); expect(h.dismissTo).toHaveBeenCalledTimes(2);
  h.unmount(); expect(h.subscribed).toBe(0);
  expect(h.changes).toEqual(["layout:add", "layout:remove", "layout:add", "layout:remove"]);
});

test.each([false, true])("Z18 signup Back on the code step returns to the form first, busy=%s", busy => {
  const h = phaseHarness("sign-up");
  h.render(); h.layout(); h.passive();
  // The step changes without re-subscribing: the handler reads it when Back is pressed.
  h.codeStep("mailbox@example.invalid"); h.busy(busy);
  expect(h.press()).toBe(true);
  expect(h.leaveConfirmStep).toHaveBeenCalledTimes(busy ? 0 : 1);
  expect(h.dismissTo).not.toHaveBeenCalled();
  h.busy(false);
  // Out of the step (or after the held write), the next Back is the D2 one: sign-in.
  if (busy) { expect(h.press()).toBe(true); expect(h.leaveConfirmStep).toHaveBeenCalledTimes(1); }
  expect(h.dismissTo).not.toHaveBeenCalled();
  expect(h.press()).toBe(true);
  expect(h.dismissTo.mock.calls).toEqual([["/sign-in"]]);
  expect(h.changes).toEqual(["layout:add"]);
});

test.each((["sign-in", "sign-up"] as const).flatMap(screen => ["ios", "web"].map(OS => ({ screen, OS }))))(
  "R7 $screen $OS never subscribes in any phase", ({ screen, OS }) => {
    const h = phaseHarness(screen, false, OS);
    for (const focused of [true, false, true]) {
      h.render("form", focused); expect(h.subscribed).toBe(0);
      h.layout(); expect(h.subscribed).toBe(0);
      h.passive(); expect(h.subscribed).toBe(0);
    }
    expect(h.BackHandler.addEventListener).not.toHaveBeenCalled();
    expect(h.exitApp).not.toHaveBeenCalled();
    expect(h.dismissTo).not.toHaveBeenCalled();
  },
);

test.each(["sign-in", "sign-up"] as const)("R7 %s Back subscription belongs only to layout with explicit focus dependencies", screen => {
  const { source, ast, calls } = backEffects(screen);
  const subscriptions = calls.filter(call => call.getText(ast).includes("hardwareBackPress"));
  expect(source.match(/hardwareBackPress/g)).toHaveLength(1);
  expect(subscriptions).toHaveLength(1);
  expect(source).not.toMatch(/\buseFocusEffect\b/);
  expect(source).toContain("const isFocused = useIsFocused();");
  const subscription = subscriptions[0];
  expect(subscription.expression.getText(ast)).toBe("useLayoutEffect");
  const deps = subscription.arguments[1] as ts.ArrayLiteralExpression;
  expect(ts.isArrayLiteralExpression(deps)).toBe(true);
  expect(deps.elements.map(element => element.getText(ast))).toContain("isFocused");
  expect(subscription.arguments[0].getText(ast)).toContain("!isFocused");
});
