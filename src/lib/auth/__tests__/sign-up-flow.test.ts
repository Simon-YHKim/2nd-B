import { submitSignUp, type SignUpFlowDeps } from "../sign-up-flow";

class FakeAgeGateError extends Error {}
class FakeBreachedPasswordError extends Error {}
class FakeExistingAccountLikelyError extends Error {}

function makeDeps(overrides: Partial<SignUpFlowDeps> = {}): SignUpFlowDeps {
  return {
    signUp: jest.fn().mockResolvedValue({ kind: "active", userId: "user-1", judgeMode: false, created: true }),
    // boolean 을 돌려준다. undefined 를 두면 toEqual 이 그 키를 "없는 키"로 보아
    // 이음매가 열렸는지 닫혔는지를 구분하지 못한다.
    recordConsent: jest.fn().mockResolvedValue(true),
    refreshAuth: jest.fn().mockResolvedValue(undefined),
    isAgeGateError: (e: unknown) => e instanceof FakeAgeGateError,
    isBreachedPasswordError: (e: unknown) => e instanceof FakeBreachedPasswordError,
    isExistingAccountLikelyError: (e: unknown) => e instanceof FakeExistingAccountLikelyError,
    ...overrides,
  };
}

function callOrder(fn: unknown): number {
  return (fn as jest.Mock).mock.invocationCallOrder[0];
}

/** A promise that resolves only when .release() is called — pins that the flow
 *  actually AWAITS a dependency instead of fire-and-forgetting it. */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("submitSignUp (E2E-3 silent drop / E2E-4 double entry)", () => {
  test("confirm-email account: reports the pending state without consent or auth refresh", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockResolvedValue({ kind: "confirmationRequired" }),
    });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "confirmationRequired" });
    expect(deps.recordConsent).not.toHaveBeenCalled();
    expect(deps.refreshAuth).not.toHaveBeenCalled();
  });

  test("success: records consent for the fresh userId, refreshes auth, then reports entered", async () => {
    const deps = makeDeps();
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "entered", judgeMode: false, consentRecorded: true });
    expect(deps.recordConsent).toHaveBeenCalledTimes(1);
    expect(deps.recordConsent).toHaveBeenCalledWith("user-1");
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
  });

  // [결정 09] 이음매가 값을 실어 오는지. 화면은 이걸 아직 읽지 않는다 —
  // 읽을 자리를 만드는 것이 이 회차의 전부다.
  test("consentRecorded: true when the ledger write succeeded", async () => {
    const deps = makeDeps({ recordConsent: jest.fn().mockResolvedValue(true) });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "entered", judgeMode: false, consentRecorded: true });
  });

  test("consentRecorded: FALSE reaches the caller — the account exists without a consent row, and entry is still allowed", async () => {
    const deps = makeDeps({ recordConsent: jest.fn().mockResolvedValue(false) });
    const result = await submitSignUp(deps);

    // 값이 실제로 실려야 한다. 이음매를 Promise<unknown> 으로 되돌리면 여기서 깨진다.
    expect(result).toEqual({ kind: "entered", judgeMode: false, consentRecorded: false });
    // 그리고 실패해도 진입은 막지 않는다 — writer 계약("must NOT block account creation").
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
  });

  test("consentRecorded: null when it was never attempted (created:false) — not the same as a failed write", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockResolvedValue({ kind: "active", userId: "user-1", judgeMode: false, created: false }),
    });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "entered", judgeMode: false, consentRecorded: null });
    expect(deps.recordConsent).not.toHaveBeenCalled();
  });

  test("refreshAuth runs AFTER signUp and recordConsent — the context must know hasProfile=true before the screen navigates (E2E-4)", async () => {
    const deps = makeDeps();
    await submitSignUp(deps);

    expect(callOrder(deps.signUp)).toBeLessThan(callOrder(deps.recordConsent));
    expect(callOrder(deps.recordConsent)).toBeLessThan(callOrder(deps.refreshAuth));
  });

  test("the flow does not settle until refreshAuth resolves — navigating before the context refresh re-asks DOB+consent on /complete-profile (E2E-4)", async () => {
    const gate = deferred();
    const deps = makeDeps({ refreshAuth: jest.fn().mockReturnValue(gate.promise) });

    let settled = false;
    const pending = submitSignUp(deps).then((r) => {
      settled = true;
      return r;
    });
    // Drain microtasks: signUp + recordConsent resolve, refreshAuth doesn't.
    await Promise.resolve().then(() => {}).then(() => {}).then(() => {});
    expect(settled).toBe(false);

    gate.release();
    expect(await pending).toEqual({ kind: "entered", judgeMode: false, consentRecorded: true });
  });

  test("judge mode propagates so the screen can hold the guard open for the welcome toast", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockResolvedValue({ kind: "active", userId: "judge-1", judgeMode: true, created: true }),
    });
    const result = await submitSignUp(deps);
    expect(result).toEqual({ kind: "entered", judgeMode: true, consentRecorded: true });
  });

  test("existing row with the correct password (created:false — effectively a sign-in): enters WITHOUT re-recording consent, still refreshes", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockResolvedValue({ kind: "active", userId: "user-1", judgeMode: false, created: false }),
    });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "entered", judgeMode: false, consentRecorded: null });
    expect(deps.recordConsent).not.toHaveBeenCalled();
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
  });

  test("age gate: reports ageGate without consent or refresh — no session was created", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockRejectedValue(new FakeAgeGateError("under floor")),
    });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "ageGate" });
    expect(deps.recordConsent).not.toHaveBeenCalled();
    expect(deps.refreshAuth).not.toHaveBeenCalled();
  });

  test("breached password: reports breachedPassword without consent or refresh", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockRejectedValue(new FakeBreachedPasswordError("hibp hit")),
    });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "breachedPassword" });
    expect(deps.recordConsent).not.toHaveBeenCalled();
    expect(deps.refreshAuth).not.toHaveBeenCalled();
  });

  test("likely-existing account (J3): reports maybeExistingAccount so the screen can suggest sign-in, without consent or refresh", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockRejectedValue(new FakeExistingAccountLikelyError("invalid login credentials")),
    });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "maybeExistingAccount" });
    expect(deps.recordConsent).not.toHaveBeenCalled();
    expect(deps.refreshAuth).not.toHaveBeenCalled();
  });

  test("profile-INSERT failure (the E2E-3 chain): reports failed with the message so the MOUNTED form can show it — no refresh", async () => {
    const deps = makeDeps({
      signUp: jest.fn().mockRejectedValue(new Error("row level security")),
    });
    const result = await submitSignUp(deps);

    expect(result).toEqual({ kind: "failed", message: "row level security" });
    expect(deps.recordConsent).not.toHaveBeenCalled();
    expect(deps.refreshAuth).not.toHaveBeenCalled();
  });
});
