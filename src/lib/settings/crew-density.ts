// Decorative-crew density preference (worldview v-final, "모모크루"). Controls
// how many ambient Narrative-crew sprites wander the graph. Persisted like the
// onboarding flags (web localStorage / native AsyncStorage / memory fallback).
//
// The crew RENDER is wired once the pixel assets land (the GPT art workstream
// owns the sprites). Until then <CrewLayer /> consumes `count` + `animated` and
// draws nothing — the count math, persistence, reduced-motion + LOD logic are
// real now, so dropping in the sprites later is a one-line swap.

import { useCallback, useEffect, useState } from "react";

import { prefersReducedMotion } from "@/lib/motion/signature";
import { useLiteMode } from "@/lib/settings/lite-mode";

export type CrewDensity = "none" | "few" | "some" | "many";
export const CREW_DENSITY_ORDER: readonly CrewDensity[] = ["none", "few", "some", "many"];
export const DEFAULT_CREW_DENSITY: CrewDensity = "some";
export const CREW_DENSITY_KEY = "graph.crewDensity.v1";

// Per-density node-proportional target + min/max clamps. The count scales with
// the number of on-graph nodes so a sparse graph isn't crowded and a dense one
// still feels lively — but never beyond the LOD ceiling (`hardCap`).
const DENSITY_RATIO: Record<CrewDensity, number> = { none: 0, few: 0.1, some: 0.25, many: 0.5 };
const DENSITY_MIN: Record<CrewDensity, number> = { none: 0, few: 1, some: 2, many: 3 };
const DENSITY_MAX: Record<CrewDensity, number> = { none: 0, few: 3, some: 6, many: 12 };

export interface CrewCountOpts {
  /** Hard ceiling regardless of density / node count (low-end LOD). */
  hardCap?: number;
  /** Low-end device: halve the target and tighten the default ceiling. */
  lowEnd?: boolean;
}

/** Pure: density preference + on-graph node count → crew sprite count. Tested. */
export function crewCountForDensity(
  density: CrewDensity,
  nodeCount: number,
  opts: CrewCountOpts = {},
): number {
  if (density === "none") return 0;
  const nodes = Math.max(0, Math.floor(Number.isFinite(nodeCount) ? nodeCount : 0));
  const raw = Math.round(nodes * DENSITY_RATIO[density]);
  let count = Math.min(DENSITY_MAX[density], Math.max(DENSITY_MIN[density], raw));
  if (opts.lowEnd) count = Math.floor(count / 2);
  const cap = opts.hardCap ?? (opts.lowEnd ? 4 : 12);
  return Math.max(0, Math.min(cap, count));
}

// ─── Persistence (mirrors src/lib/onboarding/state.ts) ──────────────────────
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryDensity: CrewDensity | null = null;

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

function parseDensity(v: string | null | undefined): CrewDensity | null {
  return v && (CREW_DENSITY_ORDER as readonly string[]).includes(v) ? (v as CrewDensity) : null;
}

export function setCrewDensity(d: CrewDensity): void {
  memoryDensity = d;
  ls()?.setItem(CREW_DENSITY_KEY, d);
  const storage = nativeStorage();
  if (storage) void storage.setItem(CREW_DENSITY_KEY, d).catch(() => undefined);
}

/** Persisted crew-density preference + setter. */
export function useCrewDensity(): { density: CrewDensity; setDensity: (d: CrewDensity) => void } {
  const [density, setDensityState] = useState<CrewDensity>(() => {
    const local = ls();
    if (local) return parseDensity(local.getItem(CREW_DENSITY_KEY)) ?? DEFAULT_CREW_DENSITY;
    if (memoryDensity) return memoryDensity;
    return DEFAULT_CREW_DENSITY;
  });

  useEffect(() => {
    // Web read happens synchronously above; only native needs async hydration.
    if (ls() || memoryDensity) return;
    const storage = nativeStorage();
    if (!storage) return;
    let cancelled = false;
    storage
      .getItem(CREW_DENSITY_KEY)
      .then((v) => {
        if (cancelled) return;
        const d = parseDensity(v);
        if (d) {
          memoryDensity = d;
          setDensityState(d);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const setDensity = useCallback((d: CrewDensity) => {
    setDensityState(d);
    setCrewDensity(d);
  }, []);

  return { density, setDensity };
}

/** Derived crew render contract: count (density + node count + LOD) + whether
 *  the walk cycle should animate (off under prefers-reduced-motion). Lite mode
 *  (O-R2 ③) zeroes the decorative sprites entirely without touching the
 *  stored density preference - switching lite off restores it. */
export function useCrewCount(
  nodeCount: number,
  opts: CrewCountOpts = {},
): { count: number; animated: boolean; density: CrewDensity } {
  const { density } = useCrewDensity();
  const { liteMode } = useLiteMode();
  const animated = !prefersReducedMotion();
  const count = liteMode ? 0 : crewCountForDensity(density, nodeCount, opts);
  return { count, animated, density };
}

export function __resetCrewDensityForTests(): void {
  memoryDensity = null;
}
