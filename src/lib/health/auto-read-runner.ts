// When the automatic health read (auto-read.ts) runs, kept apart from the component
// (components/health/HealthAutoReadSync.tsx) so that every rule here is tested by behaviour,
// not by reading source text. Everything platform-specific is injected.
//
//   - Only in the foreground. Health Connect refuses reads from an app in the background
//     (this app does not hold READ_HEALTH_DATA_IN_BACKGROUND), and a read cut off halfway
//     must not count as the day's read. Leaving the foreground abandons the run; nothing
//     is marked, so the next foreground repeats it.
//   - One run at a time, each under its own account lease; an account switch that has not
//     finished yet starts nothing and stops a run in progress.
//   - A deadline. supabase-js and fetch never time out on their own, and a run that never
//     settles would otherwise block every later run until the process restarts.
//   - A timer at the next daily slot while the app stays open, like the dashboard's own
//     reread (DashboardPhone), so an app left open across 07:00 still reads at 07:00.

export interface AutoReadLease {
  readonly signal: AbortSignal;
  assertCurrent(): void;
  abort(): void;
  release(): void;
}

export interface AutoReadRunnerEnv {
  appState(): string;
  onAppStateChange(listener: (state: string) => void): () => void;
  transitionPending(): boolean;
  beginLease(ownerId: string, parent: AbortSignal): AutoReadLease;
  /** One automatic read. It calls assertCurrent after every await. */
  read(ownerId: string, assertCurrent: () => void): Promise<unknown>;
  /** When to look again while the app stays in the foreground; null when there is no need. */
  nextCheckAt(ownerId: string): Promise<Date | null>;
  now(): number;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  deadlineMs: number;
}

/** Starts watching; returns the stop function for the component's cleanup. */
export function startHealthAutoRead(ownerId: string, env: AutoReadRunnerEnv): () => void {
  const lifecycle = new AbortController();
  let current: AutoReadLease | null = null;
  let wake: unknown = null;

  const clearWake = (): void => {
    if (wake !== null) env.clearTimer(wake);
    wake = null;
  };

  const scheduleWake = (): void => {
    clearWake();
    void env.nextCheckAt(ownerId).then((at) => {
      if (!at || lifecycle.signal.aborted || current || env.appState() !== "active") return;
      clearWake();
      wake = env.setTimer(run, Math.max(1000, at.getTime() - env.now()));
    }, () => undefined);
  };

  function run(): void {
    clearWake();
    if (current || lifecycle.signal.aborted) return;
    if (env.appState() !== "active" || env.transitionPending()) return;
    const lease = env.beginLease(ownerId, lifecycle.signal);
    current = lease;
    const assertCurrent = (): void => {
      lease.assertCurrent();
      if (env.transitionPending()) {
        lease.abort();
        throw new Error("account_transition_pending");
      }
    };
    let finished = false;
    let deadline: unknown = null;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      env.clearTimer(deadline);
      lease.release();
      if (current === lease) current = null;
      if (!lifecycle.signal.aborted) scheduleWake();
    };
    // Settles on the first of: the read ends, the lease is aborted (background, owner
    // change, deadline). An abandoned read can still be awaiting; its next assertCurrent
    // throws, so it can never write the day's marks.
    if (lease.signal.aborted) {
      finish();
      return;
    }
    lease.signal.addEventListener("abort", finish, { once: true });
    deadline = env.setTimer(() => lease.abort(), env.deadlineMs);
    void env.read(ownerId, assertCurrent).then(finish, finish);
  }

  run();
  const unsubscribe = env.onAppStateChange((state) => {
    if (state === "active") {
      run();
      return;
    }
    clearWake();
    current?.abort();
  });
  return () => {
    lifecycle.abort();
    clearWake();
    unsubscribe();
  };
}
