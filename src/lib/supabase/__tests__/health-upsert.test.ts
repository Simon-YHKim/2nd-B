// Phase B Slice 1: upsertHealthSamples dedupes on the import key so a re-import
// is a no-op (idempotent). We mock the supabase client and capture the upsert
// shape (onConflict key + RLS-scoped user_id on every row).

const upsertMock = jest.fn();
const selectMock = jest.fn();

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}));

import { upsertHealthSamples } from "../health";
import type { HealthSample } from "../../health/HealthSource";

const sample: HealthSample = {
  source: "manual",
  metricType: "steps",
  value: 9000,
  unit: "count",
  startedAt: "2026-06-12T08:00:00.000Z",
  externalId: "manual-steps-2026-06-12T08:00:00.000Z",
};

describe("upsertHealthSamples dedupe (idempotent re-import)", () => {
  beforeEach(() => {
    selectMock.mockReset().mockResolvedValue({ data: [{ id: "s-1" }], error: null });
    upsertMock.mockReset().mockReturnValue({ select: selectMock });
  });

  test("upserts on the full dedupe key and scopes user_id on the row", async () => {
    await upsertHealthSamples("user-1", [sample]);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsertMock.mock.calls[0];
    expect(rows[0].user_id).toBe("user-1");
    expect(rows[0]).toMatchObject({
      source: "manual",
      metric_type: "steps",
      value: 9000,
      started_at: sample.startedAt,
      external_id: sample.externalId,
    });
    expect(opts).toEqual({ onConflict: "user_id,source,metric_type,started_at,external_id" });
  });

  test("re-importing the same sample carries identical payload (collapses to one row)", async () => {
    await upsertHealthSamples("user-1", [sample]);
    await upsertHealthSamples("user-1", [sample]);
    expect(upsertMock.mock.calls[0][0]).toEqual(upsertMock.mock.calls[1][0]);
    expect(upsertMock.mock.calls[0][1]).toEqual(upsertMock.mock.calls[1][1]);
  });

  test("empty batch short-circuits without a DB call", async () => {
    const out = await upsertHealthSamples("user-1", []);
    expect(out).toEqual([]);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
