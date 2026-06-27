// Phase B Slice 2: PURE record -> HealthSample mappers for the native sources.
//
// These functions are the only place a native provider record becomes the
// app-level HealthSample DTO. They are kept here, free of any native import, so
// unit tests can cover the mapping (metric type, unit, externalId dedupe)
// WITHOUT the native module loading. The source adapters (health-connect.ts /
// healthkit.ts) dynamic-require the native module, then hand the raw records to
// these mappers — so the adapters stay thin and untestable-on-CI, while the
// mapping logic is fully covered headless.
//
// The input shapes below are minimal, decoupled structural subsets of the
// provider types (react-native-health-connect record results / @kingstinct
// HealthKit samples). We intentionally do NOT import the provider types here:
// that keeps this module loadable in the jest/web bundle (no native peer like
// react-native-nitro-modules) and the adapters coerce the provider records to
// these subsets at the boundary.

import type { HealthSample } from "../HealthSource";

// ---------------------------------------------------------------------------
// Android — Health Connect
// ---------------------------------------------------------------------------

/** A Health Connect interval-record (Steps / ExerciseSession / SleepSession). */
export interface HCIntervalRecordLike {
  startTime: string;
  endTime: string;
  metadata?: { id?: string } | null;
}

export interface HCStepsRecordLike extends HCIntervalRecordLike {
  count: number;
}

export interface HCExerciseRecordLike extends HCIntervalRecordLike {
  /** Health Connect exercise type enum (int). */
  exerciseType?: number;
  title?: string;
}

export interface HCSleepRecordLike extends HCIntervalRecordLike {
  title?: string;
}

/** A Health Connect HeartRate record: a window holding instantaneous samples. */
export interface HCHeartRateRecordLike {
  startTime: string;
  endTime: string;
  metadata?: { id?: string } | null;
  samples: { time: string; beatsPerMinute: number }[];
}

function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

/** Steps -> one `steps` sample (unit count). */
export function mapHealthConnectSteps(record: HCStepsRecordLike): HealthSample {
  return {
    source: "health_connect",
    metricType: "steps",
    value: record.count,
    unit: "count",
    startedAt: record.startTime,
    endedAt: record.endTime,
    externalId: record.metadata?.id ?? undefined,
  };
}

/** ExerciseSession -> one `workout` sample (unit minutes), kind in metadata. */
export function mapHealthConnectExercise(record: HCExerciseRecordLike): HealthSample {
  const sample: HealthSample = {
    source: "health_connect",
    metricType: "workout",
    value: minutesBetween(record.startTime, record.endTime),
    unit: "min",
    startedAt: record.startTime,
    endedAt: record.endTime,
    externalId: record.metadata?.id ?? undefined,
    metadata: { workout_kind: record.exerciseType ?? null },
  };
  return sample;
}

/** SleepSession -> one `sleep` sample (unit minutes, the in-bed window). */
export function mapHealthConnectSleep(record: HCSleepRecordLike): HealthSample {
  return {
    source: "health_connect",
    metricType: "sleep",
    value: minutesBetween(record.startTime, record.endTime),
    unit: "min",
    startedAt: record.startTime,
    endedAt: record.endTime,
    externalId: record.metadata?.id ?? undefined,
  };
}

/**
 * HeartRate -> one `heart_rate` sample per instantaneous reading (unit bpm).
 * Health Connect nests readings inside a window record; the per-reading
 * externalId is the record id plus the reading time so re-import dedupes onto
 * one row each.
 */
export function mapHealthConnectHeartRate(record: HCHeartRateRecordLike): HealthSample[] {
  const recordId = record.metadata?.id;
  return record.samples.map((s) => ({
    source: "health_connect" as const,
    metricType: "heart_rate" as const,
    value: s.beatsPerMinute,
    unit: "bpm",
    startedAt: s.time,
    externalId: recordId ? `${recordId}:${s.time}` : undefined,
  }));
}

// ---------------------------------------------------------------------------
// iOS — HealthKit (@kingstinct/react-native-healthkit)
// ---------------------------------------------------------------------------

/** A HealthKit quantity sample (steps / heart rate). `startDate` is a Date. */
export interface HKQuantitySampleLike {
  uuid: string;
  quantity: number;
  unit?: string;
  startDate: Date | string;
  endDate: Date | string;
}

/** A HealthKit workout sample. `duration` is a {quantity, unit} measurement. */
export interface HKWorkoutSampleLike {
  uuid: string;
  workoutActivityType: number;
  duration: { quantity: number; unit: string };
  startDate: Date | string;
  endDate: Date | string;
}

/** A HealthKit category sample (sleep analysis). `value` is the stage enum. */
export interface HKCategorySampleLike {
  uuid: string;
  value: number;
  startDate: Date | string;
  endDate: Date | string;
}

function toIso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

function durationMinutes(startDate: Date | string, endDate: Date | string): number {
  const ms = new Date(toIso(endDate)).getTime() - new Date(toIso(startDate)).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

/** A HealthKit step-count quantity sample -> one `steps` sample (unit count). */
export function mapHealthKitSteps(sample: HKQuantitySampleLike): HealthSample {
  return {
    source: "healthkit",
    metricType: "steps",
    value: sample.quantity,
    unit: "count",
    startedAt: toIso(sample.startDate),
    endedAt: toIso(sample.endDate),
    externalId: sample.uuid,
  };
}

/** A HealthKit heart-rate quantity sample -> one `heart_rate` sample (bpm). */
export function mapHealthKitHeartRate(sample: HKQuantitySampleLike): HealthSample {
  return {
    source: "healthkit",
    metricType: "heart_rate",
    value: sample.quantity,
    unit: "bpm",
    startedAt: toIso(sample.startDate),
    endedAt: toIso(sample.endDate),
    externalId: sample.uuid,
  };
}

/** A HealthKit workout -> one `workout` sample (unit minutes), kind in metadata. */
export function mapHealthKitWorkout(sample: HKWorkoutSampleLike): HealthSample {
  // Prefer the reported duration (in seconds when unit is 's'); fall back to the
  // start/end span so a missing/odd unit still yields sane minutes.
  let minutes = durationMinutes(sample.startDate, sample.endDate);
  const dur = sample.duration;
  if (dur && Number.isFinite(dur.quantity) && dur.quantity > 0) {
    if (dur.unit === "min") minutes = Math.round(dur.quantity);
    else if (dur.unit === "s" || dur.unit === "sec") minutes = Math.round(dur.quantity / 60);
    else if (dur.unit === "hr" || dur.unit === "h") minutes = Math.round(dur.quantity * 60);
  }
  return {
    source: "healthkit",
    metricType: "workout",
    value: minutes,
    unit: "min",
    startedAt: toIso(sample.startDate),
    endedAt: toIso(sample.endDate),
    externalId: sample.uuid,
    metadata: { workout_kind: sample.workoutActivityType },
  };
}

/** A HealthKit sleep-analysis category sample -> one `sleep` sample (minutes). */
export function mapHealthKitSleep(sample: HKCategorySampleLike): HealthSample {
  return {
    source: "healthkit",
    metricType: "sleep",
    value: durationMinutes(sample.startDate, sample.endDate),
    unit: "min",
    startedAt: toIso(sample.startDate),
    endedAt: toIso(sample.endDate),
    externalId: sample.uuid,
  };
}

/**
 * Dedupe a flat list of mapped samples by externalId, keeping the FIRST. Samples
 * without an externalId are always kept (they can't be deduped). Used by the
 * adapters before returning, so a provider that returns overlapping windows
 * doesn't produce duplicate rows even before the upsert key catches it.
 */
export function dedupeByExternalId(samples: HealthSample[]): HealthSample[] {
  const seen = new Set<string>();
  const out: HealthSample[] = [];
  for (const s of samples) {
    if (s.externalId === undefined) {
      out.push(s);
      continue;
    }
    if (seen.has(s.externalId)) continue;
    seen.add(s.externalId);
    out.push(s);
  }
  return out;
}
