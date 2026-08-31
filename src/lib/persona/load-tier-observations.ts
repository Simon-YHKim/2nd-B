// Reader for the full star_tier_history stream (0045/0060) — the raw input for
// the brightness timeline + ratification log (P3c/P3d).
//
// `/brightness` predates explicit read states and relies on the fail-soft
// `loadTierObservations(): [] on failure` contract. Keep that API unchanged.
// `/ratifications`, however, must not call an outage "no history", so it opts
// into the strict result below. Neither result shape carries the Supabase error:
// database detail is not UI/a11y/log material.

import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";
import type { TierObservation } from "./tier-history";

export const TIER_OBSERVATIONS_TIMEOUT_MS = 8_000;

export type TierObservationsResult =
  | { status: "ready"; observations: TierObservation[] }
  | { status: "error" }
  | { status: "timeout" };

interface TierObservationResponse {
  data: TierObservation[] | null;
  error: unknown;
}

export interface TierObservationReadOptions {
  timeoutMs?: number;
}

/** Settle one Supabase thenable without leaking its error or leaving a spinner forever. */
export async function settleTierObservationRead(
  work: PromiseLike<TierObservationResponse>,
  timeoutMs: number = TIER_OBSERVATIONS_TIMEOUT_MS,
): Promise<TierObservationsResult> {
  try {
    const { data, error } = await withTimeout(work, timeoutMs, "tier observations");
    if (error) return { status: "error" };
    return { status: "ready", observations: data ?? [] };
  } catch (error) {
    return { status: isTimeoutError(error) ? "timeout" : "error" };
  }
}

/** Strict opt-in reader for screens that distinguish empty, failure, and timeout. */
export async function loadTierObservationsResult(
  userId: string,
  options: TierObservationReadOptions = {},
): Promise<TierObservationsResult> {
  try {
    const query = getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at, evidence_origin, evidence_citations")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: true });

    return await settleTierObservationRead(
      query as unknown as PromiseLike<TierObservationResponse>,
      options.timeoutMs,
    );
  } catch {
    // Query construction can throw before a thenable exists. Keep both APIs settled.
    return { status: "error" };
  }
}

/** Legacy fail-soft API. Do not change its signature or existing callers. */
export async function loadTierObservations(userId: string): Promise<TierObservation[]> {
  const result = await loadTierObservationsResult(userId);
  return result.status === "ready" ? result.observations : [];
}
