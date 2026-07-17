// Pure orchestration for the /complete-profile screen actions (E2E-1 / E2E-2,
// e2e-shots-20260610). Both P0s were ordering bugs between auth-state updates
// and navigation, so the sequencing lives here where jest can pin it down:
//
//   E2E-1  submit created the users row but navigated to "/" BEFORE the
//          AuthContext profile probe cache knew about it, so the "/" guard
//          (hasProfile === false) bounced the user straight back — a silent
//          infinite loop for every new email sign-up.
//   E2E-2  cancel signed out and then navigated to "/" while the context could
//          still hold the stale session (userId set, hasProfile false); the
//          IntroGate global C10 gate then redirect-warred with the navigation
//          ("Maximum update depth exceeded"). settings.tsx documents the same
//          race; sign-out must settle auth state and land on /sign-in directly.
//
// Invariant encoded here: every path settles the auth context (refreshAuth)
// BEFORE the screen is allowed to navigate.

export interface CompleteProfileFlowDeps {
  /** Creates the public.users row for the current session (ensureUserProfile). */
  ensureProfile: () => Promise<{ created: boolean; judgeMode: boolean }>;
  /** Persists the consent the user just gave. Only called on a fresh profile
   *  (created: true) — an existing row already has its sign-up consent and
   *  ensureProfile won't have persisted this DOB. Best-effort by contract;
   *  the result is awaited but never read. */
  recordConsent: () => Promise<unknown>;
  /** AuthContext.refresh — re-probes the profile so hasProfile/userId are
   *  current before any navigation decision reads them. */
  refreshAuth: () => Promise<void>;
  /** Supabase sign-out (used by the age gate and cancel paths). */
  signOutUser: () => Promise<void>;
  /** AgeGateError discriminator (kept injectable so tests need no real error class). */
  isAgeGateError: (e: unknown) => boolean;
  /** EmailInUseError discriminator (same injectable pattern as the age gate). */
  isEmailInUseError: (e: unknown) => boolean;
}

export type CompleteProfileSubmitResult =
  /** Profile exists and the context knows it — navigate into the app. */
  | { kind: "entered"; judgeMode: boolean }
  /** Under the age floor. Deliberately NO sign-out/refresh here: the screen
   *  must show the C10 age-gate toast first (a refresh would publish
   *  userId:null and the screen's own guard would unmount the toast at zero
   *  frames), then call signOutAndSettle and navigate. */
  | { kind: "ageGate" }
  /** The email belongs to another sign-in method (users.email citext UNIQUE):
   *  this session can NEVER gain a profile, so retrying is the stranded-account
   *  loop (U6). Same toast-first contract as ageGate -- the screen shows the
   *  "use your original method" toast, THEN signs out and lands on /sign-in. */
  | { kind: "emailInUse" }
  /** ensureProfile failed for a non-age reason — stay on the form. */
  | { kind: "saveFailed"; message: string };

export async function submitCompleteProfile(
  deps: CompleteProfileFlowDeps,
): Promise<CompleteProfileSubmitResult> {
  try {
    const result = await deps.ensureProfile();
    if (result.created) {
      await deps.recordConsent();
    }
    // The fix for E2E-1: the context must learn hasProfile=true before the
    // screen calls router.replace("/"), or the "/" guard bounces right back.
    // Runs on created:false too — that early-return branch was exactly the
    // silent re-submit loop. (If this probe flakes/times out the context falls
    // back to a stale hasProfile=false and "/" bounces back ONCE — the user's
    // next tap retries the refresh, so the old infinite silent loop cannot
    // reproduce.)
    await deps.refreshAuth();
    return { kind: "entered", judgeMode: result.judgeMode };
  } catch (e) {
    if (deps.isAgeGateError(e)) {
      return { kind: "ageGate" };
    }
    if (deps.isEmailInUseError(e)) {
      return { kind: "emailInUse" };
    }
    return { kind: "saveFailed", message: e instanceof Error ? e.message : String(e) };
  }
}

export type SignOutAndSettleResult = { signedOut: boolean };

/** Shared sign-out path for cancel and the post-toast age-gate (C10) exit. */
export async function signOutAndSettle(
  deps: Pick<CompleteProfileFlowDeps, "signOutUser" | "refreshAuth">,
): Promise<SignOutAndSettleResult> {
  let signedOut = true;
  try {
    await deps.signOutUser();
  } catch {
    signedOut = false;
  }
  // Settle the context either way: on success userId flips to null BEFORE the
  // screen navigates (the E2E-2 fix); on failure the re-probe simply restates
  // the live session.
  await deps.refreshAuth();
  return { signedOut };
}
