// Phase B Slice 1: a deterministic mock health source.
//
// Generates a fixed, reproducible set of samples for a range so the ingest →
// auto-complete loop is testable on web / CI with no device, no network, no
// cost, no LLM. Same range in → same samples out (the externalId is derived
// from the day, so re-running upserts onto the same rows / is idempotent).

import type {
  HealthReadRange,
  HealthSample,
  HealthSource,
  HealthPermission,
} from "../HealthSource";

const STEP_VALUE = 9000; // over the 8000 STEP_GOAL → satisfies exercise/health
const SLEEP_MINUTES = 420; // 7h, over the 360 SLEEP_MIN_MINUTES
const WORKOUT_MINUTES = 30;

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD, stable per calendar day
}

function startOfDayIso(iso: string): string {
  return `${dayKey(iso)}T08:00:00.000Z`;
}

/**
 * Deterministic fixtures for the START day of the range: one workout, one
 * steps total, one sleep window. Pure function of the range start.
 */
export function mockSamplesForRange(range: HealthReadRange): HealthSample[] {
  const day = dayKey(range.startIso);
  const startedAt = startOfDayIso(range.startIso);
  return [
    {
      source: "mock",
      metricType: "workout",
      value: WORKOUT_MINUTES,
      unit: "min",
      startedAt,
      endedAt: `${day}T08:30:00.000Z`,
      externalId: `mock-workout-${day}`,
      metadata: { activity: "run" },
    },
    {
      source: "mock",
      metricType: "steps",
      value: STEP_VALUE,
      unit: "count",
      startedAt,
      externalId: `mock-steps-${day}`,
    },
    {
      source: "mock",
      metricType: "sleep",
      value: SLEEP_MINUTES,
      unit: "min",
      startedAt: `${day}T00:00:00.000Z`,
      endedAt: `${day}T07:00:00.000Z`,
      externalId: `mock-sleep-${day}`,
    },
  ];
}

export const mockHealthSource: HealthSource = {
  id: "mock",
  isAvailable(): boolean {
    return true; // pure JS, runs everywhere
  },
  requestPermission(): Promise<HealthPermission> {
    return Promise.resolve("granted");
  },
  read(range: HealthReadRange): Promise<HealthSample[]> {
    return Promise.resolve(mockSamplesForRange(range));
  },
};
