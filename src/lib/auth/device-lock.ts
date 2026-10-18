// Device authentication protects a visible session; it does not sign out or
// alter Supabase credentials. No record text, biometric data, or disk storage.
export const DEVICE_LOCK_AWAY_MS = 60_000;
export type DeviceLockError = "cancelled" | "unavailable" | "not_enrolled" | "failed";
export type DeviceAuthResult = { success: true } | { success: false; error: DeviceLockError };
export interface DeviceLockSnapshot {
  readonly covered: boolean;
  readonly needsAuthentication: boolean;
  readonly pending: boolean;
  readonly error: DeviceLockError | null;
}

export function createDeviceLock(options: {
  now: () => number;
  active: boolean;
  authenticate: () => Promise<DeviceAuthResult>;
  cancel: () => void;
  scope?: () => number | null;
  /**
   * Asked only after the OS reports not_enrolled. Only an explicit false (the phone
   * has no screen lock) opens the gate (Q-261018-47); true, null or a throw keeps
   * the not_enrolled cover.
   */
  screenLock?: () => Promise<boolean | null>;
}) {
  let appActive = options.active;
  let authorized = false;
  let awaySince: number | null = options.active ? null : options.now();
  let authenticatedAt: number | null = null;
  let generation = 0;
  let pending = false;
  let error: DeviceLockError | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const foreground = () => appActive;
  let snapshot: DeviceLockSnapshot = { covered: true, needsAuthentication: true, pending, error };
  function emit() {
    snapshot = { covered: !authorized || !foreground(), needsAuthentication: !authorized, pending, error };
    for (const listener of listeners) listener();
  }
  function changeVisibility(change: () => void) {
    if (disposed) return;
    const wasForeground = foreground();
    change();
    const now = options.now();
    if (wasForeground && !foreground()) awaySince = now;
    if (!wasForeground && foreground()) {
      // A fresh OS authentication can complete while its own PIN activity is
      // in front. Its successful result starts a new grace interval. A result
      // received long before this return cannot unlock the app indefinitely.
      const since = Math.max(awaySince ?? now, authenticatedAt ?? -Infinity);
      if (!Number.isFinite(now) || now < since || now - since >= DEVICE_LOCK_AWAY_MS) authorized = false;
      awaySince = null;
    }
    emit();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setActive(active: boolean) { changeVisibility(() => { appActive = active; }); },
    reset() {
      if (disposed) return;
      generation += 1;
      authorized = false;
      authenticatedAt = null;
      error = null;
      // Keep the single-flight hold until the old native promise settles.
      if (pending) options.cancel();
      emit();
    },
    async unlock() {
      if (disposed || pending || authorized || !foreground()) return;
      const scope = options.scope?.();
      if (scope === null) return;
      const attempt = ++generation;
      pending = true;
      error = null;
      emit();
      let result: DeviceAuthResult;
      try { result = await options.authenticate(); }
      catch { result = { success: false, error: "failed" }; }
      if (!result.success && result.error === "not_enrolled" && options.screenLock && attempt === generation) {
        let hasScreenLock: boolean | null = null;
        try { hasScreenLock = await options.screenLock(); }
        catch { hasScreenLock = null; }
        if (hasScreenLock === false) result = { success: true };
      }
      pending = false;
      if (disposed) return;
      if (attempt === generation && scope === options.scope?.()) {
        if (result.success) {
          const now = options.now();
          authorized = Number.isFinite(now);
          authenticatedAt = now;
          error = authorized ? null : "failed";
        } else {
          authorized = false;
          error = result.error;
        }
      }
      emit();
    },
    dispose() {
      disposed = true;
      generation += 1;
      authorized = false;
      snapshot = { covered: true, needsAuthentication: true, pending: false, error: null };
      if (pending) options.cancel();
      listeners.clear();
    },
  };
}
