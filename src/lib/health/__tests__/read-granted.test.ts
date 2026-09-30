// readGranted(): the only way an automatic read may reach the OS. It must never raise a
// prompt, read only what is already granted, and say when it could not read everything.
const hcGetSdkStatus = jest.fn();
const hcInitialize = jest.fn();
const hcGetGranted = jest.fn();
const hcRequestPermission = jest.fn();
const hcReadRecords = jest.fn();
let hcHasGranted = true;

jest.mock(
  "react-native-health-connect",
  () => ({
    getSdkStatus: () => hcGetSdkStatus(),
    initialize: () => hcInitialize(),
    requestPermission: (p: unknown) => hcRequestPermission(p),
    readRecords: (type: string, options: unknown) => hcReadRecords(type, options),
    get getGrantedPermissions() {
      return hcHasGranted ? () => hcGetGranted() : undefined;
    },
  }),
  { virtual: true },
);

jest.mock(
  "@kingstinct/react-native-healthkit",
  () => ({
    isHealthDataAvailable: () => true,
    requestAuthorization: jest.fn(),
    queryQuantitySamples: jest.fn(),
    queryWorkoutSamples: jest.fn(),
    queryCategorySamples: jest.fn(),
  }),
  { virtual: true },
);

import { healthConnectSource } from "../sources/health-connect";
import { healthKitSource } from "../sources/healthkit";
import type { HealthMetricType } from "../HealthSource";

const range = { startIso: "2026-09-30T00:00:00.000Z", endIso: "2026-10-01T08:00:00.000Z" };
const AUTO: HealthMetricType[] = ["steps", "workout", "sleep"];
const steps = (id: string, count = 100) => ({ count, startTime: range.startIso, endTime: range.endIso, metadata: { id } });
const read = (type: string) => ({ accessType: "read", recordType: type });

const originalNavigator = globalThis.navigator;
function setProduct(product: string): void {
  Object.defineProperty(globalThis, "navigator", { value: { product }, configurable: true, writable: true });
}

beforeEach(() => {
  setProduct("ReactNative");
  hcHasGranted = true;
  hcGetSdkStatus.mockResolvedValue(3);
  hcInitialize.mockResolvedValue(true);
  hcGetGranted.mockResolvedValue([]);
  hcReadRecords.mockResolvedValue({ records: [] });
});
afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
  jest.clearAllMocks();
});

const readTypes = () => hcReadRecords.mock.calls.map(([type]) => type as string).sort();

test("reads only the granted types among the ones asked for, and never prompts", async () => {
  hcGetGranted.mockResolvedValue([read("Steps"), read("SleepSession"), read("HeartRate")]);
  hcReadRecords.mockImplementation(async (type: string) => ({ records: type === "Steps" ? [steps("s1")] : [] }));
  const result = await healthConnectSource.readGranted?.(range, AUTO);
  expect(result).toEqual({ samples: [expect.objectContaining({ metricType: "steps", value: 100 })], complete: true });
  // HeartRate is granted but not asked for; ExerciseSession is asked for but not granted.
  expect(readTypes()).toEqual(["SleepSession", "Steps"]);
  expect(hcRequestPermission).not.toHaveBeenCalled();
});

test("nothing granted that was asked for, write-only grants or a malformed list: null", async () => {
  hcGetGranted.mockResolvedValue([read("HeartRate")]);
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  hcGetGranted.mockResolvedValue([{ accessType: "write", recordType: "Steps" }, read("Nutrition"), null]);
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  hcGetGranted.mockResolvedValue("not a list");
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  expect(hcReadRecords).not.toHaveBeenCalled();
});

test("missing SDK, failed init, a throw or an old module: null, and still no prompt", async () => {
  hcGetGranted.mockResolvedValue([read("Steps")]);
  hcGetSdkStatus.mockResolvedValueOnce(2);
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  hcInitialize.mockResolvedValueOnce(false);
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  hcGetGranted.mockRejectedValueOnce(new Error("binder"));
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  hcHasGranted = false;
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  expect(hcRequestPermission).not.toHaveBeenCalled();
});

test("a page that fails keeps the pages before it and makes the read incomplete", async () => {
  hcGetGranted.mockResolvedValue([read("Steps"), read("SleepSession")]);
  hcReadRecords.mockImplementation(async (type: string, options: { pageToken?: string }) => {
    if (type !== "Steps") return { records: [] };
    if (!options.pageToken) return { records: [steps("p1", 100)], pageToken: "next" };
    throw new Error("SecurityException: app is in the background");
  });
  const result = await healthConnectSource.readGranted?.(range, AUTO);
  expect(result?.complete).toBe(false);
  expect(result?.samples.map((s) => s.value)).toEqual([100]);
});

test("every page of a granted type is read before the read counts as complete", async () => {
  hcGetGranted.mockResolvedValue([read("Steps")]);
  hcReadRecords.mockImplementation(async (_type: string, options: { pageToken?: string }) =>
    options.pageToken ? { records: [steps("p2", 200)] } : { records: [steps("p1", 100)], pageToken: "next" });
  const result = await healthConnectSource.readGranted?.(range, AUTO);
  expect(result?.complete).toBe(true);
  expect(result?.samples.map((s) => s.value).sort()).toEqual([100, 200]);
});

test("off the React Native runtime (web, jest default) it is always null", async () => {
  setProduct("Gecko");
  await expect(healthConnectSource.readGranted?.(range, AUTO)).resolves.toBeNull();
  expect(hcGetGranted).not.toHaveBeenCalled();
});

test("HealthKit has no silent read until its adapter matches @kingstinct 14", () => {
  expect(healthKitSource.readGranted).toBeUndefined();
});
