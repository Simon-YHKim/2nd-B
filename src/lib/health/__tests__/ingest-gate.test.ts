// Phase B Slice 1: the ingest choke point enforces the consent + minor gate.
// A minor (or an adult who hasn't opted in) is REJECTED before anything is
// written or auto-completed. We mock the persistence + auto-complete so the
// test is pure and asserts they are never reached on rejection.

const upsertMock = jest.fn();
const autoCompleteMock = jest.fn();

jest.mock("../../supabase/health", () => ({
  upsertHealthSamples: (...a: unknown[]) => upsertMock(...a),
}));
jest.mock("../../ops/routines", () => ({
  applyHealthAutoComplete: (...a: unknown[]) => autoCompleteMock(...a),
}));

import {
  HealthImportNotAllowedError,
  healthImportAllowed,
  ingestHealthSamples,
} from "../ingest";
import type { HealthSample } from "../HealthSource";

const sample: HealthSample = {
  source: "mock",
  metricType: "workout",
  value: 30,
  unit: "min",
  startedAt: "2026-06-12T08:00:00.000Z",
  externalId: "x-1",
};

describe("healthImportAllowed gate", () => {
  test("minor only passes when pref is explicitly true (structurally impossible while locked)", () => {
    expect(healthImportAllowed(true, false)).toBe(false);
    expect(healthImportAllowed(true, undefined)).toBe(false);
    expect(healthImportAllowed(true, null)).toBe(false);
  });

  test("adult must have opted in (pref true); OFF default is rejected", () => {
    expect(healthImportAllowed(false, false)).toBe(false);
    expect(healthImportAllowed(false, true)).toBe(true);
  });
});

describe("ingestHealthSamples enforces the gate at the single choke point", () => {
  beforeEach(() => {
    upsertMock.mockReset().mockResolvedValue([{ id: "s-1", metric_type: "workout", value: 30, started_at: sample.startedAt }]);
    autoCompleteMock.mockReset().mockResolvedValue(["r-ex"]);
  });

  test("REJECTS a minor (health_import server-locked OFF): nothing is written, no auto-complete runs", async () => {
    // health_import is seeded false (0050) and non-promotable, so a minor's
    // resolved pref is always false here. The gate rejects before any write.
    await expect(
      ingestHealthSamples("user-1", [sample], { isMinor: true, pref: false }),
    ).rejects.toBeInstanceOf(HealthImportNotAllowedError);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(autoCompleteMock).not.toHaveBeenCalled();
  });

  test("REJECTS an adult who has not opted in", async () => {
    await expect(
      ingestHealthSamples("user-1", [sample], { isMinor: false, pref: false }),
    ).rejects.toBeInstanceOf(HealthImportNotAllowedError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("an opted-in adult ingests: upsert + auto-complete run", async () => {
    const res = await ingestHealthSamples("user-1", [sample], { isMinor: false, pref: true });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(autoCompleteMock).toHaveBeenCalledTimes(1);
    expect(res.autoCompleted).toEqual(["r-ex"]);
  });
});
