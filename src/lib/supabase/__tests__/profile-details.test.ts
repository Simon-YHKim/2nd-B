const maybeSingle = jest.fn();
const updateEq = jest.fn();
const update = jest.fn(() => ({ eq: updateEq }));
const rpcResult = jest.fn();
const setHeader = jest.fn(() => rpcResult());
const rpc = jest.fn(() => ({ setHeader }));
const getSession = jest.fn();

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession }, rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update,
    }),
  }),
}));

import { fetchProfileDetails, fetchProfileDetailsSnapshot, saveProfileDetails } from "../profile-details";

describe("profile details persistence safety", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    update.mockClear();
    updateEq.mockReset().mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-a" }, access_token: "test-session" } }, error: null });
    rpc.mockClear(); setHeader.mockClear(); rpcResult.mockReset().mockResolvedValue({ data: { revision: 8 }, error: null });
  });

  test("surfaces SELECT errors instead of treating them as an empty profile", async () => {
    const error = new Error("temporary read failure");
    maybeSingle.mockResolvedValue({ data: null, error });

    await expect(fetchProfileDetails("user-a")).rejects.toBe(error);
  });

  test("surfaces thrown transport failures instead of treating them as empty", async () => {
    const error = new Error("offline");
    maybeSingle.mockRejectedValue(error);

    await expect(fetchProfileDetails("user-a")).rejects.toBe(error);
  });

  test("accepts a successfully loaded empty JSONB value", async () => {
    maybeSingle.mockResolvedValue({ data: { profile_details: {} }, error: null });

    await expect(fetchProfileDetails("user-a")).resolves.toEqual({});
  });

  test("writes the complete narrowed snapshot so an explicit cleared field stays removed", async () => {
    maybeSingle.mockResolvedValue({
      data: { profile_details: { occupation: "Designer", region: "Seoul" } },
      error: null,
    });
    const loaded = await fetchProfileDetails("user-a");

    await expect(saveProfileDetails("user-a", { ...loaded, occupation: "" }, 7)).resolves.toBe(8);

    expect(rpc).toHaveBeenCalledWith("save_profile_details_revision", { p_details: { region: "Seoul" }, p_expected_revision: 7 });
    expect(setHeader).toHaveBeenCalledWith("Authorization", "Bearer test-session");
    expect(update).not.toHaveBeenCalled();
  });
  test("an editor reads data and revision in the same snapshot", async () => {
    maybeSingle.mockResolvedValue({ data: { profile_details: { occupation: "Designer" }, profile_details_revision: 7 }, error: null });
    await expect(fetchProfileDetailsSnapshot("user-a")).resolves.toEqual({ details: { occupation: "Designer" }, revision: 7 });
  });
  test("stale save errors propagate and do not retry with a fresher revision", async () => {
    const conflict = { message: "profile_import_profile_conflict", code: "PT409" };
    rpcResult.mockResolvedValue({ data: null, error: conflict });
    await expect(saveProfileDetails("user-a", {}, 4)).rejects.toBe(conflict);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  test("an account switch cannot save the old account's form into the new one", async () => {
    await expect(saveProfileDetails("user-b", { occupation: "private" }, 1)).rejects.toThrow("owner");
    expect(rpc).not.toHaveBeenCalled();
  });
});
