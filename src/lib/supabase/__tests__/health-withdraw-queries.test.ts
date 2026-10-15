// The queries behind turning health_import off: each one is scoped to the owner, the
// deletes ask for an exact count, and the consent read throws instead of guessing.
type Result = { data?: unknown; error: unknown; count?: number | null };
const chain: { calls: Array<[string, unknown[]]>; queue: Result[]; result: Result } = {
  calls: [],
  queue: [],
  result: { error: null },
};

function next(): Result {
  return chain.queue.length > 0 ? (chain.queue.shift() as Result) : chain.result;
}

function builder(): unknown {
  const target: Record<string, unknown> = {};
  for (const name of ["select", "delete", "eq", "lt", "order", "limit"]) {
    target[name] = (...args: unknown[]) => {
      chain.calls.push([name, args]);
      return target;
    };
  }
  target.maybeSingle = () => {
    chain.calls.push(["maybeSingle", []]);
    const result = next() as Result & { hang?: boolean };
    return result.hang ? new Promise(() => undefined) : Promise.resolve(result);
  };
  target.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);
  return target;
}

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      chain.calls.push(["from", [table]]);
      return builder();
    },
  }),
}));

import {
  countHealthSamples,
  deleteHealthSamplesOfMetric,
  deleteHealthSamplesOfMetricByWeek,
  deleteRemainingHealthSamples,
} from "../health";
import { latestConsentChange, readPrivacyPrefsStrict } from "../privacy-strict";

beforeEach(() => {
  chain.calls = [];
  chain.queue = [];
  chain.result = { error: null };
});

describe("health_samples withdrawal queries", () => {
  test("deletes one metric of one owner and returns the exact count", async () => {
    chain.result = { error: null, count: 9 };
    expect(await deleteHealthSamplesOfMetric("user-a", "heart_rate")).toBe(9);
    expect(chain.calls).toEqual([
      ["from", ["health_samples"]],
      ["delete", [{ count: "exact" }]],
      ["eq", ["user_id", "user-a"]],
      ["eq", ["metric_type", "heart_rate"]],
    ]);
  });

  test("the week fallback deletes from the oldest sample a week at a time until none is left", async () => {
    const oldest = "2026-01-01T00:00:00.000Z";
    const second = "2026-01-09T08:00:00.000Z";
    chain.queue = [
      { error: null, data: { started_at: oldest } },
      { error: null, count: 300 },
      { error: null, data: { started_at: second } },
      { error: null, count: 120 },
      { error: null, data: null },
    ];
    let checks = 0;
    const deleted = await deleteHealthSamplesOfMetricByWeek("user-a", "heart_rate", () => {
      checks += 1;
    });
    expect(deleted).toBe(420);
    expect(checks).toBe(5);
    const firstRound = chain.calls.slice(0, 13);
    expect(firstRound).toEqual([
      ["from", ["health_samples"]],
      ["select", ["started_at"]],
      ["eq", ["user_id", "user-a"]],
      ["eq", ["metric_type", "heart_rate"]],
      ["order", ["started_at", { ascending: true }]],
      ["limit", [1]],
      ["maybeSingle", []],
      ["from", ["health_samples"]],
      ["delete", [{ count: "exact" }]],
      ["eq", ["user_id", "user-a"]],
      ["eq", ["metric_type", "heart_rate"]],
      ["lt", ["started_at", "2026-01-08T00:00:00.000Z"]],
      ["from", ["health_samples"]],
    ]);
    expect(chain.calls.filter(([name]) => name === "lt")).toEqual([
      ["lt", ["started_at", "2026-01-08T00:00:00.000Z"]],
      ["lt", ["started_at", "2026-01-16T08:00:00.000Z"]],
    ]);
  });

  test("the week fallback gives each request a deadline when asked to", async () => {
    jest.useFakeTimers();
    try {
      chain.queue = [{ hang: true } as unknown as Result];
      const run = deleteHealthSamplesOfMetricByWeek("user-a", "heart_rate", () => undefined, 1000);
      const settled = run.then(() => "answered", (error: Error) => error.name);
      jest.advanceTimersByTime(1001);
      expect(await settled).toBe("TimeoutError");
    } finally {
      jest.useRealTimers();
    }
  });

  test("the week fallback stops when the account changes", async () => {
    chain.queue = [{ error: null, data: { started_at: "2026-01-01T00:00:00.000Z" } }];
    await expect(deleteHealthSamplesOfMetricByWeek("user-a", "steps", () => {
      throw new Error("aborted");
    })).rejects.toThrow("aborted");
    expect(chain.calls.some(([name]) => name === "delete")).toBe(false);
  });

  test("the catch-all delete is still scoped to the owner", async () => {
    chain.result = { error: null, count: 2 };
    expect(await deleteRemainingHealthSamples("user-a")).toBe(2);
    expect(chain.calls).toEqual([
      ["from", ["health_samples"]],
      ["delete", [{ count: "exact" }]],
      ["eq", ["user_id", "user-a"]],
    ]);
  });

  test("counting is a head request for one owner", async () => {
    chain.result = { error: null, count: 4 };
    expect(await countHealthSamples("user-a")).toBe(4);
    expect(chain.calls).toEqual([
      ["from", ["health_samples"]],
      ["select", ["id", { count: "exact", head: true }]],
      ["eq", ["user_id", "user-a"]],
    ]);
  });

  test("errors are thrown, never read as zero", async () => {
    chain.result = { error: new Error("rls"), count: null };
    await expect(deleteHealthSamplesOfMetric("user-a", "steps")).rejects.toThrow("rls");
    await expect(deleteHealthSamplesOfMetricByWeek("user-a", "steps", () => undefined)).rejects.toThrow("rls");
    await expect(deleteRemainingHealthSamples("user-a")).rejects.toThrow("rls");
    await expect(countHealthSamples("user-a")).rejects.toThrow("rls");
  });
});

describe("strict consent reads", () => {
  test("the latest ledger row for one key, newest first", async () => {
    chain.result = { error: null, data: { event_type: "revoke" } };
    expect(await latestConsentChange("user-a", "health_import")).toBe("revoke");
    expect(chain.calls).toEqual([
      ["from", ["consent_changes"]],
      ["select", ["event_type"]],
      ["eq", ["user_id", "user-a"]],
      ["eq", ["pref_key", "health_import"]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [1]],
      ["maybeSingle", []],
    ]);
    chain.result = { error: null, data: null };
    expect(await latestConsentChange("user-a", "health_import")).toBeNull();
    chain.result = { error: new Error("network"), data: null };
    await expect(latestConsentChange("user-a", "health_import")).rejects.toThrow("network");
  });

  test("reads the stored prefs of one owner", async () => {
    chain.result = { error: null, data: { privacy_prefs: { health_import: true } } };
    const prefs = await readPrivacyPrefsStrict("user-a");
    expect(prefs.health_import).toBe(true);
    expect(chain.calls).toEqual([
      ["from", ["users"]],
      ["select", ["privacy_prefs"]],
      ["eq", ["id", "user-a"]],
      ["maybeSingle", []],
    ]);
  });

  test("a failed or empty read throws instead of turning into the all-off defaults", async () => {
    chain.result = { error: new Error("network"), data: null };
    await expect(readPrivacyPrefsStrict("user-a")).rejects.toThrow("network");
    chain.result = { error: null, data: null };
    await expect(readPrivacyPrefsStrict("user-a")).rejects.toThrow("privacy_prefs_row_missing");
  });
});
