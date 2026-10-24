import { useCallback, useEffect, useRef, useState } from "react";
import { isTimeoutError, TimeoutError, withTimeout } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";
import { loadLatestStrengths, loadSelfPortraitSignals } from "./build";
import { loadRoleCardsStrict, type RoleCard } from "./role-cards";
import { loadPolarisQuotaStrict } from "./polaris-quota";
import { loadSevenLevelsStrict } from "./load-seven-levels-strict";

export const CORE_ROLE_READ_TIMEOUT_MS = 10_000;
type Attempt = { active: boolean; cancel: () => void };
type State<T> = { scope: object; attempt: Attempt; status: "loading" | "error" | "timeout"; data: null }
  | { scope: object; attempt: Attempt; status: "ready"; data: T };

/** Private to the Core slots; retries never reload evidence or each other. */
function useOwnedSlot<T>(owner: string | null, scope: object | null, isCurrent: () => boolean,
  invalidateAuto: () => void, load: (userId: string, assertCurrent: () => void) => Promise<T>) {
  const key = useRef(scope); key.current = scope;
  const attemptRef = useRef<Attempt | null>(null);
  const [state, setState] = useState<State<T> | null>(null);
  const current = useCallback(() => !!scope && key.current === scope && isCurrent(), [scope, isCurrent]);
  const cancel = useCallback(() => { attemptRef.current?.cancel(); attemptRef.current = null; }, []);
  const start = useCallback(() => {
    if (!scope || !owner || !current()) return;
    cancel();
    let rejectCancellation!: () => void;
    const cancelled = new Promise<never>((_, reject) => { rejectCancellation = () => reject(new Error("Core role read no longer owned")); });
    const attempt: Attempt = { active: true, cancel: () => { attempt.active = false; rejectCancellation(); } };
    attemptRef.current = attempt;
    const owns = () => current() && attemptRef.current === attempt && attempt.active;
    const deadline = Date.now() + CORE_ROLE_READ_TIMEOUT_MS;
    let finished = false;
    const requireCurrent = () => {
      if (!owns() || finished) throw new Error("Core read no longer owned");
      if (Date.now() >= deadline) throw new TimeoutError(CORE_ROLE_READ_TIMEOUT_MS, "Core companion read");
    };
    setState({ scope, attempt, status: "loading", data: null });
    const work = Promise.resolve().then(() => {
      requireCurrent();
      return load(owner, requireCurrent);
    });
    void withTimeout(Promise.race([work, cancelled]), CORE_ROLE_READ_TIMEOUT_MS, "Core role status")
      .then((data) => { requireCurrent(); setState({ scope, attempt, status: "ready", data }); })
      .catch((error: unknown) => {
        if (owns()) setState({ scope, attempt, status: isTimeoutError(error) ? "timeout" : "error", data: null });
      }).finally(() => { finished = true; });
  }, [scope, owner, current, cancel, load]);
  useEffect(() => { start(); return cancel; }, [start, cancel]);
  const publish = useCallback((data: T) => {
    if (!scope || !current()) return;
    cancel();
    const attempt: Attempt = { active: true, cancel: () => { attempt.active = false; } };
    attemptRef.current = attempt; setState({ scope, attempt, status: "ready", data });
  }, [scope, current, cancel]);
  const visible = state?.scope === scope && current() ? state : null;
  const retry = () => {
    if (!visible || !current() || attemptRef.current !== visible.attempt ||
        (visible.status !== "error" && visible.status !== "timeout")) return;
    invalidateAuto(); // Synchronous: an already pending QA claim cannot stamp storage.
    start();
  };
  return { status: visible?.status ?? "loading", data: visible?.data ?? null, retry, start, cancel, publish };
}

const loadCoreStrengths = (owner: string) => loadLatestStrengths(getSupabaseClient(), owner);

/** Brightness is unknown until all five strict inputs belong to this attempt. */
export function useCoreBrightnessRead(owner: string | null, scope: object | null,
  isCurrent: () => boolean, invalidateAuto: () => void) {
  return useOwnedSlot(owner, scope, isCurrent, invalidateAuto, loadSevenLevelsStrict);
}

/** Optional measured panels share ownership, but never another slot's result. */
export function useCoreCompanionReads(owner: string | null, scope: object | null,
  isCurrent: () => boolean, invalidateAuto: () => void) {
  const portrait = useOwnedSlot(owner, scope, isCurrent, invalidateAuto, loadSelfPortraitSignals);
  const strengths = useOwnedSlot(owner, scope, isCurrent, invalidateAuto, loadCoreStrengths);
  return { portrait, strengths };
}

export function useCoreRoleReads(owner: string | null, scope: object | null,
  isCurrent: () => boolean, invalidateAuto: () => void) {
  const roles = useOwnedSlot(owner, scope, isCurrent, invalidateAuto, loadRoleCardsStrict);
  const quota = useOwnedSlot(owner, scope, isCurrent, invalidateAuto, loadPolarisQuotaStrict);
  const key = useRef(scope); key.current = scope;
  const mutation = useRef<object | null>(null);
  useEffect(() => () => { mutation.current = null; }, [scope]);
  const beginMutation = useCallback((changesQuota: boolean) => {
    if (!scope || key.current !== scope || !isCurrent()) return null;
    const token = {}; mutation.current = token;
    // A SELECT already in flight must not overwrite an explicit mutation result.
    roles.cancel(); if (changesQuota) quota.cancel();
    const current = () => mutation.current === token && key.current === scope && isCurrent();
    return {
      isCurrent: current,
      publish: (cards: RoleCard[]) => { if (current()) roles.publish(cards); },
      finish: (succeeded: boolean) => {
        if (!current()) return;
        if (!succeeded) roles.start();
        if (changesQuota) quota.start();
        mutation.current = null;
      },
    };
  }, [scope, isCurrent, roles.cancel, roles.publish, roles.start, quota.cancel, quota.start]);
  return { roles, quota, beginMutation };
}
