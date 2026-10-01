import { submitSignUp, type SignUpFlowDeps } from "../sign-up-flow";
import { submitCompleteProfile, type CompleteProfileFlowDeps } from "../complete-profile-flow";

describe("auth conversion success boundary", () => {
  test.each([true, false])("email created=%s is observed only after auth settles", async (created) => {
    const order: string[] = [];
    const entered = jest.fn(() => { order.push("observe"); });
    const deps: SignUpFlowDeps = {
      signUp: async () => ({ kind: "active", userId: "owner", judgeMode: false, created }),
      recordConsent: async () => true,
      refreshAuth: async () => { order.push("refresh"); }, onEntered: entered,
      isAgeGateError: () => false, isBreachedPasswordError: () => false, isExistingAccountLikelyError: () => false,
    };
    expect(await submitSignUp(deps)).toMatchObject({ kind: "entered" });
    expect(entered).toHaveBeenCalledWith(created, "owner");
    expect(order).toEqual(["refresh", "observe"]);
    entered.mockClear();
    deps.signUp = async () => ({ kind: "confirmationRequired" });
    await submitSignUp(deps);
    expect(entered).not.toHaveBeenCalled();
    deps.signUp = async () => { throw new Error("failed auth"); };
    await submitSignUp(deps);
    expect(entered).not.toHaveBeenCalled();
  });

  test.each([true, false])("profile created=%s is observed after refresh and analytics cannot block entry", async (created) => {
    const order: string[] = [];
    const entered = jest.fn(() => { order.push("observe"); throw new Error("observer failed"); });
    const deps: CompleteProfileFlowDeps = {
      ensureProfile: async () => ({ created, judgeMode: false }), recordConsent: async () => true,
      refreshAuth: async () => { order.push("refresh"); }, signOutUser: async () => {},
      isAgeGateError: () => false, isEmailInUseError: () => false, onEntered: entered,
    };
    expect(await submitCompleteProfile(deps)).toMatchObject({ kind: "entered" });
    expect(entered).toHaveBeenCalledWith(created);
    expect(order).toEqual(["refresh", "observe"]);
    entered.mockClear();
    deps.ensureProfile = async () => { throw new Error("profile failed"); };
    await submitCompleteProfile(deps);
    expect(entered).not.toHaveBeenCalled();
  });
});
