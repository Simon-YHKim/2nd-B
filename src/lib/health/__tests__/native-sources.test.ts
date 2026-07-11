// Phase B Slice 2: the native sources NEVER throw off-device and self-omit from
// the registry. We mock the native modules at the require boundary (like the
// reminders test) and toggle the RN runtime via navigator.product.
//
// Two cases per source:
//   - Off RN runtime (web / Expo Go / jest default): isAvailable() === false and
//     read() === [] without ever touching the native module.
//   - On RN runtime with the native module present: isAvailable() === true and
//     read() maps the mocked records through the pure mappers.

const hcReadRecords = jest.fn();
const hcGetSdkStatus = jest.fn();
const hcInitialize = jest.fn();
const hcRequestPermission = jest.fn();

jest.mock(
  "react-native-health-connect",
  () => ({
    getSdkStatus: () => hcGetSdkStatus(),
    initialize: () => hcInitialize(),
    requestPermission: (p: unknown) => hcRequestPermission(p),
    readRecords: (t: string, o: unknown) => hcReadRecords(t, o),
  }),
  { virtual: true },
);

const hkIsAvailable = jest.fn();
const hkRequestAuthorization = jest.fn();
const hkQueryQuantitySamples = jest.fn();
const hkQueryWorkoutSamples = jest.fn();
const hkQueryCategorySamples = jest.fn();

jest.mock(
  "@kingstinct/react-native-healthkit",
  () => ({
    isHealthDataAvailable: () => hkIsAvailable(),
    requestAuthorization: (s: unknown, r: unknown) => hkRequestAuthorization(s, r),
    queryQuantitySamples: (id: string, o: unknown) => hkQueryQuantitySamples(id, o),
    queryWorkoutSamples: (o: unknown) => hkQueryWorkoutSamples(o),
    queryCategorySamples: (id: string, o: unknown) => hkQueryCategorySamples(id, o),
  }),
  { virtual: true },
);

import { healthConnectSource } from "../sources/health-connect";
import { healthKitSource } from "../sources/healthkit";

const originalNavigator = globalThis.navigator;

function setNavigatorProduct(product: string | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: product === undefined ? undefined : { product },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
  jest.clearAllMocks();
});

const range = { startIso: "2026-06-12T00:00:00.000Z", endIso: "2026-06-12T23:59:00.000Z" };

describe("health_connect source", () => {
  test("off RN runtime: unavailable, read() empty, native untouched", async () => {
    setNavigatorProduct("Gecko");
    expect(healthConnectSource.isAvailable()).toBe(false);
    expect(await healthConnectSource.read(range)).toEqual([]);
    expect(await healthConnectSource.requestPermission()).toBe("unavailable");
    expect(hcReadRecords).not.toHaveBeenCalled();
  });

  test("on RN runtime: available, read() maps records via the pure mappers", async () => {
    setNavigatorProduct("ReactNative");
    expect(healthConnectSource.isAvailable()).toBe(true);

    hcReadRecords.mockImplementation((type: string) => {
      if (type === "Steps") {
        return Promise.resolve({
          records: [
            { count: 8500, startTime: range.startIso, endTime: range.endIso, metadata: { id: "s1" } },
          ],
        });
      }
      if (type === "ExerciseSession") {
        return Promise.resolve({
          records: [
            {
              startTime: "2026-06-12T08:00:00.000Z",
              endTime: "2026-06-12T08:30:00.000Z",
              exerciseType: 56,
              metadata: { id: "e1" },
            },
          ],
        });
      }
      if (type === "HeartRate") {
        return Promise.resolve({
          records: [
            {
              startTime: "2026-06-12T08:00:00.000Z",
              endTime: "2026-06-12T08:05:00.000Z",
              metadata: { id: "h1" },
              samples: [{ time: "2026-06-12T08:00:00.000Z", beatsPerMinute: 70 }],
            },
          ],
        });
      }
      return Promise.resolve({ records: [] });
    });

    const out = await healthConnectSource.read(range);
    const byType = out.map((s) => `${s.metricType}:${s.value}`).sort();
    expect(byType).toEqual(["heart_rate:70", "steps:8500", "workout:30"].sort());
  });

  test("on RN runtime: one denied record-type does not zero out the granted types", async () => {
    setNavigatorProduct("ReactNative");
    // Health Connect grants are per-type: HeartRate denied → its read rejects
    // (SecurityException) while Steps is granted. The rejected read must not
    // discard the granted Steps data (regression guard for the allSettled fix;
    // Promise.all would have returned []).
    hcReadRecords.mockImplementation((type: string) => {
      if (type === "Steps") {
        return Promise.resolve({
          records: [
            { count: 8500, startTime: range.startIso, endTime: range.endIso, metadata: { id: "s1" } },
          ],
        });
      }
      if (type === "HeartRate") {
        return Promise.reject(new Error("SecurityException: HeartRate permission not granted"));
      }
      return Promise.resolve({ records: [] });
    });

    const out = await healthConnectSource.read(range);
    expect(out.map((s) => `${s.metricType}:${s.value}`)).toEqual(["steps:8500"]);
  });

  test("requestPermission returns granted only when a permission is returned", async () => {
    setNavigatorProduct("ReactNative");
    hcGetSdkStatus.mockResolvedValue(3);
    hcInitialize.mockResolvedValue(true);
    hcRequestPermission.mockResolvedValue([{ accessType: "read", recordType: "Steps" }]);
    expect(await healthConnectSource.requestPermission()).toBe("granted");

    hcRequestPermission.mockResolvedValue([]);
    expect(await healthConnectSource.requestPermission()).toBe("denied");
  });
});

describe("healthkit source", () => {
  test("off RN runtime: unavailable, read() empty, native untouched", async () => {
    setNavigatorProduct("Gecko");
    expect(healthKitSource.isAvailable()).toBe(false);
    expect(await healthKitSource.read(range)).toEqual([]);
    expect(await healthKitSource.requestPermission()).toBe("unavailable");
    expect(hkQueryQuantitySamples).not.toHaveBeenCalled();
  });

  test("on RN runtime: available iff HealthKit reports available", () => {
    setNavigatorProduct("ReactNative");
    hkIsAvailable.mockReturnValue(true);
    expect(healthKitSource.isAvailable()).toBe(true);
    hkIsAvailable.mockReturnValue(false);
    expect(healthKitSource.isAvailable()).toBe(false);
  });

  test("on RN runtime: read() maps quantity/workout/category samples", async () => {
    setNavigatorProduct("ReactNative");
    hkIsAvailable.mockReturnValue(true);
    hkQueryQuantitySamples.mockImplementation((id: string) => {
      if (id === "HKQuantityTypeIdentifierStepCount") {
        return Promise.resolve([
          { uuid: "st1", quantity: 9000, startDate: range.startIso, endDate: range.endIso },
        ]);
      }
      return Promise.resolve([
        { uuid: "hr1", quantity: 66, startDate: range.startIso, endDate: range.startIso },
      ]);
    });
    hkQueryWorkoutSamples.mockResolvedValue([
      {
        uuid: "wk1",
        workoutActivityType: 37,
        duration: { quantity: 1800, unit: "s" },
        startDate: "2026-06-12T08:00:00.000Z",
        endDate: "2026-06-12T08:30:00.000Z",
      },
    ]);
    hkQueryCategorySamples.mockResolvedValue([
      { uuid: "sl1", value: 1, startDate: "2026-06-12T00:00:00.000Z", endDate: "2026-06-12T06:00:00.000Z" },
    ]);

    const out = await healthKitSource.read(range);
    const byType = out.map((s) => `${s.metricType}:${s.value}`).sort();
    expect(byType).toEqual(["heart_rate:66", "sleep:360", "steps:9000", "workout:30"].sort());
  });

  test("on RN runtime: requestPermission authorizes the workout type", async () => {
    setNavigatorProduct("ReactNative");
    hkIsAvailable.mockReturnValue(true);
    hkRequestAuthorization.mockResolvedValue(true);
    await healthKitSource.requestPermission();
    // Without HKWorkoutTypeIdentifier in the read set, queryWorkoutSamples returns
    // empty on a real device and workouts are silently never imported.
    const readTypes = hkRequestAuthorization.mock.calls[0][1] as string[];
    expect(readTypes).toContain("HKWorkoutTypeIdentifier");
  });

  test("on RN runtime: one query rejection does not zero out the other samples", async () => {
    setNavigatorProduct("ReactNative");
    hkIsAvailable.mockReturnValue(true);
    // Steps succeed, the workout query rejects (transient HealthKit error). The
    // rejected query must not discard the granted steps (allSettled regression
    // guard; Promise.all would have returned []).
    hkQueryQuantitySamples.mockImplementation((id: string) =>
      id === "HKQuantityTypeIdentifierStepCount"
        ? Promise.resolve([{ uuid: "st1", quantity: 9000, startDate: range.startIso, endDate: range.endIso }])
        : Promise.resolve([]),
    );
    hkQueryWorkoutSamples.mockRejectedValue(new Error("HealthKit query failed"));
    hkQueryCategorySamples.mockResolvedValue([]);

    const out = await healthKitSource.read(range);
    expect(out.map((s) => `${s.metricType}:${s.value}`)).toEqual(["steps:9000"]);
  });
});
