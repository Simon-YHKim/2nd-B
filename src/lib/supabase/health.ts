// Phase B Slice 1: RLS-scoped persistence for health_samples (migration 0049).
//
// Owner-only: health_samples is owner-only RLS (auth.uid() = user_id), so every
// query is also scoped with .eq("user_id", userId) — the explicit argument must
// equal auth.uid() or the policy rejects the write. upsert dedupes on the
// UNIQUE(user_id, source, metric_type, started_at, external_id) key so a
// re-import is a no-op (idempotent), matching the routine completion ledger.

import { getSupabaseClient } from "./client";
import type { HealthSample } from "../health/HealthSource";

/** A persisted health sample row (mirrors the health_samples columns). */
export interface HealthSampleRow {
  id: string;
  user_id: string;
  source: string;
  metric_type: string;
  value: number;
  unit: string;
  started_at: string;
  ended_at: string | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function toInsert(userId: string, sample: HealthSample): Record<string, unknown> {
  return {
    user_id: userId,
    source: sample.source,
    metric_type: sample.metricType,
    value: sample.value,
    unit: sample.unit,
    started_at: sample.startedAt,
    ended_at: sample.endedAt ?? null,
    external_id: sample.externalId ?? null,
    metadata: sample.metadata ?? {},
  };
}

/**
 * Upsert a batch of samples, deduping on the import key. Returns the persisted
 * rows (with ids) so the caller can run auto-completion against each. The
 * upsert is idempotent: re-importing the same samples updates the same rows.
 */
export async function upsertHealthSamples(
  userId: string,
  samples: HealthSample[],
): Promise<HealthSampleRow[]> {
  if (samples.length === 0) return [];
  const supabase = getSupabaseClient();
  const rows = samples.map((s) => toInsert(userId, s));
  const { data, error } = await supabase
    .from("health_samples")
    .upsert(rows, { onConflict: "user_id,source,metric_type,started_at,external_id" })
    .select();
  if (error) throw error;
  return (data ?? []) as HealthSampleRow[];
}

/** Recent samples for the user (RLS-scoped), newest first. */
export async function listRecentSamples(userId: string, limit = 50): Promise<HealthSampleRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("health_samples")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as HealthSampleRow[];
}

/**
 * Deletes this user's samples of one metric and returns how many went. Withdrawal deletes
 * metric by metric so a large account does not run one long statement (heart rate alone can
 * be many thousands of rows). health_samples is owner-only RLS (0049), so the user_id filter
 * only narrows what the policy already allows.
 */
export async function deleteHealthSamplesOfMetric(userId: string, metric: HealthSample["metricType"]): Promise<number> {
  const supabase = getSupabaseClient();
  const { error, count } = await supabase
    .from("health_samples")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("metric_type", metric);
  if (error) throw error;
  return count ?? 0;
}

/** Deletes whatever samples remain for this user, any metric. */
export async function deleteRemainingHealthSamples(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { error, count } = await supabase.from("health_samples").delete({ count: "exact" }).eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** How many samples this user still has (a head request: no rows come back). */
export async function countHealthSamples(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("health_samples")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}
