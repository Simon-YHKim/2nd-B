// Phase B Slice 1: the source-adapter boundary for health/activity ingest.
//
// A HealthSource is a thin adapter over one provider of activity data (manual
// entry, a deterministic mock, and later HealthKit / Health Connect / Strava).
// Slice 1 ships ONLY the manual + mock sources — no native module, no network,
// no cost, no LLM. The native OS-permission sources arrive in Slice 2 behind
// the same interface, so nothing downstream changes when they land.
//
// Every adapter reports isAvailable() at runtime so the registry can omit a
// source that can't run on the current platform (web / Expo Go) — the same
// try{require}/availability discipline used by src/lib/ops/reminders.ts.

export type HealthSourceId = "manual" | "mock" | "healthkit" | "health_connect" | "strava";
export type HealthMetricType = "steps" | "workout" | "sleep" | "heart_rate";
export type HealthPermission = "granted" | "denied" | "unavailable";

/**
 * The app-level DTO for one activity/health sample, before it is persisted.
 * Mirrors the health_samples columns (migration 0049). `metadata` carries
 * source-specific extras (e.g. workout type) and never instructions.
 */
export interface HealthSample {
  source: HealthSourceId;
  metricType: HealthMetricType;
  value: number;
  unit: string;
  /** ISO start of the sample (local activity time). */
  startedAt: string;
  /** ISO end, when the sample spans a window (workout / sleep). */
  endedAt?: string;
  /** Stable per-source id so re-import dedupes onto one row. */
  externalId?: string;
  metadata?: Record<string, unknown>;
}

/** A half-open time window [start, end) the adapter is asked to read. */
export interface HealthReadRange {
  startIso: string;
  endIso: string;
}

export interface HealthSource {
  readonly id: HealthSourceId;
  /** True only when this adapter can actually run on the current platform. */
  isAvailable(): boolean;
  /**
   * Ask the provider for read access. Slice 1 sources resolve synchronously
   * ('granted' for manual/mock); the native OS prompt is a Slice 2 concern.
   */
  requestPermission(): Promise<HealthPermission>;
  /** Read samples in the given range. Returns [] when nothing is available. */
  read(range: HealthReadRange): Promise<HealthSample[]>;
}
