import { readFileSync } from "node:fs";
import {
  SIGN_IN_TOAST_DURATION_MS, clearSignInExit, createSignInBackHandler, deferSignInExitPresentation,
  presentSignInExit, replacePresentedSignInExit, type PresentedSignInExit,
} from "../sign-in-back";
import { replaceSignInToast, type SignInToast } from "../sign-in-toast";
import { createSignUpBackHandler } from "../sign-up-back";

const read = (file: string) => readFileSync(file, "utf8");
const signIn = read("src/lib/auth/useSignInForm.ts");
const signUp = read("src/lib/auth/useSignUpForm.ts");
const inEffect = signIn.slice(signIn.indexOf("useFocusEffect(useCallback("), signIn.indexOf("  const setEmailAndClearReset"));
const upEffect = signUp.slice(signUp.indexOf("useFocusEffect(useCallback("), signUp.indexOf("  // A valid DOB"));

const generalNotice = (): SignInToast => ({ message: "B", tone: "danger" });
const exitNotice = (): SignInToast => ({ message: "exit notice", tone: "info", exitOnBack: true });

function signInHarness(initial: SignInToast | null) {
  const state = { actionLock: 0, now: 100, toast: initial, presented: null as PresentedSignInExit | null };
  const setToast = (next: SignInToast | null, expected?: SignInToast | null) => {
    next = replaceSignInToast(state.toast, next, expected);
    state.presented = replacePresentedSignInExit(state.presented, state.toast, next);
    state.toast = next;
  };
  const present = (committed = state.toast!) => {
    const next = presentSignInExit(state.toast, committed, state.presented, state.now);
    if (next) state.presented = next;
    return next;
  };
  const exitApp = jest.fn();
  const showNotice = jest.fn(() => setToast(exitNotice()));
  const back = createSignInBackHandler({
    isBusy: () => state.actionLock > 0,
    presentedExit: () => state.presented,
    hasPendingExit: () => state.toast?.exitOnBack === true,
    now: () => state.now, showNotice, exitApp,
  });
  return { state, setToast, present, back, showNotice, exitApp, blur: () => clearSignInExit(state.toast, setToast) };
}

// Every transition uses the production functions. No RN, React mount or renderer.
describe.each(["no notice", "general notice B"])("R4 sign-in presentation: %s", (initial) => {
  const harness = () => signInHarness(initial === "no notice" ? null : generalNotice());

  test("1 pending presses are consumed without exit, replacement or a deadline", () => {
    const h = harness();
    expect(h.back()).toBe(true);
    const pending = h.state.toast;
    expect(pending?.exitOnBack).toBe(true);
    expect(h.state.presented).toBeNull();
    for (const now of [100, 101, 2900, 10000]) {
      h.state.now = now;
      expect(h.back()).toBe(true);
      expect(h.state.toast).toBe(pending);
    }
    expect(h.showNotice).toHaveBeenCalledTimes(1);
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test("2 only a presented notice grants exit inside its window", () => {
    const h = harness();
    h.back();
    h.present();
    h.state.now = 2899;
    expect(h.back()).toBe(true);
    expect(h.exitApp).toHaveBeenCalledTimes(1);
    expect(h.showNotice).toHaveBeenCalledTimes(1);
  });

  test.each([2900, 2901, 10000])("3 expired presentation at %i requests a new unarmed notice", (now) => {
    const h = harness();
    h.back();
    const old = h.state.toast;
    h.present();
    h.state.now = now;
    expect(h.back()).toBe(true);
    expect(h.state.toast).not.toBe(old);
    expect(h.state.presented).toBeNull();
    expect(h.showNotice).toHaveBeenCalledTimes(2);
    expect(h.back()).toBe(true);
    expect(h.showNotice).toHaveBeenCalledTimes(2);
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test.each([0, 1])("4 replacing with B revokes exit before another press %i ms later", (delay) => {
    const h = harness();
    h.back();
    h.present();
    h.setToast(generalNotice());
    h.state.now += delay;
    expect(h.back()).toBe(true);
    expect(h.state.presented).toBeNull();
    expect(h.showNotice).toHaveBeenCalledTimes(2);
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  test.each([false, true])("5 blur then refocus revokes guidance, presented=%s", (presented) => {
    const h = harness();
    h.back();
    const old = h.state.toast!;
    if (presented) h.present();
    h.blur();
    expect(h.state.toast).toBeNull();
    expect(h.state.presented).toBeNull();
    // A queued old effect must not restore its grant, including after refocus.
    expect(h.present(old)).toBeNull();
    expect(h.back()).toBe(true);
    expect(h.present(old)).toBeNull();
    expect(h.showNotice).toHaveBeenCalledTimes(2);
    expect(h.exitApp).not.toHaveBeenCalled();
    const other = generalNotice();
    h.setToast(other);
    h.blur();
    expect(h.state.toast).toBe(other);
  });

  test("6 replaced pending notices and late commits cannot arm another object", () => {
    const h = harness();
    h.back();
    const old = h.state.toast!;
    const other = generalNotice();
    h.setToast(other);
    expect(h.present(other)).toBeNull();
    expect(h.present(old)).toBeNull();
    expect(h.back()).toBe(true);
    const next = h.state.toast!;
    expect(next).not.toBe(old);
    expect(next).toEqual(old); // Equal fields/timestamps are not ownership.
    expect(h.present(old)).toBeNull();
    expect(h.state.presented).toBeNull();
    expect(h.back()).toBe(true);
    expect(h.showNotice).toHaveBeenCalledTimes(2);
    expect(h.exitApp).not.toHaveBeenCalled();
    const mark = h.present(next);
    expect(h.present(old)).toBeNull();
    expect(h.state.presented).toBe(mark);
  });

  test.each(["initial", "pending", "presented", "expired", "replaced", "blurred"])(
    "7 live writes consume Back during %s without changing guidance", (stage) => {
      const h = harness();
      if (stage !== "initial") h.back();
      if (["presented", "expired", "replaced", "blurred"].includes(stage)) h.present();
      if (stage === "expired") h.state.now = 2900;
      if (stage === "replaced") h.setToast(generalNotice());
      if (stage === "blurred") h.blur();
      const toast = h.state.toast;
      const presented = h.state.presented;
      const calls = h.showNotice.mock.calls.length;
      for (const count of [2, 1]) {
        h.state.actionLock = count;
        expect(h.back()).toBe(true);
        expect(h.state.toast).toBe(toast);
        expect(h.state.presented).toBe(presented);
        expect(h.showNotice).toHaveBeenCalledTimes(calls);
        expect(h.exitApp).not.toHaveBeenCalled();
      }
      h.state.actionLock = 0;
      expect(h.back()).toBe(true);
      expect(h.exitApp).toHaveBeenCalledTimes(stage === "presented" ? 1 : 0);
    },
  );

  test.each([100, 2899, 10000])("8 delayed commit at %i starts a full 2800 ms window", (committedAt) => {
    const h = harness();
    h.back();
    h.state.now = committedAt;
    const mark = h.present()!;
    expect(SIGN_IN_TOAST_DURATION_MS).toBe(2800);
    expect(mark.exitOnBackUntil).toBe(committedAt + 2800);
    h.state.now += 2799;
    expect(h.present()).toBe(mark); // A repeated acknowledgement never extends it.
    expect(h.back()).toBe(true);
    expect(h.exitApp).toHaveBeenCalledTimes(1);
    h.state.now += 1;
    expect(h.back()).toBe(true);
    expect(h.exitApp).toHaveBeenCalledTimes(1);
    expect(h.showNotice).toHaveBeenCalledTimes(2);
  });

  test("owned expiry revokes immediately; a stale timer cannot revoke the replacement", () => {
    const h = harness();
    h.back();
    const old = h.state.toast!;
    h.present();
    h.setToast(null, old);
    expect(h.state.presented).toBeNull();
    h.back();
    const replacement = h.state.toast!;
    const mark = h.present();
    h.setToast(null, old);
    expect(h.state.toast).toBe(replacement);
    expect(h.state.presented).toBe(mark);
    h.back();
    expect(h.exitApp).toHaveBeenCalledTimes(1);
  });

  test("post-commit acknowledgement waits across frames and starts the deadline afterwards", () => {
    const h = harness();
    h.back();
    const pending = h.state.toast;
    const frames: (() => void)[] = [];
    const release = jest.fn();
    const cancel = deferSignInExitPresentation({
      requestFrame: callback => frames.push(callback), cancelFrame: jest.fn(),
      present: () => { h.present(); return release; },
    });
    expect(frames).toHaveLength(1);
    expect(h.back()).toBe(true);
    expect(h.state.presented).toBeNull();
    frames[0]();
    expect(frames).toHaveLength(2);
    h.state.now = 10000;
    expect(h.back()).toBe(true);
    expect(h.state.toast).toBe(pending);
    expect(h.showNotice).toHaveBeenCalledTimes(1);
    expect(h.exitApp).not.toHaveBeenCalled();
    frames[1]();
    expect(h.state.presented?.exitOnBackUntil).toBe(12800);
    expect(h.back()).toBe(true);
    expect(h.exitApp).toHaveBeenCalledTimes(1);
    cancel();
    expect(release).toHaveBeenCalledTimes(1);
  });
});

test.each([0, 1, 2])("presentation cleanup after %i frames cancels even an already queued callback", (elapsed) => {
  const frames: (() => void)[] = [];
  const release = jest.fn();
  const present = jest.fn(() => release);
  const cancelFrame = jest.fn();
  const cleanup = deferSignInExitPresentation({
    requestFrame: callback => frames.push(callback), cancelFrame, present,
  });
  for (let index = 0; index < elapsed; index += 1) frames[index]();
  const pendingCount = frames.length;
  cleanup();
  expect(cancelFrame).toHaveBeenCalledWith(pendingCount);
  // Simulate delivery racing with cancellation, without running any renderer.
  frames.at(-1)!();
  expect(frames).toHaveLength(pendingCount);
  expect(present).toHaveBeenCalledTimes(elapsed === 2 ? 1 : 0);
  expect(release).toHaveBeenCalledTimes(elapsed === 2 ? 1 : 0);
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
  const writes = ["handleOAuth", "handleNaver", "handleSubmit", "handleForgotPassword"];
  const writeBody = (name: string) => {
    const index = writes.indexOf(name);
    return signIn.slice(signIn.indexOf(`const ${name} =`), signIn.indexOf(
      index + 1 < writes.length ? `const ${writes[index + 1]} =` : "const canSubmit =",
    ));
  };

  test.each(writes)("%s raises the synchronous count before awaiting and releases it in finally", (name) => {
    const body = writeBody(name);
    const raised = body.indexOf("actionLockRef.current += 1;");
    const lowered = body.indexOf("actionLockRef.current -= 1;");
    expect(raised).toBeGreaterThanOrEqual(0);
    expect(raised).toBeLessThan(body.indexOf("try {"));
    expect(raised).toBeLessThan(body.indexOf("await "));
    expect(lowered).toBeGreaterThan(body.indexOf("finally {"));
    expect(body).toMatch(/finally \{\s*actionLockRef.current -= 1;/);
  });

  test("invalid reset email returns before acquiring the auth write lock", () => {
    const beforeWrite = writeBody("handleForgotPassword").split("setResetSubmitting(true)")[0];
    expect(beforeWrite).toContain('if (!resetEmail.includes("@"))');
    expect(beforeWrite).toContain("return;");
    expect(beforeWrite).not.toContain("actionLockRef.current");
  });

  test("the installed sign-in handler reads the synchronous lock without busy-state resubscription", () => {
    expect(signIn).toContain("const actionLockRef = useRef(0)");
    expect(inEffect).toContain("isBusy: () => actionLockRef.current > 0");
    expect(inEffect).toContain("[userId, setToast, t]");
    expect(inEffect).not.toMatch(/submitting|oauthSubmitting|resetSubmitting/);
  });

  test("guest loading keeps ownership and a confirmed user releases it", () => {
    expect(inEffect).toContain('if (Platform.OS !== "android" || userId) return;');
    expect(inEffect).not.toContain("loading");
    expect(inEffect).toMatch(/\}, \[userId,/);
  });

  test("loading and the form share the existing accessible notice", () => {
    const screen = read("src/screens/deepspace/dds-sign-in-screen.tsx");
    const notice = screen.slice(screen.indexOf("const signInNotice ="), screen.indexOf('  if (branch.kind === "deletion")'));
    const loading = screen.slice(screen.indexOf('  if (branch.kind === "loading")'), screen.indexOf('  if (branch.kind === "home")'));
    expect(notice).toContain("toast ? (");
    expect(notice).toContain('accessibilityRole="alert"');
    expect(notice).toContain('accessibilityLiveRegion={toast.tone === "danger" ? "assertive" : "polite"}');
    expect(notice).toContain("{toast.message}");
    expect(loading).toContain("{exitNoticeOverlay}");
    expect(loading).toContain("{inlineNotice}");
    expect(screen.slice(screen.indexOf('  if (branch.kind === "home")'))).toContain("{exitNoticeOverlay}");
    expect(screen.slice(screen.indexOf('  if (branch.kind === "home")'))).toContain("{inlineNotice}");
  });

  test.each([["sign-in", inEffect], ["sign-up", upEffect]])("%s registers only during focus and removes its subscription", (_name, effect) => {
    expect(effect).toContain("useFocusEffect(useCallback(");
    expect(effect).toContain('Platform.OS !== "android"');
    expect(effect).toContain('BackHandler.addEventListener("hardwareBackPress", onBackPress)');
    expect(effect).toContain("sub.remove()");
    expect(effect).not.toMatch(/router\.(?:push|back)\(/);
  });

  test("sign-in reads only the presented grant for exit and the requested toast only for holding", () => {
    expect(inEffect).toContain("const onBackPress = createSignInBackHandler({");
    expect(inEffect).toContain("presentedExit: () => presentedExitRef.current");
    expect(inEffect).toContain("hasPendingExit: () => toastRef.current?.exitOnBack === true");
    expect(inEffect).not.toContain("exitDeadline");
    expect(inEffect).toContain("now: Date.now");
    expect(inEffect).toContain('showNotice: () => setToast({ tone: "info", message: t("signIn.exitOnBack"), exitOnBack: true })');
    expect(inEffect).toContain("exitApp: () => BackHandler.exitApp()");
    expect(inEffect).toMatch(/return \(\) => \{\s*clearSignInExit\(toastRef.current, setToast\);\s*sub.remove\(\);/);
  });

  test("only the committed overlay effect presents; its deadline also owns the timer", () => {
    const screen = read("src/screens/deepspace/dds-sign-in-screen.tsx");
    expect(screen).toMatch(/useEffect\(\(\) => \{\s*if \(noticePlacement !== "overlay" \|\| !toast\) return;\s*return deferSignInExitPresentation\(\{\s*requestFrame: requestAnimationFrame,\s*cancelFrame: cancelAnimationFrame,\s*present: \(\) => onExitNoticePresented\(toast\),\s*\}\);\s*\}, \[noticePlacement, toast, onExitNoticePresented\]\);/);
    expect(screen.match(/onExitNoticePresented\(toast\)/g)).toHaveLength(1);
    expect(screen).not.toContain("useLayoutEffect");
    const acknowledge = signIn.slice(signIn.indexOf("const onExitNoticePresented ="), signIn.indexOf("const [resetHelpVisible"));
    expect(acknowledge).toContain("presentSignInExit(toastRef.current, notice, presentedExitRef.current, Date.now())");
    expect(acknowledge).toMatch(/if \(!presented\) return;\s*presentedExitRef.current = presented;/);
    expect(acknowledge).toContain("Math.max(0, presented.exitOnBackUntil - Date.now())");
    expect(acknowledge).toContain("setTimeout(() => setToast(null, notice), duration)");
    expect(acknowledge).toMatch(/clearTimeout\(timeout\);\s*if \(presentedExitRef.current === presented\) presentedExitRef.current = null;/);
    expect(signIn.match(/presentedExitRef.current = presented;/g)).toHaveLength(1);
    expect(signIn).toContain("if (!toast || toast.exitOnBack) return;");
    expect(signIn).toContain("setTimeout(() => setToast(null, toast), duration)");
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
