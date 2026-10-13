// One running focus session's end alert.
//
// The alert is handed to the OS when the session starts, so it rings with the app in the
// background (Z109). Once the OS has it, the OS is the only one that rings it: a screen that also
// rang "now" could not tell whether the OS had rung a moment earlier. The screen rings only when
// the OS never got the alert. Everything here is about keeping those two cases apart, and about
// leaving nothing with the OS once the session has stopped.
import type { ReminderResult } from "./reminders";

/** How many times one end time is offered to the OS before giving up on it. */
export const FOCUS_END_ARM_LIMIT = 3;
/** Closer to the end than this, another try is not worth it. */
export const FOCUS_END_RETRY_MARGIN_MS = 5000;

export interface FocusEndAlertDeps {
  schedule: (ownerId: string, at: Date) => Promise<ReminderResult>;
  /** Resolves true when the OS confirmed that no end alert is left for the account. */
  cancel: (ownerId: string) => Promise<boolean>;
  now: () => number;
}

export interface FocusEndAlert {
  /** Hand the alert to the OS for `endAt`, replacing what was armed (start, resume, a changed device clock). */
  arm(endAt: number): void;
  /** For every tick: offer the same end time again after an arm that failed, a bounded number of times. */
  retry(): void;
  /** The session reached its end. true = the OS has the alert and the screen stays silent. */
  finish(): Promise<boolean>;
  /** The session stopped before its end. false = the OS did not confirm the withdrawal. */
  withdraw(): Promise<boolean>;
}

export function createFocusEndAlert(ownerId: string, deps: FocusEndAlertDeps): FocusEndAlert {
  // "off" = the OS will not take it at all (no permission, no native module): retrying changes nothing.
  let state: "none" | "arming" | "armed" | "failed" | "off" = "none";
  let closed = false;
  let attempts = 0;
  let endAt = 0;
  let latest = 0;
  let inFlight: Promise<void> = Promise.resolve();

  const offer = (end: number) => {
    endAt = end;
    attempts += 1;
    state = "arming";
    const mine = (latest += 1);
    inFlight = deps.schedule(ownerId, new Date(end)).then((result) => result, () => "error" as const).then((result) => {
      // A newer offer decides; this one was for an end time that no longer holds.
      if (mine !== latest) return;
      state = result === "scheduled" ? "armed" : result === "error" ? "failed" : "off";
    });
  };

  return {
    arm(end) {
      if (closed) return;
      attempts = 0;
      offer(end);
    },
    retry() {
      if (closed || state !== "failed" || attempts >= FOCUS_END_ARM_LIMIT) return;
      if (endAt - deps.now() <= FOCUS_END_RETRY_MARGIN_MS) return;
      offer(endAt);
    },
    async finish() {
      closed = true;
      await inFlight;
      return state === "armed";
    },
    async withdraw() {
      closed = true;
      // An offer still on its way would land after the cancel and stay behind.
      await inFlight;
      return deps.cancel(ownerId).then((confirmed) => confirmed, () => false);
    },
  };
}
