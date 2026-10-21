/** T39 A1-T: dormant until B2 explicitly starts a deadline. No production callers.
 * Expiry ends the screen's wait only; it never cancels the underlying request.
 */
export const FOREGROUND_DEADLINE_MS = Object.freeze({ reservation: 20_000, transport: 120_000 });
export const FOREGROUND_RESUME_GRACE_MS = 15_000;

export interface ForegroundSource {
  isActive(): boolean;
  subscribe(onChange: () => void): () => void;
}

export interface ForegroundDeadlineClock {
  /** Monotonic milliseconds. */
  now(): number;
  /** Enqueue (never invoke inline); return a cancellation function. */
  schedule(callback: () => void, delayMs: number): () => void;
}

interface NativeAppState {
  readonly currentState: string | null;
  addEventListener(event: "change", listener: () => void): { remove(): void };
}

interface VisibilityDocument {
  readonly visibilityState: string;
  addEventListener(event: "visibilitychange", listener: () => void): void;
  removeEventListener(event: "visibilitychange", listener: () => void): void;
}

/** Pass React Native's AppState at the B2 call site; unknown is not active. */
export function createNativeForegroundSource(appState: NativeAppState): ForegroundSource {
  return {
    isActive: () => appState.currentState === "active",
    subscribe: onChange => {
      const subscription = appState.addEventListener("change", onChange);
      return () => subscription.remove();
    },
  };
}

/** Pass document on web. Hidden/prerender/unknown states do not spend time. */
export function createWebForegroundSource(document: VisibilityDocument): ForegroundSource {
  return {
    isActive: () => document.visibilityState === "visible",
    subscribe: onChange => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
  };
}

const systemClock: ForegroundDeadlineClock = {
  now: () => performance.now(),
  schedule: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export interface ForegroundDeadlineOptions {
  kind: keyof typeof FOREGROUND_DEADLINE_MS;
  foreground: ForegroundSource;
  clock?: ForegroundDeadlineClock;
  /** Screen-wait signal only. Keep observing late request outcomes separately. */
  onExpire(): void;
}

export interface ForegroundDeadline {
  /** Call on response/rejection or owner disposal, not after parsing/audit awaits. */
  stop(): void;
}

export function startForegroundDeadline(options: ForegroundDeadlineOptions): ForegroundDeadline {
  const { foreground, onExpire, clock = systemClock } = options;
  let remainingMs: number = FOREGROUND_DEADLINE_MS[options.kind];
  let activeSince: number | null = null;
  let generation = 0;
  let stopped = false;
  let subscribed = false;
  let cancelTimer = () => {};
  let unsubscribe = () => {};

  function invalidateTimer() {
    generation += 1;
    cancelTimer();
    cancelTimer = () => {};
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    invalidateTimer();
    unsubscribe();
  }

  function pause() {
    if (activeSince === null) return;
    remainingMs = Math.max(0, remainingMs - (clock.now() - activeSince));
    activeSince = null;
    invalidateTimer();
  }

  function arm() {
    invalidateTimer();
    const scheduledGeneration = generation;
    cancelTimer = clock.schedule(() => {
      if (stopped || scheduledGeneration !== generation) return;
      const active = foreground.isActive();
      // Reading the source can deliver a queued lifecycle transition. Recheck.
      if (stopped || scheduledGeneration !== generation) return;
      if (!active) { pause(); return; }
      if (activeSince === null) return;
      const now = clock.now();
      remainingMs = Math.max(0, remainingMs - (now - activeSince));
      activeSince = now;
      if (remainingMs > 0) { arm(); return; }
      stop();
      onExpire();
    }, remainingMs);
  }

  function updateActivity() {
    if (stopped || !subscribed) return;
    const active = foreground.isActive();
    if (stopped) return;
    if (!active) { pause(); return; }
    if (activeSince !== null) return;
    remainingMs = Math.max(remainingMs, FOREGROUND_RESUME_GRACE_MS);
    activeSince = clock.now();
    arm();
  }

  // Install first, then re-read currentState/visibilityState to close the setup gap.
  try {
    unsubscribe = foreground.subscribe(updateActivity);
    subscribed = true;
    updateActivity();
  } catch (error) {
    stop();
    throw error;
  }
  return { stop };
}

/** Observe the raw reservation/transport promise, not the whole conversation.
 * The returned promise still settles with the original result/error, even late.
 * Call its stop() on owner disposal; this only stops the screen deadline.
 * Failed deadline setup also leaves the original outcome observable.
 * In B2, attach 422 interpretation, consent/crisis handling and audit AFTER this
 * observer: receiving any response stops the clock before those awaits begin.
 * A permanently unknown foreground state cannot guarantee a finite screen wait.
 */
export function observeForegroundDeadline<T>(
  response: Promise<T>, options: ForegroundDeadlineOptions,
): Promise<T> & ForegroundDeadline {
  let deadline: ForegroundDeadline | undefined;
  const stop = () => { deadline?.stop(); };
  // Observe first: an unavailable lifecycle source must not lose a late rejection.
  const observed = response.then(
    value => { stop(); return value; },
    error => { stop(); throw error; },
  );
  try {
    deadline = startForegroundDeadline(options);
  } catch {
    // startForegroundDeadline cleans up partial setup. Only the timer is lost.
  }
  return Object.assign(observed, { stop });
}
