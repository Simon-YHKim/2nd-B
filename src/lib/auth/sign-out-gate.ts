// Q-261018-50 (review #2625 r1 · r2): one sign-out flow at a time, from the button press to the end.
// idle -> capturing (reading the session the person is signing out) -> confirming (dialog open)
// -> running (signing out). A second press, a second scope or a second confirm while any phase is
// active does nothing. Cancelling the dialog or a failure returns to idle.
export type SignOutPhase = "idle" | "capturing" | "confirming" | "running";

export function createSignOutGate() {
  let phase: SignOutPhase = "idle";
  return {
    get phase(): SignOutPhase {
      return phase;
    },
    /** Take the gate before the first await of a button press. False when a flow is already active. */
    tryCapture(): boolean {
      if (phase !== "idle") return false;
      phase = "capturing";
      return true;
    },
    /** The session was captured and the dialog is about to open. */
    confirming(): void {
      if (phase === "capturing") phase = "confirming";
    },
    /** The dialog was confirmed. Only the first confirm of an open dialog runs. */
    tryRun(): boolean {
      if (phase !== "confirming") return false;
      phase = "running";
      return true;
    },
    /** The dialog closed without confirming. */
    cancelConfirm(): void {
      if (phase === "confirming") phase = "idle";
    },
    /** Capture or sign-out failed, or nobody was signed in. */
    release(): void {
      phase = "idle";
    },
  };
}
