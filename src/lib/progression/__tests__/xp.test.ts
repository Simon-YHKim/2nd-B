// awardXp / awardXpSafe — the client edge of the award_xp RPC (0019). The
// server owns the XP amounts; the client's job is faithful payload mapping
// and never letting an XP hiccup break the real write (cycle-3 test gap #3).

const mockRpc = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

import { awardXp, awardXpSafe } from "../xp";

describe("awardXp", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  test("names the action and maps the snake_case RPC payload", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { awarded: 15, total_xp: 120, level: 3, duplicate: false },
      error: null,
    });

    const r = await awardXp("journal");

    expect(mockRpc).toHaveBeenCalledWith("award_xp", { p_action: "journal" });
    expect(r).toEqual({ awarded: 15, totalXp: 120, level: 3, duplicate: false });
  });

  test("once-only duplicate award comes back flagged with zero delta", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { awarded: 0, total_xp: 200, level: 4, duplicate: true },
      error: null,
    });

    const r = await awardXp("persona_created");

    expect(r.duplicate).toBe(true);
    expect(r.awarded).toBe(0);
    expect(r.totalXp).toBe(200);
  });

  test("null payload degrades to safe defaults instead of NaN/undefined", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const r = await awardXp("note");

    expect(r).toEqual({ awarded: 0, totalXp: 0, level: 1, duplicate: false });
  });

  test("RPC error propagates (caller decides whether to surface)", async () => {
    const boom = { message: "rls denied" };
    mockRpc.mockResolvedValueOnce({ data: null, error: boom });

    await expect(awardXp("journal")).rejects.toBe(boom);
  });
});

describe("awardXpSafe", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  test("swallows the failure and returns null — XP must never break the flow", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });

    await expect(awardXpSafe("audit_answer")).resolves.toBeNull();
  });

  test("passes a successful award through unchanged", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { awarded: 5, total_xp: 5, level: 1, duplicate: false },
      error: null,
    });

    await expect(awardXpSafe("note")).resolves.toEqual({
      awarded: 5,
      totalXp: 5,
      level: 1,
      duplicate: false,
    });
  });
});
