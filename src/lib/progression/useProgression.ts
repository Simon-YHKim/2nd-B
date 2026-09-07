// React hook exposing the signed-in user's quest progression: total XP, level,
// progress breakdown, and subscription tier. Reads users.total_xp +
// users.subscription_tier (added in migrations 0019 / 0020).

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { createLatestWins } from "../async/latest-wins";
import { getEnv } from "../env";
import { getSupabaseClient } from "../supabase/client";
import { levelForXp, levelProgress, type LevelProgress } from "./levels";
import { resolveTier, type SubscriptionTier } from "./entitlements";
import { getUrlTierOverride } from "./dev-tier-url";

export interface Progression {
  totalXp: number;
  level: number;
  progress: LevelProgress;
  tier: SubscriptionTier;
  /**
   * C6 judge comp (Phase 4): server-side the cap RPCs already treat judges as
   * 'brain' (0088); this mirrors the flag so client-side gates (personas) comp
   * too. False while loading or on read failure — the server stays authoritative.
   */
  judge: boolean;
  loading: boolean;
  /** Opt-in read verdict for surfaces that must not present a failed DB read
   *  as the free tier. Optional keeps existing typed consumers compatible. */
  error?: boolean;
  /** Owner whose DB snapshot is currently published. Optional for backwards
   *  compatibility; owner-sensitive screens can reject mismatched snapshots. */
  ownerId?: string | null;
  refresh: () => Promise<void>;
}

export interface ProgressionSnapshot {
  ownerId: string | null;
  totalXp: number;
  tier: SubscriptionTier;
  judge: boolean;
  loading: boolean;
  error: boolean;
}

export interface ProgressionRequest {
  ownerId: string | null;
  token: number;
}

export interface OwnerActionRequest {
  ownerId: string;
  token: number;
}

/**
 * Synchronous, owner-scoped double-submit guard for explicit user actions.
 * Changing owner discards A's lock immediately, while A's eventual `release`
 * cannot unlock or clear B's newer action.
 */
export function createOwnerActionGate() {
  let sequence = 0;
  let active: OwnerActionRequest | null = null;
  return {
    acquire(ownerId: string): OwnerActionRequest | null {
      if (active?.ownerId === ownerId) return null;
      active = { ownerId, token: ++sequence };
      return active;
    },
    discardOtherOwner(ownerId: string | null): void {
      if (active?.ownerId !== ownerId) active = null;
    },
    isLocked(ownerId: string | null): boolean {
      return active?.ownerId === ownerId;
    },
    release(request: OwnerActionRequest): boolean {
      if (active?.ownerId !== request.ownerId || active.token !== request.token) return false;
      active = null;
      return true;
    },
  };
}

export type AsyncReadSettlement<T> =
  | { status: "ready"; value: T }
  | { status: "error" }
  | { status: "timeout" };

/**
 * Settle a UI read without leaking a late rejection. Both fulfillment and
 * rejection handlers are installed before the timer starts winning races, so
 * a promise that rejects after timeout is still consumed rather than becoming
 * an unhandled rejection.
 */
export function settleAsyncRead<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<AsyncReadSettlement<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: AsyncReadSettlement<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
    void promise.then(
      (value) => finish({ status: "ready", value }),
      () => finish({ status: "error" }),
    );
  });
}

/** Purchased/promo credits never count toward this ad-earned monthly cap. */
export function rewardCapAllowsWatch(rewardEarned: number, monthlyCap: number): boolean {
  return (
    Number.isFinite(rewardEarned) &&
    Number.isFinite(monthlyCap) &&
    rewardEarned >= 0 &&
    monthlyCap > 0 &&
    rewardEarned < monthlyCap
  );
}

/**
 * Request token plus owner identity. A later refresh or owner transition
 * invalidates every older response, even when the older promise resolves last.
 */
export function createProgressionOwnerGate() {
  const latest = createLatestWins();
  return {
    begin(ownerId: string | null): ProgressionRequest {
      return { ownerId, token: latest.begin() };
    },
    isStale(request: ProgressionRequest, activeOwnerId: string | null): boolean {
      return request.ownerId !== activeOwnerId || latest.isStale(request.token);
    },
  };
}

function emptySnapshot(ownerId: string | null): ProgressionSnapshot {
  return {
    ownerId,
    totalXp: 0,
    tier: "free",
    judge: false,
    loading: ownerId !== null,
    error: false,
  };
}

/**
 * Render projection used before the owner-change effect gets a chance to run.
 * It prevents even one paint of owner A's tier after AuthContext publishes B
 * (or signed-out), while the new DB read is still being scheduled.
 */
export function progressionSnapshotForOwner(
  snapshot: ProgressionSnapshot,
  activeOwnerId: string | null,
): ProgressionSnapshot {
  return snapshot.ownerId === activeOwnerId ? snapshot : emptySnapshot(activeOwnerId);
}

export function useProgression(): Progression {
  const { userId } = useAuth();
  const [snapshot, setSnapshot] = useState<ProgressionSnapshot>({
    ...emptySnapshot(null),
    loading: true,
  });
  // refresh() is exposed so screens re-pull after a stage completes; two calls (or a
  // userId A->B switch) can overlap, and the slower/older response must not overwrite
  // the newer one, regressing XP/tier. Latest-wins guard drops superseded results.
  const guardRef = useRef(createProgressionOwnerGate());
  // Render-time assignment is intentional: an auth owner change invalidates an
  // older request before the next effect has a chance to begin B's request.
  const ownerRef = useRef(userId);
  ownerRef.current = userId;

  const refresh = useCallback(async () => {
    const request = guardRef.current.begin(userId);
    setSnapshot((previous) =>
      previous.ownerId === userId
        ? { ...previous, loading: userId !== null, error: false }
        : emptySnapshot(userId),
    );
    if (!userId) {
      setSnapshot(emptySnapshot(null));
      return;
    }
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("users")
        .select("total_xp, subscription_tier, judge_mode, subscription_expires_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (guardRef.current.isStale(request, ownerRef.current)) return;
      // F10: collapse an EXPIRED subscription to free client-side, mirroring the
      // server's effective_subscription_tier (0088). The cancel webhook can lag, so
      // the raw subscription_tier column may still read 'cortex'/'brain' after
      // expiry; without this the client keeps unlocking paid personas (메타비/트위비)
      // during the lapse window while the server caps have already dropped to free.
      // judge_mode stays authoritative + is comped downstream (secondb.tsx), so no
      // special-case here -- a judge's expires_at is null so lapsed is false anyway.
      const rawTier = (data?.subscription_tier as SubscriptionTier) ?? "free";
      const expiresAt = data?.subscription_expires_at as string | null | undefined;
      const lapsed = expiresAt != null && Date.parse(expiresAt) < Date.now();
      setSnapshot({
        ownerId: userId,
        totalXp: data?.total_xp ?? 0,
        tier: lapsed ? "free" : rawTier,
        judge: data?.judge_mode === true,
        loading: false,
        error: false,
      });
    } catch {
      if (guardRef.current.isStale(request, ownerRef.current)) return;
      if (typeof console !== "undefined") console.warn("[progression] load failed");
      setSnapshot({ ...emptySnapshot(userId), loading: false, error: true });
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Test/QA paywall override (EXPO_PUBLIC_FORCE_TIER). When not "off", every
  // user is treated as this tier, so all subscription gating that keys off
  // `progression.tier` (journal/note caps, chat daily cap, premium features)
  // is bypassed. Defaults to "brain" (everything unlocked) for the current
  // testing phase; set EXPO_PUBLIC_FORCE_TIER=off to restore real per-user
  // billing. This is the single chokepoint — no gate call-site needs editing.
  const forcedTier = getEnv().EXPO_PUBLIC_FORCE_TIER;
  // QA: a `?tier=` web URL param (when EXPO_PUBLIC_ALLOW_DEV_TIER=true) takes
  // precedence over the env FORCE_TIER, so one deployment yields per-tier links.
  const urlOverride = getUrlTierOverride();
  const override = urlOverride !== "off" ? urlOverride : forcedTier;
  const owned = progressionSnapshotForOwner(snapshot, userId);

  return {
    totalXp: owned.totalXp,
    level: levelForXp(owned.totalXp),
    progress: levelProgress(owned.totalXp),
    tier: resolveTier(override, owned.tier),
    judge: owned.judge,
    loading: owned.loading,
    error: owned.error,
    ownerId: owned.ownerId,
    refresh,
  };
}
