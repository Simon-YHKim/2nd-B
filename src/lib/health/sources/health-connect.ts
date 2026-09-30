// Phase B Slice 2: the Android Health Connect HealthSource.
//
// Native-only (G4: needs a dev/EAS build with the react-native-health-connect
// config plugin). Everything native is reached through a lazy require() inside
// a try/catch, exactly like src/lib/ops/reminders.ts — so requiring this module
// on web / Expo Go / jest never throws and isAvailable() simply returns false.
//
// read() reads steps / exercise / sleep / heart-rate records for the range and
// maps each through the PURE mappers in ./mappers (covered by unit tests with
// the native module mocked). readGranted() does the same for the metrics it is
// asked for, but only those the user already granted and without any prompt
// (the automatic read, lib/health/auto-read.ts). No network, no LLM, $0.
// Persistence + consent stay the caller's job via the single ingestHealthSamples
// choke point.

import type {
  GrantedRead,
  HealthMetricType,
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
  /** Lists what the user already granted. Shows no UI (react-native-health-connect 3.x). */
  getGrantedPermissions?(): Promise<unknown>;
  readRecords(
    recordType: string,
    options: { timeRangeFilter: { operator: "between"; startTime: string; endTime: string }; pageToken?: string },
  ): Promise<{ records: unknown[]; pageToken?: string }>;
}

// SDK_AVAILABLE === 3 in react-native-health-connect's getSdkStatus contract.
const SDK_AVAILABLE = 3;

const READ_RECORD_TYPES = ["Steps", "ExerciseSession", "SleepSession", "HeartRate"] as const;
type ReadRecordType = (typeof READ_RECORD_TYPES)[number];

/** The metric each record type becomes (./mappers). */
const METRIC_OF: Record<ReadRecordType, HealthMetricType> = {
  Steps: "steps",
  ExerciseSession: "workout",
  SleepSession: "sleep",
  HeartRate: "heart_rate",
};

// Health Connect answers in pages (1,000 records by default) and returns a pageToken while
// more remain. Reading only the first page dropped the rest without a sign, and a source
// that writes a steps record every minute fills a page in less than a day. A page that
// fails keeps the pages before it and marks the type incomplete, so the automatic read
// reads that window again. The cap only stops a token that never ends.
const MAX_PAGES = 50;

interface RecordsRead {
  records: unknown[];
  complete: boolean;
}

async function readAllRecords(mod: HealthConnectModule, recordType: ReadRecordType, range: HealthReadRange): Promise<RecordsRead> {
  const timeRangeFilter = { operator: "between" as const, startTime: range.startIso, endTime: range.endIso };
  const records: unknown[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    try {
      const result = await mod.readRecords(recordType, pageToken ? { timeRangeFilter, pageToken } : { timeRangeFilter });
      if (Array.isArray(result?.records)) records.push(...result.records);
      pageToken = typeof result?.pageToken === "string" && result.pageToken.length > 0 ? result.pageToken : undefined;
    } catch {
      // A type the user did not grant throws a SecurityException for that read only, and
      // Health Connect refuses reads once the app has left the foreground.
      return { records, complete: false };
    }
    if (!pageToken) return { records, complete: true };
  }
  return { records, complete: false };
}

function mapRecords(recordType: ReadRecordType, records: unknown[], out: HealthSample[]): void {
  try {
    for (const record of records) {
      if (recordType === "Steps") out.push(mapHealthConnectSteps(record as HCStepsRecordLike));
      else if (recordType === "ExerciseSession") out.push(mapHealthConnectExercise(record as HCExerciseRecordLike));
      else if (recordType === "SleepSession") out.push(mapHealthConnectSleep(record as HCSleepRecordLike));
      else out.push(...mapHealthConnectHeartRate(record as HCHeartRateRecordLike));
    }
  } catch {
    // Defensive: a malformed record throwing in a pure mapper keeps the samples mapped so
    // far rather than throwing into the ingest path.
  }
}

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

function isGrantedRead(permission: unknown, recordType: ReadRecordType): boolean {
  if (!permission || typeof permission !== "object") return false;
  const granted = permission as { accessType?: unknown; recordType?: unknown };
  return granted.accessType === "read" && granted.recordType === recordType;
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

  async readGranted(range: HealthReadRange, metrics: readonly HealthMetricType[]): Promise<GrantedRead | null> {
    const mod = loadModule();
    if (!mod || typeof mod.getGrantedPermissions !== "function") return null;
    let types: ReadRecordType[];
    try {
      if ((await mod.getSdkStatus()) !== SDK_AVAILABLE) return null;
      if (!(await mod.initialize())) return null;
      // Lists what the user already granted; unlike requestPermission it shows nothing.
      const granted = await mod.getGrantedPermissions();
      const list: unknown[] = Array.isArray(granted) ? granted : [];
      types = READ_RECORD_TYPES.filter((type) =>
        metrics.includes(METRIC_OF[type]) && list.some((permission) => isGrantedRead(permission, type)));
    } catch {
      return null;
    }
    if (types.length === 0) return null;
    const reads = await Promise.all(types.map((type) => readAllRecords(mod, type, range)));
    const out: HealthSample[] = [];
    types.forEach((type, i) => mapRecords(type, reads[i].records, out));
    return { samples: dedupeByExternalId(out), complete: reads.every((read) => read.complete) };
  },

  async read(range: HealthReadRange): Promise<HealthSample[]> {
    const mod = loadModule();
    if (!mod) return [];
    // Health Connect grants are PER-record-type: reading a type the user did NOT grant
    // throws a SecurityException for THAT read only. readAllRecords keeps each type apart,
    // so one refusal never turns a partial grant into a silent zero-data import.
    const reads = await Promise.all(READ_RECORD_TYPES.map((type) => readAllRecords(mod, type, range)));
    const out: HealthSample[] = [];
    READ_RECORD_TYPES.forEach((type, i) => mapRecords(type, reads[i].records, out));
    return dedupeByExternalId(out);
  },
};
