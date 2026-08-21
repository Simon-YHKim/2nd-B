// Phase B Slice 1: the ONE ingest choke point for health/activity samples.
//
// Every sample that enters health_samples passes through ingestHealthSamples.
// This is the single place where the consent + minor gate lives:
//   - healthImportAllowed(isMinor, pref) MUST pass or the call is rejected.
//     A 14-17 minor only passes when the pref is explicitly true, which is
//     structurally impossible (health_import is server-seeded OFF in 0050 and
//     non-promotable in privacy/prefs.ts) — so minors never ingest. Adults
//     opt in (pref true).
//   - Samples are then upserted (idempotent dedupe) and each persisted row is
//     run through the deterministic auto-complete (no LLM).
//
// Health/activity data is PIPA 민감정보 (sensitive data). This module is the
// app-level opt-in gate; the native OS permission prompt is a SECOND gate that
// arrives in Slice 2. The explicit consent record is written by the screen on
// opt-in via recordHealthImportConsent (consent_records, the existing ledger).

import type { HealthSample } from "./HealthSource";
import { applyHealthAutoComplete } from "../ops/routines";
import { upsertHealthSamples, type HealthSampleRow } from "../supabase/health";

/**
 * Gate: may this account ingest health/activity samples? Mirrors
 * recommendationsAllowed (src/lib/ops/recommend.ts).
 *
 * The rule is the same for everyone — an explicit opt-in — and `isMinor` is kept
 * in the signature because callers pass what they know and the parameter
 * documents that minors were considered. It is deliberately NOT the thing that
 * locks minors out: this function runs on the client, so trusting it for that
 * would be trusting a flag the client controls. Minors are locked by the pref
 * being seeded false and clamped server-side (0050), by health_import being
 * absent from MINOR_PROMOTABLE_KEYS, and by the 0100/0128 database trigger that
 * rejects their rows outright.
 *
 * The OFF default means an adult who has not opted in is rejected here, and
 * since 0128, at the database too.
 */
export function healthImportAllowed(
  _isMinor: boolean | null | undefined,
  pref: boolean | null | undefined,
): boolean {
  return pref === true;
}

export class HealthImportNotAllowedError extends Error {
  constructor() {
    super("health_import not allowed: opt-in required (and minors are hard-locked off)");
    this.name = "HealthImportNotAllowedError";
  }
}

export interface IngestOptions {
  isMinor: boolean | null | undefined;
  /** The resolved health_import preference for this user. */
  pref: boolean | null | undefined;
}

export interface IngestResult {
  inserted: HealthSampleRow[];
  /** Routine ids that were auto-completed across all inserted samples. */
  autoCompleted: string[];
}

/**
 * The single ingest entry point. Enforces the consent + minor gate, upserts the
 * samples (idempotent), then runs deterministic auto-completion for each row.
 * Rejects with HealthImportNotAllowedError when the gate fails — nothing is
 * written and no auto-complete runs.
 */
export async function ingestHealthSamples(
  userId: string,
  samples: HealthSample[],
  opts: IngestOptions,
): Promise<IngestResult> {
  if (!healthImportAllowed(opts.isMinor, opts.pref)) {
    throw new HealthImportNotAllowedError();
  }
  if (samples.length === 0) return { inserted: [], autoCompleted: [] };

  const inserted = await upsertHealthSamples(userId, samples);
  const autoCompleted: string[] = [];
  for (const row of inserted) {
    const hits = await applyHealthAutoComplete(userId, {
      id: row.id,
      metricType: row.metric_type as HealthSample["metricType"],
      value: typeof row.value === "number" ? row.value : Number(row.value),
      startedAt: row.started_at,
    });
    autoCompleted.push(...hits);
  }
  return { inserted, autoCompleted };
}
