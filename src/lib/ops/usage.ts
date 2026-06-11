// Daily ops-recommendation allowance (O-R3 P1). Device-local v1: the counter
// lives in localStorage/AsyncStorage (same runtime split as capture/draft.ts),
// keyed by user + KST day so it resets at the same midnight as every other
// limit. Real cost is bounded server-side by the gemini-proxy per-tier daily
// caps (cycle 9); a server ops_usage table is the P3 follow-up if abuse shows.

import type { SubscriptionTier } from "@/lib/progression/entitlements";

import { kstDayKey } from "../journal/streak";

export const OPS_DAILY_LIMIT: Record<SubscriptionTier, number> = {
  free: 3,
  soma: 10,
  cortex: 20,
  brain: 50,
};

const KEY_PREFIX = "ops.recs.v1.";

interface StoredUsage {
  day: string;
  count: number;
}

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function todayKey(now: Date): string {
  return kstDayKey(now.toISOString());
}

function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native: fall through
  }
  return null;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeStorage(): AsyncStorageLike | null {
  if (!isReactNativeRuntime()) return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function parse(rawValue: string | null, today: string): number {
  if (!rawValue) return 0;
  try {
    const stored = JSON.parse(rawValue) as Partial<StoredUsage>;
    if (stored.day !== today || typeof stored.count !== "number" || stored.count < 0) return 0;
    return Math.floor(stored.count);
  } catch {
    return 0;
  }
}

export async function readOpsUsage(userId: string, now: Date = new Date()): Promise<number> {
  const today = todayKey(now);
  const web = ls();
  if (web) return parse(web.getItem(storageKey(userId)), today);
  const native = nativeStorage();
  if (!native) return 0;
  try {
    return parse(await native.getItem(storageKey(userId)), today);
  } catch {
    return 0;
  }
}

/** Increments today's counter and returns the new count. Best-effort persist. */
export async function bumpOpsUsage(userId: string, now: Date = new Date()): Promise<number> {
  const today = todayKey(now);
  const next = (await readOpsUsage(userId, now)) + 1;
  const payload = JSON.stringify({ day: today, count: next } satisfies StoredUsage);
  const web = ls();
  if (web) {
    try {
      web.setItem(storageKey(userId), payload);
    } catch {
      // quota/private mode: allowance degrades to per-session
    }
    return next;
  }
  const native = nativeStorage();
  if (native) {
    try {
      await native.setItem(storageKey(userId), payload);
    } catch {
      // best-effort
    }
  }
  return next;
}
