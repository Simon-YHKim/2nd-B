// The guide belongs to the signed-in owner. A local completion only applies to
// that owner; existing records on another device also mean this is not a first
// record. Manual replay is a separate, explicit override of the data check.
import { useEffect, useState } from "react";

import { withTimeout } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";

const KEY_PREFIX = "onboarding.coachmarks.home.v2";
export const COACHMARKS_SEEN_KEY = (ownerId: string) => `${KEY_PREFIX}.${ownerId}.seenAt`;
export const COACHMARKS_REPLAY_KEY = (ownerId: string) => `${KEY_PREFIX}.${ownerId}.replayAt`;

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type Flags = { seen: boolean; replay: boolean };
const memoryFlags = new Map<string, Flags>();
const versions = new Map<string, number>();
const listeners = new Set<(ownerId: string, due: boolean) => void>();
const nativeWrites = new Map<string, Promise<void>>();

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function nativeStorage(): AsyncStorageLike | null {
  if ((globalThis.navigator as { product?: string } | undefined)?.product !== "ReactNative") return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function warn(operation: string, error: unknown): void {
  if (typeof console !== "undefined") console.warn(`[coachmarks-gate] ${operation} failed`, error);
}

function publishCoachmarksDue(ownerId: string, due: boolean): void {
  versions.set(ownerId, (versions.get(ownerId) ?? 0) + 1);
  for (const listener of listeners) listener(ownerId, due);
}

function persistNative(ownerId: string, operation: string, write: (storage: AsyncStorageLike) => Promise<void>): void {
  const storage = nativeStorage();
  if (!storage) return;
  // A replay followed quickly by Save must not finish its async setItem after
  // Save's removeItem and resurrect the replay on the next app launch.
  const pending = (nativeWrites.get(ownerId) ?? Promise.resolve())
    .then(() => write(storage))
    .catch((error) => warn(operation, error));
  nativeWrites.set(ownerId, pending);
  void pending.then(() => {
    if (nativeWrites.get(ownerId) === pending) nativeWrites.delete(ownerId);
  });
}

/** Completion and replay are deliberately owner-scoped. The old v1 key cannot
 * safely be assigned to an owner after an account switch, so it is not read. */
export function markCoachmarksSeen(ownerId: string): void {
  if (!ownerId) return;
  memoryFlags.set(ownerId, { seen: true, replay: false });
  publishCoachmarksDue(ownerId, false);
  const at = new Date().toISOString();
  try {
    ls()?.setItem(COACHMARKS_SEEN_KEY(ownerId), at);
    ls()?.removeItem(COACHMARKS_REPLAY_KEY(ownerId));
  } catch (error) {
    warn("persist", error);
  }
  persistNative(ownerId, "persist", (storage) => Promise.all([
    storage.setItem(COACHMARKS_SEEN_KEY(ownerId), at),
    storage.removeItem(COACHMARKS_REPLAY_KEY(ownerId)),
  ]).then(() => undefined));
}

/** Replay is an explicit request, including when the owner already has data. */
export function resetCoachmarks(ownerId: string): void {
  if (!ownerId) return;
  memoryFlags.set(ownerId, { seen: false, replay: true });
  publishCoachmarksDue(ownerId, true);
  const at = new Date().toISOString();
  try {
    ls()?.setItem(COACHMARKS_REPLAY_KEY(ownerId), at);
  } catch (error) {
    warn("replay", error);
  }
  persistNative(ownerId, "replay", (storage) => storage.setItem(COACHMARKS_REPLAY_KEY(ownerId), at));
}

async function readFlags(ownerId: string): Promise<Flags> {
  const memory = memoryFlags.get(ownerId);
  if (memory) return memory;
  const local = ls();
  if (local) return {
    seen: !!local.getItem(COACHMARKS_SEEN_KEY(ownerId)),
    replay: !!local.getItem(COACHMARKS_REPLAY_KEY(ownerId)),
  };
  const storage = nativeStorage();
  if (!storage) return { seen: false, replay: false };
  const [seen, replay] = await Promise.all([
    storage.getItem(COACHMARKS_SEEN_KEY(ownerId)),
    storage.getItem(COACHMARKS_REPLAY_KEY(ownerId)),
  ]);
  return { seen: !!seen, replay: !!replay };
}

/** Reads at most one ID per table, never the record/source body. Errors remain
 * unknown instead of being mistaken for an empty account. */
export async function hasCoachmarkContent(ownerId: string): Promise<boolean> {
  if (!ownerId) throw new Error("Coachmarks require an owner");
  const client = getSupabaseClient();
  const rows = await withTimeout(Promise.all(
    (["records", "sources"] as const).map(async (table) => {
      const { data, error } = await client.from(table).select("id").eq("user_id", ownerId).limit(1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error(`Coachmarks ${table} response unavailable`);
      return data.length > 0;
    }),
  ), 10_000, "Coachmarks content");
  return rows.some(Boolean);
}

/** null means the owner/storage/data check is pending or failed. */
export function useCoachmarksGate(ownerId: string | null, ready: boolean, retryTick = 0): boolean | null {
  const [decision, setDecision] = useState<{ ownerId: string; due: boolean | null } | null>(null);

  useEffect(() => {
    if (!ready || !ownerId) return;
    let cancelled = false;
    const version = versions.get(ownerId) ?? 0;
    const listener = (changedOwnerId: string, due: boolean) => {
      if (changedOwnerId === ownerId) setDecision({ ownerId, due });
    };
    listeners.add(listener);
    setDecision({ ownerId, due: null });
    void (async () => {
      try {
        const flags = await readFlags(ownerId);
        if (cancelled || version !== (versions.get(ownerId) ?? 0)) return;
        if (flags.replay || flags.seen) {
          setDecision({ ownerId, due: flags.replay });
          return;
        }
        const exists = await hasCoachmarkContent(ownerId);
        if (cancelled || version !== (versions.get(ownerId) ?? 0)) return;
        setDecision({ ownerId, due: !exists });
      } catch (error) {
        if (cancelled || version !== (versions.get(ownerId) ?? 0)) return;
        warn("read", error);
        setDecision({ ownerId, due: null });
      }
    })();
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [ownerId, ready, retryTick]);

  return ready && ownerId && decision?.ownerId === ownerId ? decision.due : null;
}

export function __resetCoachmarksGateForTests(): void {
  memoryFlags.clear();
  versions.clear();
  listeners.clear();
  nativeWrites.clear();
}
