import { getSupabaseClient } from "../../supabase/client";
import { listRooms } from "../chat";

jest.mock("../../supabase/client", () => ({ getSupabaseClient: jest.fn() }));

describe("community room deep-link query", () => {
  const eq = jest.fn();
  const order = jest.fn();
  const limit = jest.fn();
  const select = jest.fn();
  const from = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    eq.mockReturnValue({ order });
    order.mockReturnValue({ limit });
    limit.mockResolvedValue({ data: [], error: null });
    select.mockReturnValue({ eq, order });
    from.mockReturnValue({ select });
    jest.mocked(getSupabaseClient).mockReturnValue({ from } as never);
  });

  it("filters a deep-link room before limiting results", async () => {
    await expect(listRooms("older-room")).resolves.toEqual([]);
    expect(from).toHaveBeenCalledWith("community_rooms");
    expect(eq).toHaveBeenCalledWith("id", "older-room");
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("keeps the overview at 50 rooms", async () => {
    await expect(listRooms()).resolves.toEqual([]);
    expect(eq).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(50);
  });
});
