// QA tier override from the web URL (`?tier=...`). Lets a SINGLE deployment
// expose separate live links per tier for testing:
//   ?tier=all   → everything unlocked (brain)
//   ?tier=free  → 별바라기
//   ?tier=plus  → 항해자 (maps to cortex)
//   ?tier=pro   → 북극성 (maps to brain)
//
// Gated behind EXPO_PUBLIC_ALLOW_DEV_TIER so a release build can NEVER be
// bypassed by a query param (must be "true" at build time to honor it). Web-only
// — native always returns "off". The first-seen choice is persisted in
// sessionStorage so it survives in-app navigation within the tab.

import { Platform } from "react-native";

import { getEnv } from "../env";
import type { SubscriptionTier } from "./entitlements";

// Accepts the new pricing vocab (all/free/plus/pro) AND the internal tier names.
const URL_TIER_MAP: Record<string, SubscriptionTier> = {
  all: "brain", // god-mode for testing — everything unlocked
  brain: "brain",
  pro: "brain",
  cortex: "cortex",
  plus: "cortex",
  soma: "soma",
  free: "free",
};

let cached: SubscriptionTier | "off" | undefined;

/** Tier forced by the `?tier=` URL param (web QA only), or "off" when absent/
 *  disallowed. Cached per module load; reads sessionStorage so the choice sticks
 *  across route changes after the first link hit. */
export function getUrlTierOverride(): SubscriptionTier | "off" {
  if (cached !== undefined) return cached;
  cached = "off";
  if (Platform.OS !== "web" || typeof window === "undefined") return cached;
  if (!getEnv().EXPO_PUBLIC_ALLOW_DEV_TIER) return cached;
  try {
    const params = new URLSearchParams(window.location.search);
    let raw = params.get("tier");
    const store = typeof window.sessionStorage !== "undefined" ? window.sessionStorage : null;
    if (raw) {
      try {
        store?.setItem("dev.tier", raw);
      } catch {
        // sessionStorage can throw in private mode — ignore, the param still applies this load.
      }
    } else {
      raw = store?.getItem("dev.tier") ?? null;
    }
    if (raw) {
      const mapped = URL_TIER_MAP[raw.toLowerCase()];
      if (mapped) cached = mapped;
    }
  } catch {
    // Any parse failure fails closed to the real tier.
  }
  return cached;
}

/** Test-only: clear the per-load cache. */
export function __resetUrlTierCache(): void {
  cached = undefined;
}
