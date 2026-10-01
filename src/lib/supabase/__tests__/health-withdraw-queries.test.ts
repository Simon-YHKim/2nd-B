// The queries behind turning health_import off: each one is scoped to the owner, the
// deletes ask for an exact count, and the consent reads throw instead of guessing.
const chain: { calls: Array<[string, unknown[]]>; result: { data?: unknown; error: unknown; count?: number | null } } = {
  calls: [],
  result: { error: null },
};

function builder(): unknown {
  const target: Record<string, unknown> = {};
  for (const name of ["select", "delete", "eq", "order", "limit"]) {
    target[name] = (...args: unknown[]) => {
      chain.calls.push([name, args]);
      return proxy;
    };
  }
  target.maybeSingle = () => {
    chain.calls.push(["maybeSingle", []]);
    return Promise.resolve(chain.result);
  };
  target.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(chain.result).then(resolve, reject);
  const proxy = target;
  return proxy;
}

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      chain.calls.push(["from", [table]]);
      return builder();
    },
  }),
}));

import { countHealthSamples, deleteHealthSamplesOfMetric, deleteRemainingHealthSamples } from "../health";
import { latestConsentChange, readPrivacyPrefsStrict } from "../privacy-strict";

beforeEach(() => {
  chain.calls = [];
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
    await expect(deleteRemainingHealthSamples("user-a")).rejects.toThrow("rls");
    await expect(countHealthSamples("user-a")).rejects.toThrow("rls");
  });
});

describe("strict consent reads", () => {
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
});
