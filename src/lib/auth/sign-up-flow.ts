// Pure orchestration for the /sign-up submit action (E2E-3 / E2E-4,
// e2e-shots-20260610). Both P1s were the same race family as E2E-1/E2E-2
// (complete-profile-flow.ts): auth-state updates landing mid-submit while the
// screen navigates against a stale context.
//
//   E2E-3  signUpWithEmail internally calls signInWithPassword (auto-confirm
//          flow), so SIGNED_IN fires while the form is still submitting. The
//          screen's guest-only guard (userId → Redirect) unmounted the form
//          mid-submit; when the profile INSERT then failed, signUpWithEmail
//          signed the session back out and threw — but the catch's toast fired
//          on the unmounted screen. Net observed behavior: silent landing on
//          /sign-in with no session and zero feedback.
//   E2E-4  in the success path, the SIGNED_IN probe could run BEFORE the users
//          INSERT landed, caching hasProfile=false; navigating on that stale
//          cache bounced a fresh sign-up to /complete-profile, which re-asked
//          the DOB + consent the user had just typed.
//
// Invariant encoded here (same as complete-profile-flow.ts): the flow settles
// the auth context (refreshAuth) BEFORE the screen is allowed to navigate. The
// screen-side half of the fix is holding the guest guard open while
// submitting, so failure feedback paints on a mounted form.

export interface SignUpFlowDeps {
  /** Creates the auth user + signs in + inserts the users row
   *  (signUpWithEmail). Throws AgeGateError / BreachedPasswordError /
   *  the profile-INSERT error (after signing the half-provisioned session
   *  back out). */
  signUp: () => Promise<{ userId: string; judgeMode: boolean }>;
  /** Persists the consent the user just gave, keyed by the fresh userId.
   *  Awaited BEFORE navigation so a web router.replace can't cancel the
   *  in-flight PIPA consent write. Best-effort by contract; the result is
   *  awaited but never read. */
  recordConsent: (userId: string) => Promise<unknown>;
  /** AuthContext.refresh — re-probes the profile so hasProfile is current
   *  (true: the row was just inserted) before any navigation decision reads
   *  it. Skipping this is exactly the E2E-4 bounce. */
  refreshAuth: () => Promise<void>;
  /** Error discriminators, injectable so tests need no real error classes. */
  isAgeGateError: (e: unknown) => boolean;
  isBreachedPasswordError: (e: unknown) => boolean;
}

export type SignUpSubmitResult =
  /** Account + profile + consent exist and the context knows hasProfile=true
   *  — navigate into the app. */
  | { kind: "entered"; judgeMode: boolean }
  /** Under the C10 age floor. No session was created. */
  | { kind: "ageGate" }
  /** Password found in the HIBP breach corpus. No session was created. */
  | { kind: "breachedPassword" }
  /** Sign-up failed after the pre-checks (profile INSERT, network). signUp
   *  already rolled the session back; the screen stays on the form with the
   *  user's values intact so they can retry — never a silent drop. */
  | { kind: "failed"; message: string };

export async function submitSignUp(deps: SignUpFlowDeps): Promise<SignUpSubmitResult> {
  try {
    const result = await deps.signUp();
    await deps.recordConsent(result.userId);
    // The fix for E2E-4: the context must learn hasProfile=true before the
    // screen calls router.replace("/"), or the index/IntroGate guards read the
    // stale mid-signup probe (hasProfile=false) and bounce the brand-new user
    // to /complete-profile to type their DOB + consent a second time. (If this
    // probe flakes/times out the context falls back and "/" bounces ONCE to
    // /complete-profile, whose own submit re-refreshes — the dead-end cannot
    // reproduce.)
    await deps.refreshAuth();
    return { kind: "entered", judgeMode: result.judgeMode };
  } catch (e) {
    if (deps.isAgeGateError(e)) return { kind: "ageGate" };
    if (deps.isBreachedPasswordError(e)) return { kind: "breachedPassword" };
    return { kind: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}
