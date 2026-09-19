// task B1: users.privacy_prefs read/write. fetchPrivacyPrefs must be fail-soft
// (a missing column / table before the 0032 migration resolves to defaults);
// savePrivacyPrefs must propagate write errors so the screen can revert.
//
// D-3: savePrivacyPrefs also snapshots the before-state and appends one
// consent_changes row per toggled key (grant/revoke) after a successful write.

jest.mock("../client", () => {
  const maybeSingle = jest.fn();
  const eqSelect = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq: eqSelect }));
  const eqUpdate = jest.fn();
  const update = jest.fn(() => ({ eq: eqUpdate }));
  const insert = jest.fn();
  const from = jest.fn(() => ({ select, update, insert }));
  const mock = { from };
  return {
    getSupabaseClient: () => mock,
    __mock: mock,
    __maybeSingle: maybeSingle,
    __select: select,
    __update: update,
    __eqUpdate: eqUpdate,
    __insert: insert,
  };
});

import { fetchPrivacyPrefs, readPrivacyPrefs, savePrivacyPrefs } from "../privacy";
import { defaultPrivacyPrefs } from "../../privacy/prefs";

const { __mock, __maybeSingle, __update, __eqUpdate, __insert } = require("../client") as {
  __mock: { from: jest.Mock };
  __maybeSingle: jest.Mock;
  __update: jest.Mock;
  __eqUpdate: jest.Mock;
  __insert: jest.Mock;
};

// Point the before-state read at a known stored prefs object so the grant/revoke
// diff is deterministic across the save tests.
function mockBeforeState(stored: Record<string, boolean>): void {
  __maybeSingle.mockResolvedValueOnce({ data: { privacy_prefs: stored }, error: null });
}

describe("fetchPrivacyPrefs (fail-soft)", () => {
  beforeEach(() => {
    __mock.from.mockClear();
    __maybeSingle.mockReset();
  });

  test("resolves stored prefs over the defaults", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: { privacy_prefs: { ads: true, sharing: true } }, error: null });
    const prefs = await fetchPrivacyPrefs("u1");
    expect(__mock.from).toHaveBeenCalledWith("users");
    expect(prefs.ads).toBe(true);
    expect(prefs.sharing).toBe(true);
    expect(prefs.recommendations).toBe(false); // unset -> default
  });

  test("a DB error (e.g. column missing pre-migration) falls back to all-off defaults", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("column users.privacy_prefs does not exist") });
    const prefs = await fetchPrivacyPrefs("u1");
    expect(prefs).toEqual(defaultPrivacyPrefs());
  });

  test("no row resolves to defaults", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchPrivacyPrefs("u1")).toEqual(defaultPrivacyPrefs());
  });
});

// r3as F-04: fetchPrivacyPrefs turns every read failure into all-off defaults. That is
// right for a gate (cannot read -> do not act) and wrong for a switch: the settings
// screen would draw OFF for a user whose saved value is ON, and a tap would then save ON
// instead of withdrawing. Switches read through readPrivacyPrefs, which keeps "could not
// read" apart from a stored OFF.
describe("readPrivacyPrefs (a failed read is not a stored OFF)", () => {
  beforeEach(() => {
    __mock.from.mockClear();
    __maybeSingle.mockReset();
  });

  test("a successful read comes back ok with the resolved prefs", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: { privacy_prefs: { chat_autosave: true } }, error: null });
    const read = await readPrivacyPrefs("u1");
    expect(read.ok).toBe(true);
    expect(read.ok && read.prefs.chat_autosave).toBe(true);
    expect(read.ok && read.prefs.ads).toBe(false); // unset -> default, as before
  });

  test("a DB error comes back as not ok - no defaults are invented", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("network down") });
    expect(await readPrivacyPrefs("u1")).toEqual({ ok: false });
  });

  test("a rejected request is not ok either", async () => {
    __maybeSingle.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await readPrivacyPrefs("u1")).toEqual({ ok: false });
  });

  test("control: the gate read stays fail-soft for the same failure", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("network down") });
    expect(await fetchPrivacyPrefs("u1")).toEqual(defaultPrivacyPrefs());
  });

  // r3as2 R3AS2-04: the chat screen runs this read right before every automatic save, so a
  // failure line lands in the device log on a hot path. The remote message is not ours to
  // copy there (an SDK or a proxy can put request detail in it); only a fixed category is.
  test("a failed read logs a fixed category, never the remote error text", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      __maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("network down for u1 at /rest/v1/users") });
      expect(await readPrivacyPrefs("u1")).toEqual({ ok: false });
      __maybeSingle.mockRejectedValueOnce(new Error("fetch failed: token abc123"));
      expect(await readPrivacyPrefs("u1")).toEqual({ ok: false });

      const calls = warn.mock.calls.map((call) => call.map((part) => String(part)));
      expect(calls).toHaveLength(2);
      expect(calls.flat().join(" ")).not.toMatch(/network down|fetch failed|u1|rest\/v1|abc123/);
      expect(calls.map((call) => call.at(-1))).toEqual(["query_error", "request_failed"]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("savePrivacyPrefs", () => {
  beforeEach(() => {
    __mock.from.mockClear();
    __maybeSingle.mockReset();
    __update.mockClear();
    __eqUpdate.mockReset();
    __insert.mockReset();
  });

  test("writes the full prefs object and resolves on success", async () => {
    mockBeforeState({}); // before = all-off defaults
    __eqUpdate.mockResolvedValueOnce({ error: null });
    __insert.mockResolvedValueOnce({ error: null });
    const prefs = { ...defaultPrivacyPrefs(), long_term_memory: true };
    await savePrivacyPrefs("u1", prefs);
    expect(__update).toHaveBeenCalledWith({ privacy_prefs: prefs });
    expect(__eqUpdate).toHaveBeenCalledWith("id", "u1");
  });

  test("propagates a write error so the caller can revert (and records no change)", async () => {
    mockBeforeState({});
    __eqUpdate.mockResolvedValueOnce({ error: new Error("rls denied") });
    await expect(savePrivacyPrefs("u1", defaultPrivacyPrefs())).rejects.toThrow("rls denied");
    expect(__insert).not.toHaveBeenCalled(); // a failed save is not a consent change
  });
});

describe("savePrivacyPrefs -> consent_changes ledger (D-3)", () => {
  beforeEach(() => {
    __mock.from.mockClear();
    __maybeSingle.mockReset();
    __eqUpdate.mockReset();
    __insert.mockReset();
    __eqUpdate.mockResolvedValue({ error: null });
    __insert.mockResolvedValue({ error: null });
  });

  test("a grant (false -> true) appends one 'grant' row for that key", async () => {
    mockBeforeState({ recommendations: false });
    await savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), recommendations: true });
    expect(__mock.from).toHaveBeenCalledWith("consent_changes");
    expect(__insert).toHaveBeenCalledWith([
      { user_id: "u1", pref_key: "recommendations", event_type: "grant" },
    ]);
  });

  test("a revoke (true -> false) appends one 'revoke' row — the withdrawal record", async () => {
    mockBeforeState({ ads: true });
    await savePrivacyPrefs("u1", defaultPrivacyPrefs()); // ads flips back to false
    expect(__insert).toHaveBeenCalledWith([{ user_id: "u1", pref_key: "ads", event_type: "revoke" }]);
  });

  test("multiple toggled keys append one row each; unchanged keys are ignored", async () => {
    mockBeforeState({ ads: true, recommendations: false, ops_push: true });
    await savePrivacyPrefs("u1", {
      ...defaultPrivacyPrefs(),
      ads: true, // unchanged -> no row
      recommendations: true, // grant
      ops_push: false, // revoke
    });
    const rows = __insert.mock.calls[0][0] as Array<{ pref_key: string; event_type: string }>;
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ user_id: "u1", pref_key: "recommendations", event_type: "grant" });
    expect(rows).toContainEqual({ user_id: "u1", pref_key: "ops_push", event_type: "revoke" });
  });

  test("no net change appends nothing (no ledger noise on a no-op save)", async () => {
    mockBeforeState({ ads: true });
    await savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), ads: true });
    expect(__insert).not.toHaveBeenCalled();
  });

  test("a ledger-append failure never breaks the save (best-effort)", async () => {
    mockBeforeState({ recommendations: false });
    __insert.mockResolvedValueOnce({ error: new Error("consent_changes missing pre-migration") });
    await expect(
      savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), recommendations: true }),
    ).resolves.toBeUndefined();
  });
});

// H9: health/activity data is PIPA §23 민감정보 and the privacy policy says it is
// processed "별도 동의를 받아". That separate consent row used to be written by
// exactly ONE screen (the import opt-in flow); the /privacy toggle wrote a
// consent_changes 'grant' and nothing else, so a user could turn sensitive-data
// processing on from settings and leave no record of the consent the policy
// promises. It is written at the save choke point now, which covers every path.
describe("savePrivacyPrefs — sensitive-data consent record", () => {
  beforeEach(() => {
    __mock.from.mockClear();
    __maybeSingle.mockReset();
    __eqUpdate.mockReset();
    __insert.mockReset();
    __eqUpdate.mockResolvedValue({ error: null });
    __insert.mockResolvedValue({ error: null });
  });

  /** The consent_records row from this save, or null if none was written. */
  function consentRow(): Record<string, unknown> | null {
    const call = __insert.mock.calls.find(
      (c) => !Array.isArray(c[0]) && (c[0] as { purposes?: unknown }).purposes !== undefined,
    );
    return call ? (call[0] as Record<string, unknown>) : null;
  }

  test("granting health_import writes a consent_records row with the sensitive ack", async () => {
    mockBeforeState({ health_import: false });
    await savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), health_import: true }, { locale: "ko" });
    expect(__mock.from).toHaveBeenCalledWith("consent_records");
    const row = consentRow();
    expect(row).not.toBeNull();
    expect(row!.sensitive_data_ack).toBe(true);
    expect(row!.purposes).toEqual(["health_import"]);
    expect(row!.locale).toBe("ko");
  });

  test("revoking health_import does NOT write a consent row (only the change ledger)", async () => {
    // A withdrawal is recorded as a consent_changes 'revoke'. Appending a
    // consent_records row on the way OUT would read as a fresh grant.
    mockBeforeState({ health_import: true });
    await savePrivacyPrefs("u1", defaultPrivacyPrefs());
    expect(consentRow()).toBeNull();
    expect(__insert).toHaveBeenCalledWith([
      { user_id: "u1", pref_key: "health_import", event_type: "revoke" },
    ]);
  });

  test("saving with health_import already on writes nothing new", async () => {
    // Otherwise every unrelated toggle would append another grant to an
    // append-only ledger, and the record of when consent was actually given
    // would be buried in duplicates.
    mockBeforeState({ health_import: true });
    await savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), health_import: true, ads: true });
    expect(consentRow()).toBeNull();
  });

  test("granting a non-sensitive pref writes no consent record", async () => {
    mockBeforeState({ ads: false });
    await savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), ads: true });
    expect(consentRow()).toBeNull();
  });

  test("defaults the locale rather than throwing when a caller omits it", async () => {
    mockBeforeState({ health_import: false });
    await savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), health_import: true });
    expect(consentRow()!.locale).toBe("en");
  });

  test("a failed consent write never breaks the save", async () => {
    mockBeforeState({ health_import: false });
    __insert.mockResolvedValue({ error: new Error("consent_records unavailable") });
    await expect(
      savePrivacyPrefs("u1", { ...defaultPrivacyPrefs(), health_import: true }),
    ).resolves.toBeUndefined();
  });
});
