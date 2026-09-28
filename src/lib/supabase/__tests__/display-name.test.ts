const readMaybeSingle = jest.fn();
const writeMaybeSingle = jest.fn();
const readEq = jest.fn(() => ({ maybeSingle: readMaybeSingle }));
const readSelect = jest.fn(() => ({ eq: readEq }));
const writeSelect = jest.fn(() => ({ maybeSingle: writeMaybeSingle }));
const writeEq = jest.fn(() => ({ select: writeSelect }));
const update = jest.fn(() => ({ eq: writeEq }));
const from = jest.fn(() => ({ select: readSelect, update }));

jest.mock("../client", () => ({ getSupabaseClient: () => ({ from }) }));

import { fetchDisplayName, normalizeDisplayName, saveDisplayName } from "../display-name";

describe("optional display name persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readMaybeSingle.mockResolvedValue({ data: { id: "owner", display_name: "Current" }, error: null });
    writeMaybeSingle.mockResolvedValue({ data: { id: "owner", display_name: "New" }, error: null });
  });

  test("normalizes an optional name using the onboarding length limit", () => {
    expect(normalizeDisplayName("  New  ")).toBe("New");
    expect(normalizeDisplayName("  ")).toBeNull();
    expect(normalizeDisplayName("x".repeat(40))).toBe("x".repeat(40));
    expect(() => normalizeDisplayName("x".repeat(41))).toThrow();
  });

  test("only opens the name editor after the owner row loads", async () => {
    await expect(fetchDisplayName("owner")).resolves.toBe("Current");
    expect(from).toHaveBeenCalledWith("users");
    expect(readSelect).toHaveBeenCalledWith("id,display_name");
    expect(readEq).toHaveBeenCalledWith("id", "owner");

    readMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(fetchDisplayName("owner")).rejects.toThrow("owner row");
    const failure = new Error("offline");
    readMaybeSingle.mockResolvedValue({ data: null, error: failure });
    await expect(fetchDisplayName("owner")).rejects.toBe(failure);
    readMaybeSingle.mockResolvedValue({ data: { id: "other", display_name: "Private" }, error: null });
    await expect(fetchDisplayName("owner")).rejects.toThrow("owner row");
  });

  test("updates only the owner's display_name and checks the returned row", async () => {
    await expect(saveDisplayName("owner", " New ")).resolves.toBe("New");
    expect(update).toHaveBeenCalledWith({ display_name: "New" });
    expect(writeEq).toHaveBeenCalledWith("id", "owner");
    expect(writeSelect).toHaveBeenCalledWith("id,display_name");

    writeMaybeSingle.mockResolvedValue({ data: { id: "owner", display_name: null }, error: null });
    await expect(saveDisplayName("owner", " ")).resolves.toBeNull();
    expect(update).toHaveBeenLastCalledWith({ display_name: null });
  });

  test("never reports a denied or unconfirmed write as saved", async () => {
    writeMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(saveDisplayName("owner", "New")).rejects.toThrow("not confirmed");
    writeMaybeSingle.mockResolvedValue({ data: { id: "other", display_name: "New" }, error: null });
    await expect(saveDisplayName("owner", "New")).rejects.toThrow("not confirmed");
    writeMaybeSingle.mockResolvedValue({ data: { id: "owner", display_name: "Old" }, error: null });
    await expect(saveDisplayName("owner", "New")).rejects.toThrow("not confirmed");
    const failure = new Error("permission denied");
    writeMaybeSingle.mockResolvedValue({ data: null, error: failure });
    await expect(saveDisplayName("owner", "New")).rejects.toBe(failure);
    await expect(saveDisplayName("", "New")).rejects.toThrow("owner");
    await expect(saveDisplayName("owner", "x".repeat(41))).rejects.toThrow("40-character");
    expect(update).not.toHaveBeenCalledWith({ display_name: "x".repeat(41) });
  });
});
