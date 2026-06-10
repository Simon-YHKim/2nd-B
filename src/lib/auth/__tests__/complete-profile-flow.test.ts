import {
  submitCompleteProfile,
  signOutAndSettle,
  type CompleteProfileFlowDeps,
} from "../complete-profile-flow";

class FakeAgeGateError extends Error {}

function makeDeps(overrides: Partial<CompleteProfileFlowDeps> = {}): CompleteProfileFlowDeps {
  return {
    ensureProfile: jest.fn().mockResolvedValue({ created: true, judgeMode: false }),
    recordConsent: jest.fn().mockResolvedValue(undefined),
    refreshAuth: jest.fn().mockResolvedValue(undefined),
    signOutUser: jest.fn().mockResolvedValue(undefined),
    isAgeGateError: (e: unknown) => e instanceof FakeAgeGateError,
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

describe("submitCompleteProfile (E2E-1: silent Continue loop)", () => {
  test("fresh profile: records consent, refreshes auth, then reports entered", async () => {
    const deps = makeDeps();
    const result = await submitCompleteProfile(deps);

    expect(result).toEqual({ kind: "entered", judgeMode: false });
    expect(deps.recordConsent).toHaveBeenCalledTimes(1);
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
    expect(deps.signOutUser).not.toHaveBeenCalled();
  });

  test("refreshAuth runs AFTER ensureProfile and recordConsent — the context must know hasProfile=true before the screen navigates", async () => {
    const deps = makeDeps();
    await submitCompleteProfile(deps);

    expect(callOrder(deps.ensureProfile)).toBeLessThan(callOrder(deps.recordConsent));
    expect(callOrder(deps.recordConsent)).toBeLessThan(callOrder(deps.refreshAuth));
  });

  test("the flow does not settle until refreshAuth resolves — navigating before the context refresh IS the E2E-1 bug", async () => {
    const gate = deferred();
    const deps = makeDeps({ refreshAuth: jest.fn().mockReturnValue(gate.promise) });

    let settled = false;
    const pending = submitCompleteProfile(deps).then((r) => {
      settled = true;
      return r;
    });
    // Drain microtasks: ensureProfile + recordConsent resolve, refreshAuth doesn't.
    await Promise.resolve().then(() => {}).then(() => {}).then(() => {});
    expect(settled).toBe(false);

    gate.release();
    expect(await pending).toEqual({ kind: "entered", judgeMode: false });
  });

  test("existing profile (created:false — the old silent re-submit loop): skips consent but STILL refreshes auth", async () => {
    const deps = makeDeps({
      ensureProfile: jest.fn().mockResolvedValue({ created: false, judgeMode: false }),
    });
    const result = await submitCompleteProfile(deps);

    expect(result).toEqual({ kind: "entered", judgeMode: false });
    expect(deps.recordConsent).not.toHaveBeenCalled();
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
  });

  test("judge mode propagates so the screen can show the judge welcome", async () => {
    const deps = makeDeps({
      ensureProfile: jest.fn().mockResolvedValue({ created: true, judgeMode: true }),
    });
    const result = await submitCompleteProfile(deps);
    expect(result).toEqual({ kind: "entered", judgeMode: true });
  });

  test("age gate: reports ageGate WITHOUT signing out or refreshing — the screen must show the C10 toast first (a refresh would unmount it)", async () => {
    const deps = makeDeps({
      ensureProfile: jest.fn().mockRejectedValue(new FakeAgeGateError("under floor")),
    });
    const result = await submitCompleteProfile(deps);

    expect(result).toEqual({ kind: "ageGate" });
    expect(deps.signOutUser).not.toHaveBeenCalled();
    expect(deps.refreshAuth).not.toHaveBeenCalled();
    expect(deps.recordConsent).not.toHaveBeenCalled();
  });

  test("non-age-gate failure: saveFailed with the message, no refresh, no sign-out", async () => {
    const deps = makeDeps({
      ensureProfile: jest.fn().mockRejectedValue(new Error("row level security")),
    });
    const result = await submitCompleteProfile(deps);

    expect(result).toEqual({ kind: "saveFailed", message: "row level security" });
    expect(deps.refreshAuth).not.toHaveBeenCalled();
    expect(deps.signOutUser).not.toHaveBeenCalled();
  });
});

describe("signOutAndSettle (E2E-2: sign-out render crash; also the post-toast age-gate exit)", () => {
  test("signs out, THEN settles auth — userId must be null in context before the screen navigates", async () => {
    const deps = makeDeps();
    const result = await signOutAndSettle(deps);

    expect(result).toEqual({ signedOut: true });
    expect(deps.signOutUser).toHaveBeenCalledTimes(1);
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
    expect(callOrder(deps.signOutUser)).toBeLessThan(callOrder(deps.refreshAuth));
  });

  test("does not settle until refreshAuth resolves — navigating against an unsettled context IS the E2E-2 crash", async () => {
    const gate = deferred();
    const deps = makeDeps({ refreshAuth: jest.fn().mockReturnValue(gate.promise) });

    let settled = false;
    const pending = signOutAndSettle(deps).then((r) => {
      settled = true;
      return r;
    });
    await Promise.resolve().then(() => {}).then(() => {}).then(() => {});
    expect(settled).toBe(false);

    gate.release();
    expect(await pending).toEqual({ signedOut: true });
  });

  test("failing sign-out: reports signedOut:false (screen stays put) and still re-probes", async () => {
    const deps = makeDeps({
      signOutUser: jest.fn().mockRejectedValue(new Error("network down")),
    });
    const result = await signOutAndSettle(deps);

    expect(result).toEqual({ signedOut: false });
    expect(deps.refreshAuth).toHaveBeenCalledTimes(1);
  });
});
