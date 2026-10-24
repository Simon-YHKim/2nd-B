// What the settings screen says about web usage statistics (Q-261024-72, Simon 2026-10-24).
//
// The settings line said "web GA4 applied" whenever the account's external_analytics
// consent was on, even while the operator switch runtime_flags.analytics_enabled was
// off and nothing was sent. This module reads that switch for display only. It never
// changes what is sent: the sending gate stays in ./index.ts.
//
// The read returns null when the switch could not be read (error or timeout). The
// screen then keeps the "applied" wording instead of guessing. A missing row reads as
// off, the same default the sending gate uses (resolveAnalyticsRuntimeFlags).

import { getSupabaseClient } from "../supabase/client";
import { resolveAnalyticsRuntimeFlags } from "./index";

const READ_TIMEOUT_MS = 5_000;

export async function readAnalyticsServerSwitch(): Promise<boolean | null> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const query = getSupabaseClient()
      .from("runtime_flags")
      .select("key, enabled")
      .eq("key", "analytics_enabled");
    const result = (await Promise.race([
      query,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
      }),
    ])) as { data: unknown; error: unknown } | null;
    if (!result || result.error) return null;
    return resolveAnalyticsRuntimeFlags(result.data).analyticsEnabled;
  } catch {
    return null;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

export type AnalyticsToggleValue = "lockedUnder18" | "off" | "applied" | "paused";

/** The value shown on the usage statistics line of the privacy settings card. */
export function analyticsToggleValue(input: {
  minor: boolean;
  on: boolean;
  serverOn: boolean | null;
}): AnalyticsToggleValue {
  if (input.minor) return "lockedUnder18";
  if (!input.on) return "off";
  return input.serverOn === false ? "paused" : "applied";
}
