// Turning health_import off from the privacy screen deletes what the consent let in
// (PIPA §37③ · §38④). These run the real flow against a small in-memory account: the
// stored prefs, the consent_changes ledger, the health rows per metric and the phone's
// automatic-read marks.
import { abortError } from "../../async/abort";
import { TimeoutError } from "../../async/with-timeout";
import { defaultPrivacyPrefs, type PrivacyPrefs } from "../../privacy/prefs";
import type { HealthMetricType } from "../HealthSource";
import {
  healthCardMode,
  healthWithdrawDeps,
  withdrawHealthImport,
  WITHDRAW_METRICS,
  WITHDRAW_REQUEST_DEADLINE_MS,
  type HealthWithdrawDeps,
} from "../withdraw";

jest.mock("../../persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("../../supabase/health", () => ({
  countHealthSamples: jest.fn(),
  deleteHealthSamplesOfMetric: jest.fn(),
  deleteHealthSamplesOfMetricByWeek: jest.fn(),
  deleteRemainingHealthSamples: jest.fn(),
}));
jest.mock("../../supabase/privacy", () => ({ recordConsentChanges: jest.fn(), savePrivacyPrefs: jest.fn() }));
jest.mock("../../supabase/privacy-strict", () => ({ latestConsentChange: jest.fn(), readPrivacyPrefsStrict: jest.fn() }));
jest.mock("../auto-read", () => ({ forgetHealthAutoReadMarks: jest.fn() }));

const OWNER = "user-a";

interface Account {
  prefs: PrivacyPrefs;
  ledger: Array<"grant" | "revoke">;
  rows: Record<string, number>;
  armed: boolean;
}

interface Fault {
  readFails?: boolean;
  /** Only reads after the first one fail. */
  rereadFails?: boolean;
  /** The server refuses the update. */
  saveFails?: boolean;
  /** The update never answers and has not landed (yet). */
  saveTimesOut?: boolean;
  /** The update lands but its response is lost, so the save's own ledger write never runs. */
  saveLandsThenFails?: boolean;
  /** The save lands but its ledger write fails (it is best effort and swallows that). */
  saveLedgerFails?: boolean;
  /** The single delete of this metric fails (a statement timeout); the week fallback works. */
  bigMetric?: HealthMetricType;
  /** The week fallback fails too. */
  weekFails?: boolean;
  /** A row lands after the deletes (a read that passed the trigger before the OFF). */
  rowReappears?: boolean;
  countFails?: boolean;
  /** The first count fails although every row is gone; the retry answers 0. */
  firstCountFails?: boolean;
  /** The signed-in account changes right after this step. */
  switchAccountAfter?: "save" | "delete-steps";
}

function setup(start: Partial<Account> = {}, fault: Fault = {}) {
  const account: Account = {
    prefs: { ...defaultPrivacyPrefs(), health_import: true, recommendations: true, external_analytics: true },
    ledger: ["grant"],
    rows: { steps: 12, workout: 3, sleep: 7, heart_rate: 40 },
    armed: true,
    ...start,
  };
  const calls: string[] = [];
  const saves: Array<{ prefs: PrivacyPrefs; before: PrivacyPrefs }> = [];
  const known: PrivacyPrefs[] = [];
  let current = true;
  let reads = 0;
  let counts = 0;
  const total = () => Object.values(account.rows).reduce((sum, n) => sum + n, 0);
  const deps: HealthWithdrawDeps = {
    assertCurrent: () => {
      if (!current) throw abortError();
    },
    readPrefs: async () => {
      calls.push("read");
      reads += 1;
      if (fault.readFails || (fault.rereadFails && reads > 1)) throw new Error("network");
      return { ...account.prefs };
    },
    savePrefs: async (_owner, prefs, before) => {
      calls.push("save");
      saves.push({ prefs: { ...prefs }, before: { ...before } });
      if (fault.saveFails) throw new Error("update refused");
      if (fault.saveTimesOut) throw new TimeoutError(WITHDRAW_REQUEST_DEADLINE_MS, "health_withdraw_save");
      account.prefs = { ...prefs };
      if (fault.saveLandsThenFails) throw new Error("response lost");
      if (!fault.saveLedgerFails && before.health_import && !prefs.health_import) account.ledger.push("revoke");
      if (fault.switchAccountAfter === "save") current = false;
    },
    onConsentOff: (prefs) => {
      calls.push("consent-off");
      known.push({ ...prefs });
    },
    ensureRevoke: async () => {
      calls.push("ensure-revoke");
      if (account.ledger.at(-1) !== "revoke") account.ledger.push("revoke");
    },
    disarm: async () => {
      calls.push("disarm");
      account.armed = false;
      return true;
    },
    deleteMetric: async (_owner, metric) => {
      calls.push(`delete:${metric}`);
      if (fault.bigMetric === metric) throw new Error("statement timeout");
      const gone = account.rows[metric] ?? 0;
      account.rows[metric] = 0;
      if (metric === "steps" && fault.switchAccountAfter === "delete-steps") current = false;
      return gone;
    },
    deleteMetricByWeek: async (_owner, metric, assertCurrent) => {
      calls.push(`week:${metric}`);
      assertCurrent();
      if (fault.weekFails) throw new Error("statement timeout");
      const gone = account.rows[metric] ?? 0;
      account.rows[metric] = 0;
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
      counts += 1;
      if (fault.countFails || (fault.firstCountFails && counts === 1)) throw new Error("network");
      return total();
    },
    invalidate: () => {
      calls.push("invalidate");
    },
  };
  return { account, calls, saves, known, deps };
}

describe("withdrawHealthImport", () => {
  test("saves the OFF, hands it on before deleting, then deletes every row and confirms none are left", async () => {
    const { account, calls, known, deps } = setup();
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toEqual({ kind: "done", deleted: 62, exact: true, prefs: { ...account.prefs } });
    expect(account.prefs.health_import).toBe(false);
    expect(account.rows).toEqual({ steps: 0, workout: 0, sleep: 0, heart_rate: 0 });
    expect(account.armed).toBe(false);
    expect(known).toEqual([{ ...account.prefs }]);
    expect(calls).toEqual([
      "read",
      "save",
      "consent-off",
      "ensure-revoke",
      "disarm",
      ...WITHDRAW_METRICS.map((metric) => `delete:${metric}`),
      "delete:rest",
      "count",
      "invalidate",
    ]);
  });

  test("keeps every other consent and hands the strict read to the save as its before", async () => {
    const { saves, deps } = setup();
    await withdrawHealthImport(OWNER, deps);
    const before = { ...defaultPrivacyPrefs(), health_import: true, recommendations: true, external_analytics: true };
    expect(saves).toEqual([{ prefs: { ...before, health_import: false }, before }]);
  });

  test("the ledger ends with exactly one revoke, also when the save's own ledger write failed", async () => {
    const normal = setup();
    await withdrawHealthImport(OWNER, normal.deps);
    expect(normal.account.ledger).toEqual(["grant", "revoke"]);

    const ledgerFailed = setup({}, { saveLedgerFails: true });
    await withdrawHealthImport(OWNER, ledgerFailed.deps);
    expect(ledgerFailed.account.ledger).toEqual(["grant", "revoke"]);
  });

  test("a failed read changes nothing", async () => {
    const { account, calls, deps } = setup({}, { readFails: true });
    expect(await withdrawHealthImport(OWNER, deps)).toEqual({ kind: "unchanged", prefs: null });
    expect(calls).toEqual(["read"]);
    expect(account.prefs.health_import).toBe(true);
    expect(account.armed).toBe(true);
    expect(account.rows.heart_rate).toBe(40);
  });

  test("a refused save is confirmed by a re-read, deletes nothing and is not handed on as off", async () => {
    const { account, calls, deps } = setup({}, { saveFails: true });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toEqual({ kind: "unchanged", prefs: { ...account.prefs } });
    expect(calls).toEqual(["read", "save", "read"]);
    expect(account.armed).toBe(true);
    expect(account.rows.steps).toBe(12);
  });

  test("a save that timed out is never reported as unchanged: it may still land", async () => {
    const { calls, known, deps } = setup({}, { saveTimesOut: true });
    expect(await withdrawHealthImport(OWNER, deps)).toEqual({ kind: "uncertain" });
    expect(calls).toEqual(["read", "save", "read"]);
    expect(known).toEqual([]);
  });

  test("a save whose response was lost is noticed by the re-read; the revoke is still recorded and the deletion goes on", async () => {
    const { account, calls, deps } = setup({}, { saveLandsThenFails: true });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toMatchObject({ kind: "done", deleted: 62 });
    expect(calls.slice(0, 5)).toEqual(["read", "save", "read", "consent-off", "ensure-revoke"]);
    expect(account.ledger).toEqual(["grant", "revoke"]);
    expect(account.rows.heart_rate).toBe(0);
  });

  test("when the save errors and the re-read fails too, the result says it is not known", async () => {
    const { calls, deps } = setup({}, { saveLandsThenFails: true, rereadFails: true });
    expect(await withdrawHealthImport(OWNER, deps)).toEqual({ kind: "uncertain" });
    expect(calls).toEqual(["read", "save", "read"]);
  });

  test("a metric too big for one delete is deleted a week at a time, and the total is marked inexact", async () => {
    const { account, calls, deps } = setup({}, { bigMetric: "heart_rate" });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toMatchObject({ kind: "done", exact: false });
    expect(calls).toContain("week:heart_rate");
    expect(account.rows.heart_rate).toBe(0);
  });

  test("when the week fallback fails too, the consent stays off and what is left is reported", async () => {
    const { account, saves, deps } = setup({}, { bigMetric: "sleep", weekFails: true });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toEqual({ kind: "partial", remaining: 47, prefs: { ...account.prefs } });
    expect(account.prefs.health_import).toBe(false);
    expect(saves.every((save) => save.prefs.health_import === false)).toBe(true);
  });

  test("a row that is back after the deletes is not a success", async () => {
    const { deps } = setup({}, { rowReappears: true });
    expect(await withdrawHealthImport(OWNER, deps)).toMatchObject({ kind: "partial", remaining: 1 });
  });

  test("a lost answer after every row is gone ends as done, without claiming a count", async () => {
    const { deps } = setup({}, { firstCountFails: true });
    expect(await withdrawHealthImport(OWNER, deps)).toMatchObject({ kind: "done", exact: false });
  });

  test("when nothing can be counted the result says so instead of claiming success", async () => {
    const { deps } = setup({}, { bigMetric: "steps", weekFails: true, countFails: true });
    expect(await withdrawHealthImport(OWNER, deps)).toMatchObject({ kind: "partial", remaining: null });
  });

  test("a consent already off is handed on, deletes the rows left behind, and writes nothing to the ledger", async () => {
    const off = { ...defaultPrivacyPrefs(), health_import: false };
    const { account, calls, known, deps } = setup({ prefs: off, ledger: ["grant", "revoke"] });
    const outcome = await withdrawHealthImport(OWNER, deps);
    expect(outcome).toEqual({ kind: "done", deleted: 62, exact: true, prefs: off });
    expect(calls).not.toContain("save");
    expect(calls).not.toContain("ensure-revoke");
    expect(known).toEqual([off]);
    expect(account.ledger).toEqual(["grant", "revoke"]);
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

describe("healthWithdrawDeps", () => {
  const strict = jest.requireMock("../../supabase/privacy-strict");
  const privacy = jest.requireMock("../../supabase/privacy");
  const health = jest.requireMock("../../supabase/health");
  const autoRead = jest.requireMock("../auto-read");
  const levels = jest.requireMock("../../persona/load-domain-levels");

  test("the shipped flow reads strictly, saves with that read as before, and uses the owner-scoped helpers", async () => {
    const before = { ...defaultPrivacyPrefs(), health_import: true };
    const prefs = { ...before, health_import: false };
    strict.readPrivacyPrefsStrict.mockResolvedValue(before);
    privacy.savePrivacyPrefs.mockResolvedValue(undefined);
    health.deleteHealthSamplesOfMetric.mockResolvedValue(3);
    health.deleteRemainingHealthSamples.mockResolvedValue(0);
    health.countHealthSamples.mockResolvedValue(0);
    const onConsentOff = jest.fn();
    const deps = healthWithdrawDeps(() => undefined, onConsentOff);
    expect(await deps.readPrefs(OWNER)).toEqual(before);
    expect(strict.readPrivacyPrefsStrict).toHaveBeenCalledWith(OWNER);
    await deps.savePrefs(OWNER, prefs, before);
    expect(privacy.savePrivacyPrefs).toHaveBeenCalledWith(OWNER, prefs, { before });
    expect(await deps.deleteMetric(OWNER, "steps")).toBe(3);
    expect(health.deleteHealthSamplesOfMetric).toHaveBeenCalledWith(OWNER, "steps");
    await deps.deleteMetricByWeek(OWNER, "heart_rate", deps.assertCurrent);
    expect(health.deleteHealthSamplesOfMetricByWeek).toHaveBeenCalledWith(OWNER, "heart_rate", deps.assertCurrent, WITHDRAW_REQUEST_DEADLINE_MS);
    expect(await deps.count(OWNER)).toBe(0);
    expect(deps.disarm).toBe(autoRead.forgetHealthAutoReadMarks);
    deps.onConsentOff(prefs);
    expect(onConsentOff).toHaveBeenCalledWith(prefs);
    deps.invalidate(OWNER);
    expect(levels.invalidateDomainLevels).toHaveBeenCalledWith(OWNER);
  });

  test("ensureRevoke writes only the health revoke, and only when the ledger does not end in one", async () => {
    const before = { ...defaultPrivacyPrefs(), health_import: true, recommendations: true };
    const deps = healthWithdrawDeps(() => undefined);
    strict.latestConsentChange.mockResolvedValueOnce("revoke");
    privacy.recordConsentChanges.mockClear();
    await deps.ensureRevoke(OWNER, before);
    expect(privacy.recordConsentChanges).not.toHaveBeenCalled();
    strict.latestConsentChange.mockResolvedValueOnce("grant");
    await deps.ensureRevoke(OWNER, before);
    expect(strict.latestConsentChange).toHaveBeenLastCalledWith(OWNER, "health_import");
    expect(privacy.recordConsentChanges).toHaveBeenCalledWith(OWNER, before, { ...before, health_import: false });
  });

  test("a request that never answers fails its step after the deadline", async () => {
    jest.useFakeTimers();
    try {
      strict.readPrivacyPrefsStrict.mockReturnValueOnce(new Promise(() => undefined));
      const read = healthWithdrawDeps(() => undefined).readPrefs(OWNER);
      const settled = read.then(() => "answered", (error: Error) => error.name);
      jest.advanceTimersByTime(WITHDRAW_REQUEST_DEADLINE_MS + 1);
      expect(await settled).toBe("TimeoutError");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("healthCardMode", () => {
  test("a consent that is on always offers the delete, whatever the age", () => {
    expect(healthCardMode({ consent: true, count: 5, minor: false })).toEqual({ kind: "on", count: 5 });
    expect(healthCardMode({ consent: true, count: 5, minor: true })).toEqual({ kind: "on", count: 5 });
    expect(healthCardMode({ consent: true, count: null, minor: true })).toEqual({ kind: "on", count: null });
    expect(healthCardMode({ consent: true, count: "loading", minor: false })).toEqual({ kind: "on", count: null });
  });

  test("rows left behind, or rows that could not be counted, are deletable whatever the age", () => {
    expect(healthCardMode({ consent: false, count: 3, minor: false })).toEqual({ kind: "residue", count: 3 });
    expect(healthCardMode({ consent: false, count: 3, minor: true })).toEqual({ kind: "residue", count: 3 });
    expect(healthCardMode({ consent: false, count: null, minor: false })).toEqual({ kind: "residue", count: null });
    expect(healthCardMode({ consent: false, count: null, minor: true })).toEqual({ kind: "residue", count: null });
  });

  test("off with nothing left: only the pointer to turn it on depends on age", () => {
    expect(healthCardMode({ consent: false, count: 0, minor: false })).toEqual({ kind: "off", locked: false });
    expect(healthCardMode({ consent: false, count: 0, minor: true })).toEqual({ kind: "off", locked: true });
  });

  test("loading and a failed read are their own states, never 'off'", () => {
    expect(healthCardMode({ consent: "loading", count: 4, minor: false })).toEqual({ kind: "loading" });
    expect(healthCardMode({ consent: false, count: "loading", minor: false })).toEqual({ kind: "loading" });
    expect(healthCardMode({ consent: "error", count: 4, minor: false })).toEqual({ kind: "unknown" });
  });
});
