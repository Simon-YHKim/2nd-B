// Turning health_import off from the privacy screen deletes what the consent let in
// (PIPA §37③ · §38④). These run the real flow against a small in-memory account: the
// stored prefs, the health rows per metric, the consent_changes ledger and the phone's
// automatic-read marks.
import { abortError } from "../../async/abort";
import { defaultPrivacyPrefs, type PrivacyPrefs } from "../../privacy/prefs";
import type { HealthMetricType } from "../HealthSource";
import { healthCardMode, withdrawHealthImport, WITHDRAW_METRICS, type HealthWithdrawDeps } from "../withdraw";

jest.mock("../../persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("../../supabase/health", () => ({}));
jest.mock("../../supabase/privacy", () => ({}));
jest.mock("../../supabase/privacy-strict", () => ({}));
jest.mock("../auto-read", () => ({}));

const OWNER = "user-a";

interface Account {
  prefs: PrivacyPrefs;
  rows: Record<string, number>;
  ledger: Array<"grant" | "revoke">;
  armed: boolean;
}

interface Fault {
  readFails?: boolean;
  saveFails?: boolean;
  /** savePrivacyPrefs' own before-read fell back to the defaults, so it wrote no revoke row. */
  saveSkipsLedger?: boolean;
  deleteFailsOn?: HealthMetricType;
  /** A row lands after the deletes (a read that passed the trigger before the OFF). */
  rowReappears?: boolean;
  countFails?: boolean;
  /** The signed-in account changes right after this step. */
  switchAccountAfter?: "save" | "delete-steps";
}

function setup(start: Partial<Account> = {}, fault: Fault = {}) {
  const account: Account = {
    prefs: { ...defaultPrivacyPrefs(), health_import: true, recommendations: true, external_analytics: true },
    rows: { steps: 12, workout: 3, sleep: 7, heart_rate: 40 },
    ledger: ["grant"],
    armed: true,
    ...start,
  };
  const calls: string[] = [];
  const saves: PrivacyPrefs[] = [];
  let current = true;
  const total = () => Object.values(account.rows).reduce((sum, n) => sum + n, 0);
  const deps: HealthWithdrawDeps = {
    assertCurrent: () => {
      if (!current) throw abortError();
    },
    readPrefs: async () => {
      calls.push("read");
      if (fault.readFails) throw new Error("network");
      return { ...account.prefs };
    },
    savePrefs: async (_owner, prefs) => {
      calls.push("save");
      saves.push({ ...prefs });
      if (fault.saveFails) throw new Error("update failed");
      const before = account.prefs;
      account.prefs = { ...prefs };
      if (!fault.saveSkipsLedger && before.health_import && !prefs.health_import) account.ledger.push("revoke");
      if (fault.switchAccountAfter === "save") current = false;
    },
    latestRevokeOrGrant: async () => {
      calls.push("ledger-read");
      return account.ledger.at(-1) ?? null;
    },
    recordChanges: async (_owner, before, after) => {
      calls.push("ledger-write");
      if (before.health_import && !after.health_import) account.ledger.push("revoke");
    },
    disarm: async () => {
      calls.push("disarm");
      account.armed = false;
      return true;
    },
    deleteMetric: async (_owner, metric) => {
      calls.push(`delete:${metric}`);
      if (fault.deleteFailsOn === metric) throw new Error("statement timeout");
      const gone = account.rows[metric] ?? 0;
      account.rows[metric] = 0;
      if (metric === "steps" && fault.switchAccountAfter === "delete-steps") current = false;
      return gone;
    },
    deleteRest: async () => {
      calls.push("delete:rest");
      const gone = total();
      for (const key of Object.keys(account.rows)) account.rows[key] = 0;
      if (fault.rowReappears) account.rows.steps = 1;
      return gone;
    },
    count: async () => {
      calls.push("count");
      if (fault.countFails) throw new Error("network");
      return total();
    },
    invalidate: () => {
      calls.push("invalidate");
    },
  };
  return { account, calls, saves, deps };
}

describe("withdrawHealthImport", () => {
  test("saves the OFF first, then deletes every row and confirms none are left", async () => {
    const { account, calls, deps } = setup();
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toEqual({ kind: "done", deleted: 62, saved: { ...account.prefs } });
    expect(account.prefs.health_import).toBe(false);
    expect(account.rows).toEqual({ steps: 0, workout: 0, sleep: 0, heart_rate: 0 });
    expect(account.armed).toBe(false);
    expect(calls).toEqual([
      "read",
      "save",
      "ledger-read",
      "disarm",
      ...WITHDRAW_METRICS.map((metric) => `delete:${metric}`),
      "delete:rest",
      "count",
      "invalidate",
    ]);
  });

  test("keeps every other consent exactly as it was", async () => {
    const { saves, deps } = setup();
    await withdrawHealthImport(OWNER, deps);
    expect(saves).toEqual([{ ...defaultPrivacyPrefs(), health_import: false, recommendations: true, external_analytics: true }]);
  });

  test("records one revoke in the ledger, adding it only when the save could not", async () => {
    const recorded = setup();
    await withdrawHealthImport(OWNER, recorded.deps);
    expect(recorded.account.ledger).toEqual(["grant", "revoke"]);
    expect(recorded.calls).not.toContain("ledger-write");

    const skipped = setup({}, { saveSkipsLedger: true });
    await withdrawHealthImport(OWNER, skipped.deps);
    expect(skipped.account.ledger).toEqual(["grant", "revoke"]);
    expect(skipped.calls).toContain("ledger-write");
  });

  test("a failed read changes nothing", async () => {
    const { account, calls, deps } = setup({}, { readFails: true });
    expect(await withdrawHealthImport(OWNER, deps)).toEqual({ kind: "unchanged" });
    expect(calls).toEqual(["read"]);
    expect(account.prefs.health_import).toBe(true);
    expect(account.armed).toBe(true);
    expect(account.rows.heart_rate).toBe(40);
  });

  test("a failed save deletes nothing and keeps the automatic read armed", async () => {
    const { account, calls, deps } = setup({}, { saveFails: true });
    expect(await withdrawHealthImport(OWNER, deps)).toEqual({ kind: "unchanged" });
    expect(calls).toEqual(["read", "save"]);
    expect(account.armed).toBe(true);
    expect(account.rows.steps).toBe(12);
  });

  test("a delete that fails half way keeps the consent off and reports what is left", async () => {
    const { account, saves, deps } = setup({}, { deleteFailsOn: "sleep" });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toEqual({ kind: "partial", remaining: 47, saved: { ...account.prefs } });
    expect(account.prefs.health_import).toBe(false);
    expect(saves.every((prefs) => prefs.health_import === false)).toBe(true);
  });

  test("a row that is back after the deletes is not a success", async () => {
    const { deps } = setup({}, { rowReappears: true });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome.kind).toBe("partial");
    expect(outcome.kind === "partial" && outcome.remaining).toBe(1);
  });

  test("when nothing can be counted the result says so instead of claiming success", async () => {
    const { deps } = setup({}, { deleteFailsOn: "steps", countFails: true });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toMatchObject({ kind: "partial", remaining: null });
  });

  test("a consent already off still deletes the rows left behind, without saving or logging", async () => {
    const { account, calls, deps } = setup({ prefs: { ...defaultPrivacyPrefs(), health_import: false } });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toEqual({ kind: "done", deleted: 62, saved: null });
    expect(calls).not.toContain("save");
    expect(calls).not.toContain("ledger-read");
    expect(account.ledger).toEqual(["grant"]);
  });

  test("stops at once when the signed-in account changes", async () => {
    const afterSave = setup({}, { switchAccountAfter: "save" });
    expect(await withdrawHealthImport(OWNER, afterSave.deps)).toEqual({ kind: "aborted" });
    expect(afterSave.calls).toEqual(["read", "save"]);

    const midDelete = setup({}, { switchAccountAfter: "delete-steps" });
    expect(await withdrawHealthImport(OWNER, midDelete.deps)).toEqual({ kind: "aborted" });
    expect(midDelete.calls.at(-1)).toBe("delete:steps");
  });

  test("an account that was already gone changes nothing", async () => {
    const { calls, deps } = setup();
    deps.assertCurrent = () => {
      throw abortError();
    };
    expect(await withdrawHealthImport(OWNER, deps)).toEqual({ kind: "aborted" });
    expect(calls).toEqual([]);
  });
});

describe("healthCardMode", () => {
  test("a consent that is on always offers the delete, whatever the age", () => {
    expect(healthCardMode({ consent: true, count: 5, minor: false })).toEqual({ kind: "on", count: 5 });
    expect(healthCardMode({ consent: true, count: 5, minor: true })).toEqual({ kind: "on", count: 5 });
    expect(healthCardMode({ consent: true, count: null, minor: true })).toEqual({ kind: "on", count: null });
  });

  test("rows left behind are shown and deletable, whatever the age", () => {
    expect(healthCardMode({ consent: false, count: 3, minor: false })).toEqual({ kind: "residue", count: 3 });
    expect(healthCardMode({ consent: false, count: 3, minor: true })).toEqual({ kind: "residue", count: 3 });
  });

  test("off with nothing left: only the pointer to turn it on depends on age", () => {
    expect(healthCardMode({ consent: false, count: 0, minor: false })).toEqual({ kind: "off", locked: false });
    expect(healthCardMode({ consent: false, count: 0, minor: true })).toEqual({ kind: "off", locked: true });
    expect(healthCardMode({ consent: false, count: null, minor: false })).toEqual({ kind: "off", locked: false });
  });

  test("loading and a failed read are their own states, never 'off'", () => {
    expect(healthCardMode({ consent: "loading", count: 4, minor: false })).toEqual({ kind: "loading" });
    expect(healthCardMode({ consent: "error", count: 4, minor: false })).toEqual({ kind: "unknown" });
  });
});
