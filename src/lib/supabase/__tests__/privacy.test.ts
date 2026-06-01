// task B1: users.privacy_prefs read/write. fetchPrivacyPrefs must be fail-soft
// (a missing column / table before the 0032 migration resolves to defaults);
// savePrivacyPrefs must propagate write errors so the screen can revert.

jest.mock("../client", () => {
  const maybeSingle = jest.fn();
  const eqSelect = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq: eqSelect }));
  const eqUpdate = jest.fn();
  const update = jest.fn(() => ({ eq: eqUpdate }));
  const from = jest.fn(() => ({ select, update }));
  const mock = { from };
  return {
    getSupabaseClient: () => mock,
    __mock: mock,
    __maybeSingle: maybeSingle,
    __select: select,
    __update: update,
    __eqUpdate: eqUpdate,
  };
});

import { fetchPrivacyPrefs, savePrivacyPrefs } from "../privacy";
import { defaultPrivacyPrefs } from "../../privacy/prefs";

const { __mock, __maybeSingle, __update, __eqUpdate } = require("../client") as {
  __mock: { from: jest.Mock };
  __maybeSingle: jest.Mock;
  __update: jest.Mock;
  __eqUpdate: jest.Mock;
};

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
    __update.mockClear();
    __eqUpdate.mockReset();
  });

  test("writes the full prefs object and resolves on success", async () => {
    __eqUpdate.mockResolvedValueOnce({ error: null });
    const prefs = { ...defaultPrivacyPrefs(), long_term_memory: true };
    await savePrivacyPrefs("u1", prefs);
    expect(__update).toHaveBeenCalledWith({ privacy_prefs: prefs });
    expect(__eqUpdate).toHaveBeenCalledWith("id", "u1");
  });

  test("propagates a write error so the caller can revert", async () => {
    __eqUpdate.mockResolvedValueOnce({ error: new Error("rls denied") });
    await expect(savePrivacyPrefs("u1", defaultPrivacyPrefs())).rejects.toThrow("rls denied");
  });
});
