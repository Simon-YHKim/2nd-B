const maybeSingle = jest.fn();
const updateEq = jest.fn();
const update = jest.fn(() => ({ eq: updateEq }));

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update,
    }),
  }),
}));

import { fetchProfileDetails, saveProfileDetails } from "../profile-details";

describe("profile details persistence safety", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    update.mockClear();
    updateEq.mockReset().mockResolvedValue({ error: null });
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

    await saveProfileDetails("user-a", { ...loaded, occupation: "" });

    expect(update).toHaveBeenCalledWith({ profile_details: { region: "Seoul" } });
    expect(updateEq).toHaveBeenCalledWith("id", "user-a");
  });
});
