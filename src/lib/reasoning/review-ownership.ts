// Who a late result on the reasoning review screen belongs to.
//
// The screen can change hands while something is still being read: the run is
// cancelled, a newer run starts, or another account is painted. Everything that
// finishes later asks here before it writes or releases anything, so an old run
// can never touch a newer run's slot or another account's screen.
//
// Plain state, no React: the screen holds one of these for its lifetime and
// tells it about an account change in the commit that paints the account.

export interface ReviewOwnership {
  /** Another account is being painted. True when the account actually changed. */
  showAccount(account: string | null): boolean;
  /** Is this the account on screen now? */
  shows(account: string | null): boolean;
  /** A new run takes the slot. */
  begin(controller: AbortController): void;
  /** The global task this run started (lib/tasks/store id; 0 when none). */
  bindTask(controller: AbortController, taskId: number): void;
  /** That task's id, or 0. */
  taskOf(controller: AbortController): number;
  /** Does this run still hold the slot, uncancelled, for the account it was started for? */
  owns(controller: AbortController, account: string | null): boolean;
  /** Give the slot back, only if it is still this run's. True when it was. */
  release(controller: AbortController): boolean;
  /** Cancel whatever holds the slot and free it. Hands back the run it cancelled. */
  cancel(): AbortController | null;
  /** A run holds the slot. */
  readonly running: boolean;
  /**
   * Goes up whenever the screen changes hands: a run begins, a run is
   * cancelled, another account is shown. Something that waits compares the
   * number from before with the number after. `running` cannot do that job:
   * "no run since" and "a run began and already ended" both read false.
   */
  readonly epoch: number;
}

export function createReviewOwnership(initialAccount: string | null): ReviewOwnership {
  let account = initialAccount;
  let slot: AbortController | null = null;
  let epoch = 0;
  const tasks = new WeakMap<AbortController, number>();
  return {
    showAccount(next) {
      if (next === account) return false;
      account = next;
      epoch += 1;
      return true;
    },
    shows(candidate) {
      return candidate === account;
    },
    begin(controller) {
      slot = controller;
      epoch += 1;
    },
    bindTask(controller, taskId) {
      tasks.set(controller, taskId);
    },
    taskOf(controller) {
      return tasks.get(controller) ?? 0;
    },
    owns(controller, forAccount) {
      return slot === controller && !controller.signal.aborted && forAccount === account;
    },
    release(controller) {
      if (slot !== controller) return false;
      slot = null;
      return true;
    },
    cancel() {
      const cancelled = slot;
      if (cancelled === null) return null;
      cancelled.abort();
      slot = null;
      epoch += 1;
      return cancelled;
    },
    get running() {
      return slot !== null;
    },
    get epoch() {
      return epoch;
    },
  };
}

export type RunFailureKind = "limit" | "safety" | "cancelled" | "generic";
/** A failure kept for the account until its screen opens again. A cancel is never kept. */
export type DeferredRunError = Exclude<RunFailureKind, "cancelled">;

export type RunFailureAction =
  | { act: "nothing" }
  | { act: "defer"; error: DeferredRunError | null }
  | { act: "show"; error: RunFailureKind };

// What a failed run may do.
// - It no longer held the slot (cancelled, or a newer run took it): nothing at all.
//   Whoever took the slot owns the screen and the global task.
// - It held the slot but its screen is gone or shows another account: keep the
//   failure for its own account, touch no screen.
// - Otherwise it is this screen's failure and is shown.
export function runFailureAction(input: {
  ownedSlot: boolean;
  onScreen: boolean;
  kind: RunFailureKind;
}): RunFailureAction {
  if (!input.ownedSlot) return { act: "nothing" };
  if (!input.onScreen) return { act: "defer", error: input.kind === "cancelled" ? null : input.kind };
  return { act: "show", error: input.kind };
}
