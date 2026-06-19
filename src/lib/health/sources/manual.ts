// Phase B Slice 1: the manual health source.
//
// Wraps a value the user typed (e.g. "I walked 8500 steps", "30 min workout")
// into one HealthSample. No device, no network, no cost, no LLM — manual is the
// always-available fallback so adults who opt in can still ingest on web /
// Expo Go where the native sources don't exist.

import type {
  HealthMetricType,
  HealthReadRange,
  HealthSample,
  HealthSource,
  HealthPermission,
} from "../HealthSource";

export interface ManualEntry {
  metricType: HealthMetricType;
  value: number;
  unit: string;
  /** ISO start; defaults to now when omitted. */
  startedAt?: string;
  endedAt?: string;
}

const DEFAULT_UNIT: Record<HealthMetricType, string> = {
  steps: "count",
  workout: "min",
  sleep: "min",
  heart_rate: "bpm",
};

/**
 * Turn a single user-entered value into one HealthSample. The externalId is
 * derived from metric + start so re-submitting the same entry dedupes.
 */
export function manualSample(entry: ManualEntry, now: Date = new Date()): HealthSample {
  const startedAt = entry.startedAt ?? now.toISOString();
  const unit = entry.unit || DEFAULT_UNIT[entry.metricType];
  const sample: HealthSample = {
    source: "manual",
    metricType: entry.metricType,
    value: entry.value,
    unit,
    startedAt,
    externalId: `manual-${entry.metricType}-${startedAt}`,
  };
  if (entry.endedAt) sample.endedAt = entry.endedAt;
  return sample;
}

/**
 * A manual source is per-entry, so read() returns the entries queued on the
 * instance. The factory keeps it stateless from the registry's point of view.
 */
export function createManualHealthSource(entries: ManualEntry[] = []): HealthSource {
  return {
    id: "manual",
    isAvailable(): boolean {
      return true;
    },
    requestPermission(): Promise<HealthPermission> {
      return Promise.resolve("granted");
    },
    read(_range: HealthReadRange): Promise<HealthSample[]> {
      return Promise.resolve(entries.map((e) => manualSample(e)));
    },
  };
}

/** A bare manual source with no queued entries (entries flow via manualSample). */
export const manualHealthSource: HealthSource = createManualHealthSource();
