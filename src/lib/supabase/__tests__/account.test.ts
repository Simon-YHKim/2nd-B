// Account reads are fail-soft, but their diagnostics must never echo backend
// errors: those values can contain row, policy, or request details.

jest.mock("../client", () => {
  const maybeSingle = jest.fn();
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));

  return {
    getSupabaseClient: () => ({ from }),
    __from: from,
    __maybeSingle: maybeSingle,
  };
});

import { fetchBirthDate } from "../account";

const { __from, __maybeSingle } = require("../client") as {
  __from: jest.Mock;
  __maybeSingle: jest.Mock;
};

describe("fetchBirthDate", () => {
  beforeEach(() => {
    __from.mockClear();
    __maybeSingle.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns the stored date without warning", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    __maybeSingle.mockResolvedValueOnce({ data: { birth_date: "1990-01-02" }, error: null });

    await expect(fetchBirthDate("user-1")).resolves.toBe("1990-01-02");
    expect(warn).not.toHaveBeenCalled();
  });

  test("returns null and logs only a category when Supabase returns an error", async () => {
    const backendMessage = "permission denied; request payload contained private-profile-data";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    __maybeSingle.mockResolvedValueOnce({ data: null, error: new Error(backendMessage) });

    await expect(fetchBirthDate("user-1")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[account] birth_date load failed");
    expect(warn.mock.calls.flat().map(String).join(" ")).not.toContain(backendMessage);
  });

  test("does not log a non-Error rejection payload", async () => {
    const backendPayload = "private-row-payload";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    __from.mockImplementationOnce(() => {
      throw { message: "request failed", payload: backendPayload };
    });

    await expect(fetchBirthDate("user-1")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[account] birth_date load failed");
    expect(warn.mock.calls.flat().map(String).join(" ")).not.toContain(backendPayload);
  });
});
