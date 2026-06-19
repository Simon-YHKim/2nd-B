// Phase B Slice 2: the PURE record -> HealthSample mappers are unit-tested with
// NO native module. Each metric type maps to the right metricType + unit, the
// externalId comes from the provider record id (so re-import dedupes), and
// dedupeByExternalId drops repeats while keeping id-less samples.

import {
  dedupeByExternalId,
  mapHealthConnectExercise,
  mapHealthConnectHeartRate,
  mapHealthConnectSleep,
  mapHealthConnectSteps,
  mapHealthKitHeartRate,
  mapHealthKitSleep,
  mapHealthKitSteps,
  mapHealthKitWorkout,
} from "../sources/mappers";
import type { HealthSample } from "../HealthSource";

describe("Health Connect mappers", () => {
  test("steps -> steps/count, externalId from record id", () => {
    const s = mapHealthConnectSteps({
      count: 8500,
      startTime: "2026-06-12T00:00:00.000Z",
      endTime: "2026-06-12T23:59:00.000Z",
      metadata: { id: "hc-steps-1" },
    });
    expect(s.source).toBe("health_connect");
    expect(s.metricType).toBe("steps");
    expect(s.value).toBe(8500);
    expect(s.unit).toBe("count");
    expect(s.startedAt).toBe("2026-06-12T00:00:00.000Z");
    expect(s.endedAt).toBe("2026-06-12T23:59:00.000Z");
    expect(s.externalId).toBe("hc-steps-1");
  });

  test("exercise -> workout/min with computed minutes and workout_kind metadata", () => {
    const s = mapHealthConnectExercise({
      startTime: "2026-06-12T08:00:00.000Z",
      endTime: "2026-06-12T08:30:00.000Z",
      exerciseType: 56,
      metadata: { id: "hc-ex-1" },
    });
    expect(s.metricType).toBe("workout");
    expect(s.unit).toBe("min");
    expect(s.value).toBe(30);
    expect(s.metadata).toEqual({ workout_kind: 56 });
    expect(s.externalId).toBe("hc-ex-1");
  });

  test("exercise with missing kind keeps workout_kind null (never undefined)", () => {
    const s = mapHealthConnectExercise({
      startTime: "2026-06-12T08:00:00.000Z",
      endTime: "2026-06-12T09:00:00.000Z",
      metadata: { id: "hc-ex-2" },
    });
    expect(s.value).toBe(60);
    expect(s.metadata).toEqual({ workout_kind: null });
  });

  test("sleep -> sleep/min over the in-bed window", () => {
    const s = mapHealthConnectSleep({
      startTime: "2026-06-12T00:00:00.000Z",
      endTime: "2026-06-12T07:00:00.000Z",
      metadata: { id: "hc-sleep-1" },
    });
    expect(s.metricType).toBe("sleep");
    expect(s.unit).toBe("min");
    expect(s.value).toBe(420);
    expect(s.externalId).toBe("hc-sleep-1");
  });

  test("heart rate -> one heart_rate/bpm per reading, externalId = recordId:time", () => {
    const out = mapHealthConnectHeartRate({
      startTime: "2026-06-12T08:00:00.000Z",
      endTime: "2026-06-12T08:10:00.000Z",
      metadata: { id: "hc-hr-1" },
      samples: [
        { time: "2026-06-12T08:00:00.000Z", beatsPerMinute: 60 },
        { time: "2026-06-12T08:05:00.000Z", beatsPerMinute: 72 },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ metricType: "heart_rate", unit: "bpm", value: 60 });
    expect(out[0].externalId).toBe("hc-hr-1:2026-06-12T08:00:00.000Z");
    expect(out[1].externalId).toBe("hc-hr-1:2026-06-12T08:05:00.000Z");
  });

  test("missing record id yields undefined externalId (still mappable)", () => {
    const s = mapHealthConnectSteps({
      count: 100,
      startTime: "2026-06-12T00:00:00.000Z",
      endTime: "2026-06-12T01:00:00.000Z",
      metadata: null,
    });
    expect(s.externalId).toBeUndefined();
  });
});

describe("HealthKit mappers", () => {
  test("step count -> steps/count, externalId from uuid; Date in -> ISO out", () => {
    const s = mapHealthKitSteps({
      uuid: "hk-steps-1",
      quantity: 9000,
      startDate: new Date("2026-06-12T00:00:00.000Z"),
      endDate: new Date("2026-06-12T23:59:00.000Z"),
    });
    expect(s.source).toBe("healthkit");
    expect(s.metricType).toBe("steps");
    expect(s.unit).toBe("count");
    expect(s.value).toBe(9000);
    expect(s.startedAt).toBe("2026-06-12T00:00:00.000Z");
    expect(s.externalId).toBe("hk-steps-1");
  });

  test("heart rate -> heart_rate/bpm", () => {
    const s = mapHealthKitHeartRate({
      uuid: "hk-hr-1",
      quantity: 68,
      startDate: "2026-06-12T08:00:00.000Z",
      endDate: "2026-06-12T08:00:00.000Z",
    });
    expect(s.metricType).toBe("heart_rate");
    expect(s.unit).toBe("bpm");
    expect(s.value).toBe(68);
  });

  test("workout -> workout/min using the reported duration in seconds, kind metadata", () => {
    const s = mapHealthKitWorkout({
      uuid: "hk-wk-1",
      workoutActivityType: 37,
      duration: { quantity: 1800, unit: "s" },
      startDate: "2026-06-12T08:00:00.000Z",
      endDate: "2026-06-12T08:30:00.000Z",
    });
    expect(s.metricType).toBe("workout");
    expect(s.unit).toBe("min");
    expect(s.value).toBe(30);
    expect(s.metadata).toEqual({ workout_kind: 37 });
  });

  test("workout falls back to start/end span when duration is absent/zero", () => {
    const s = mapHealthKitWorkout({
      uuid: "hk-wk-2",
      workoutActivityType: 1,
      duration: { quantity: 0, unit: "s" },
      startDate: "2026-06-12T08:00:00.000Z",
      endDate: "2026-06-12T08:45:00.000Z",
    });
    expect(s.value).toBe(45);
  });

  test("sleep analysis -> sleep/min over the span", () => {
    const s = mapHealthKitSleep({
      uuid: "hk-sleep-1",
      value: 1,
      startDate: "2026-06-12T00:00:00.000Z",
      endDate: "2026-06-12T06:30:00.000Z",
    });
    expect(s.metricType).toBe("sleep");
    expect(s.unit).toBe("min");
    expect(s.value).toBe(390);
    expect(s.externalId).toBe("hk-sleep-1");
  });
});

describe("dedupeByExternalId", () => {
  const mk = (externalId: string | undefined, value: number): HealthSample => ({
    source: "healthkit",
    metricType: "steps",
    value,
    unit: "count",
    startedAt: "2026-06-12T00:00:00.000Z",
    externalId,
  });

  test("keeps the first of each externalId, drops later repeats", () => {
    const out = dedupeByExternalId([mk("a", 1), mk("b", 2), mk("a", 3)]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.value)).toEqual([1, 2]);
  });

  test("always keeps samples without an externalId", () => {
    const out = dedupeByExternalId([mk(undefined, 1), mk(undefined, 2), mk("a", 3), mk("a", 4)]);
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.value)).toEqual([1, 2, 3]);
  });
});
