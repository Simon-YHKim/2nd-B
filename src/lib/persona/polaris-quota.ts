import { getSupabaseClient } from "../supabase/client";

export const POLARIS_INTRO_GENERATIONS = 2;
export interface PolarisQuota {
  available: boolean;
  introRemaining: number | null;
  tier: string | null;
}

/** UI status reads distinguish a confirmed disabled flag from an unread reply.
 * Admission and QA callers keep loadPolarisQuota's conservative fallback. */
export async function loadPolarisQuotaStrict(userId: string): Promise<PolarisQuota> {
  if (!userId) throw new Error("polaris_status_owner_required");
  const { data, error } = await getSupabaseClient().rpc("polaris_generation_status", { p_user_id: userId });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.available !== "boolean" ||
      !Number.isInteger(data.intro_remaining) || data.intro_remaining < 0 || data.intro_remaining > POLARIS_INTRO_GENERATIONS ||
      typeof data.tier !== "string" || !data.tier.trim()) throw new Error("polaris_status_invalid");
  return { available: data.available, introRemaining: data.intro_remaining, tier: data.tier };
}

/** A missing RPC/disabled server is unavailable, never two imaginary credits. */
export async function loadPolarisQuota(userId: string): Promise<PolarisQuota> {
  try {
  const { data, error } = await getSupabaseClient().rpc("polaris_generation_status", { p_user_id: userId });
  if (error || !data || typeof data !== "object" || data.available !== true ||
      !Number.isInteger(data.intro_remaining) || data.intro_remaining < 0 || data.intro_remaining > 2) {
    return { available: false, introRemaining: null, tier: null };
  }
  return { available: true, introRemaining: data.intro_remaining, tier: typeof data.tier === "string" ? data.tier : null };
  } catch { return { available: false, introRemaining: null, tier: null }; }
}

export async function reservePolarisGeneration(userId: string, key: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("reserve_polaris_generation", {
    p_user_id: userId, p_key: key,
  });
  if (error) throw new Error(error.message.includes("limit_exceeded") ? "polaris_limit_exceeded" : "polaris_unavailable");
  if (!data || typeof data.generation_id !== "string" || data.status !== "reserved") {
    throw new Error("polaris_generation_active");
  }
  return data.generation_id;
}

export async function failPolarisGeneration(userId: string, generationId: string): Promise<void> {
  // Cancellation before provider dispatch only. A running request is settled
  // by its server owner, so another client cannot cancel while it still runs.
  const { error } = await getSupabaseClient().rpc("cancel_polaris_generation", {
    p_user_id: userId, p_generation_id: generationId,
  });
  if (error) throw error;
}
