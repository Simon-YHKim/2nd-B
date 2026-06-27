// Phase B Slice 2: the Android Health Connect HealthSource.
//
// Native-only (G4: needs a dev/EAS build with the react-native-health-connect
// config plugin). Everything native is reached through a lazy require() inside
// a try/catch, exactly like src/lib/ops/reminders.ts — so requiring this module
// on web / Expo Go / jest never throws and isAvailable() simply returns false.
//
// read() reads steps / exercise / sleep / heart-rate records for the range and
// maps each through the PURE mappers in ./mappers (covered by unit tests with
// the native module mocked). No network, no LLM, $0. Persistence + consent stay
// the caller's job via the single ingestHealthSamples choke point.

import type {
  HealthPermission,
  HealthReadRange,
  HealthSample,
  HealthSource,
} from "../HealthSource";
import {
  dedupeByExternalId,
  mapHealthConnectExercise,
  mapHealthConnectHeartRate,
  mapHealthConnectSleep,
  mapHealthConnectSteps,
  type HCExerciseRecordLike,
  type HCHeartRateRecordLike,
  type HCSleepRecordLike,
  type HCStepsRecordLike,
} from "./mappers";

// A minimal structural view of the react-native-health-connect surface we use.
// The real module is loaded lazily; this type only describes the few calls we
// make so the guarded code type-checks under TS strict without a top-level
// import of the native package.
interface HealthConnectModule {
  getSdkStatus(): Promise<number>;
  initialize(): Promise<boolean>;
  requestPermission(
    permissions: { accessType: "read" | "write"; recordType: string }[],
  ): Promise<unknown>;
  readRecords(
    recordType: string,
    options: { timeRangeFilter: { operator: "between"; startTime: string; endTime: string } },
  ): Promise<{ records: unknown[] }>;
}

// SDK_AVAILABLE === 3 in react-native-health-connect's getSdkStatus contract.
const SDK_AVAILABLE = 3;

const READ_RECORD_TYPES = ["Steps", "ExerciseSession", "SleepSession", "HeartRate"] as const;

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

/**
 * Lazy-require the native module. Returns null on web / Expo Go / jest (the
 * require throws or the package is absent) so nothing downstream ever throws.
 */
function loadModule(): HealthConnectModule | null {
  if (!isReactNativeRuntime()) return null;
  try {
    const mod = require("react-native-health-connect") as Partial<HealthConnectModule>;
    if (mod && typeof mod.readRecords === "function" && typeof mod.initialize === "function") {
      return mod as HealthConnectModule;
    }
    return null;
  } catch {
    return null;
  }
}

function readPermissions(): { accessType: "read"; recordType: string }[] {
  return READ_RECORD_TYPES.map((recordType) => ({ accessType: "read" as const, recordType }));
}

export const healthConnectSource: HealthSource = {
  id: "health_connect",

  isAvailable(): boolean {
    return loadModule() !== null;
  },

  async requestPermission(): Promise<HealthPermission> {
    const mod = loadModule();
    if (!mod) return "unavailable";
    try {
      const status = await mod.getSdkStatus();
      if (status !== SDK_AVAILABLE) return "unavailable";
      const ready = await mod.initialize();
      if (!ready) return "unavailable";
      const granted = await mod.requestPermission(readPermissions());
      // requestPermission resolves with the permissions actually granted.
      const list = Array.isArray(granted) ? granted : [];
      return list.length > 0 ? "granted" : "denied";
    } catch {
      return "denied";
    }
  },

  async read(range: HealthReadRange): Promise<HealthSample[]> {
    const mod = loadModule();
    if (!mod) return [];
    const filter = {
      timeRangeFilter: {
        operator: "between" as const,
        startTime: range.startIso,
        endTime: range.endIso,
      },
    };
    const out: HealthSample[] = [];
    try {
      const [steps, exercise, sleep, heart] = await Promise.all([
        mod.readRecords("Steps", filter),
        mod.readRecords("ExerciseSession", filter),
        mod.readRecords("SleepSession", filter),
        mod.readRecords("HeartRate", filter),
      ]);
      for (const r of steps.records as HCStepsRecordLike[]) out.push(mapHealthConnectSteps(r));
      for (const r of exercise.records as HCExerciseRecordLike[]) out.push(mapHealthConnectExercise(r));
      for (const r of sleep.records as HCSleepRecordLike[]) out.push(mapHealthConnectSleep(r));
      for (const r of heart.records as HCHeartRateRecordLike[]) {
        out.push(...mapHealthConnectHeartRate(r));
      }
    } catch {
      // A read failure (revoked permission, provider gone) yields whatever was
      // collected so far rather than throwing into the ingest path.
    }
    return dedupeByExternalId(out);
  },
};
