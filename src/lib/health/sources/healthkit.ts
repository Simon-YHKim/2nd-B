// Phase B Slice 2: the iOS HealthKit HealthSource.
//
// Native-only (G4: needs a dev/EAS build with the @kingstinct/react-native-
// healthkit config plugin). Every native call is reached through a lazy
// require() inside try/catch, like src/lib/ops/reminders.ts — so requiring this
// module on web / Expo Go / jest never throws and isAvailable() returns false.
//
// read() queries step-count / heart-rate quantity samples, workout samples, and
// sleep-analysis category samples for the range, mapping each through the PURE
// mappers in ./mappers (unit-tested with the native module mocked). No network,
// no LLM, $0. Persistence + consent stay the caller's job via the single
// ingestHealthSamples choke point.

import type {
  HealthPermission,
  HealthReadRange,
  HealthSample,
  HealthSource,
} from "../HealthSource";
import {
  dedupeByExternalId,
  mapHealthKitHeartRate,
  mapHealthKitSleep,
  mapHealthKitSteps,
  mapHealthKitWorkout,
  type HKCategorySampleLike,
  type HKQuantitySampleLike,
  type HKWorkoutSampleLike,
} from "./mappers";

// HealthKit quantity/category type identifiers we read.
const STEP_COUNT = "HKQuantityTypeIdentifierStepCount";
const HEART_RATE = "HKQuantityTypeIdentifierHeartRate";
const SLEEP_ANALYSIS = "HKCategoryTypeIdentifierSleepAnalysis";
// HKWorkoutType is a distinct HealthKit object type: read() queries it via
// queryWorkoutSamples, so it MUST be in the read-authorization set or every
// workout query returns empty on a real device (silent zero-workout imports).
const WORKOUT_TYPE = "HKWorkoutTypeIdentifier";

// A minimal structural view of the @kingstinct/react-native-healthkit surface we
// use. The real module is loaded lazily; this type only describes the calls we
// make so guarded code type-checks under TS strict without a top-level import of
// the native package (which pulls react-native-nitro-modules).
interface HealthKitModule {
  isHealthDataAvailable(): boolean;
  requestAuthorization(
    shareTypes: readonly string[],
    readTypes: readonly string[],
  ): Promise<boolean>;
  queryQuantitySamples(
    identifier: string,
    options: { filter: { startDate: Date; endDate: Date } },
  ): Promise<unknown[]>;
  queryWorkoutSamples(options: {
    filter: { startDate: Date; endDate: Date };
  }): Promise<unknown[]>;
  queryCategorySamples(
    identifier: string,
    options: { filter: { startDate: Date; endDate: Date } },
  ): Promise<unknown[]>;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

/**
 * Lazy-require the native module. Returns null on web / Expo Go / jest / Android
 * (the require throws, the package is absent, or HealthKit is unavailable) so
 * nothing downstream ever throws.
 */
function loadModule(): HealthKitModule | null {
  if (!isReactNativeRuntime()) return null;
  try {
    const mod = require("@kingstinct/react-native-healthkit") as
      | { default?: Partial<HealthKitModule> }
      | Partial<HealthKitModule>;
    // The package exports both named functions and a default aggregate; prefer
    // whichever carries the calls we need.
    const candidate = (("default" in mod && mod.default) || mod) as Partial<HealthKitModule>;
    if (
      candidate &&
      typeof candidate.isHealthDataAvailable === "function" &&
      typeof candidate.queryQuantitySamples === "function"
    ) {
      return candidate as HealthKitModule;
    }
    return null;
  } catch {
    return null;
  }
}

export const healthKitSource: HealthSource = {
  id: "healthkit",

  isAvailable(): boolean {
    const mod = loadModule();
    if (!mod) return false;
    try {
      return mod.isHealthDataAvailable() === true;
    } catch {
      return false;
    }
  },

  async requestPermission(): Promise<HealthPermission> {
    const mod = loadModule();
    if (!mod) return "unavailable";
    try {
      if (!mod.isHealthDataAvailable()) return "unavailable";
      // Read-only: no share (write) types requested. WORKOUT_TYPE is included so
      // the workout query in read() is actually authorized (see const above).
      const ok = await mod.requestAuthorization([], [STEP_COUNT, HEART_RATE, SLEEP_ANALYSIS, WORKOUT_TYPE]);
      return ok ? "granted" : "denied";
    } catch {
      return "denied";
    }
  },

  async read(range: HealthReadRange): Promise<HealthSample[]> {
    const mod = loadModule();
    if (!mod) return [];
    const filter = {
      filter: { startDate: new Date(range.startIso), endDate: new Date(range.endIso) },
    };
    const out: HealthSample[] = [];
    // Promise.allSettled (mirrors health-connect.ts): one query rejecting must NOT
    // discard the samples the other authorized queries already returned — otherwise
    // a single transient HealthKit error (or an unauthorized type) silently zeroes
    // the whole sync even though steps/heart-rate/sleep were granted and had data.
    const [steps, heart, workouts, sleep] = await Promise.allSettled([
      mod.queryQuantitySamples(STEP_COUNT, filter),
      mod.queryQuantitySamples(HEART_RATE, filter),
      mod.queryWorkoutSamples(filter),
      mod.queryCategorySamples(SLEEP_ANALYSIS, filter),
    ]);
    try {
      if (steps.status === "fulfilled")
        for (const s of steps.value as HKQuantitySampleLike[]) out.push(mapHealthKitSteps(s));
      if (heart.status === "fulfilled")
        for (const s of heart.value as HKQuantitySampleLike[]) out.push(mapHealthKitHeartRate(s));
      if (workouts.status === "fulfilled")
        for (const s of workouts.value as HKWorkoutSampleLike[]) out.push(mapHealthKitWorkout(s));
      if (sleep.status === "fulfilled")
        for (const s of sleep.value as HKCategorySampleLike[]) out.push(mapHealthKitSleep(s));
    } catch {
      // Defensive: a malformed sample throwing in a pure mapper still yields the
      // samples collected so far rather than throwing into the ingest path.
    }
    return dedupeByExternalId(out);
  },
};
