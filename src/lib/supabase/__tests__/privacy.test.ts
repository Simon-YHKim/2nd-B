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

import { fetchPrivacyPrefs, savePrivacyPrefs } from "../privacy";
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
