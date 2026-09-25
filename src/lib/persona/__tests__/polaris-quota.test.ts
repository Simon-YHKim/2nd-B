const mockRpc = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ rpc: mockRpc }) }));
import { loadPolarisQuota, reservePolarisGeneration } from "../polaris-quota";

beforeEach(() => mockRpc.mockReset());
it("does not advertise two free generations when the backend is absent", async () => {
  mockRpc.mockResolvedValue({ error: { message: "RPC missing" }, data: null });
  expect(await loadPolarisQuota("u")).toEqual({ available: false, introRemaining: null, tier: null });
});
it("fails closed when the capability transport rejects", async () => {
  mockRpc.mockRejectedValue(new Error("offline"));
  expect((await loadPolarisQuota("u")).available).toBe(false);
});
it.each([0,1,2])("renders server-owned remaining introductory successes: %s", async (remaining) => {
  mockRpc.mockResolvedValue({ data: { available: true, intro_remaining: remaining, tier: "free" } });
  expect((await loadPolarisQuota("u")).introRemaining).toBe(remaining);
});
it("never sends a client cap/tier/bucket to the reservation RPC", async () => {
  mockRpc.mockResolvedValue({ data: { generation_id: "id", status: "reserved" } });
  expect(await reservePolarisGeneration("u","request-id")).toBe("id");
  expect(mockRpc).toHaveBeenCalledWith("reserve_polaris_generation",{ p_user_id: "u", p_key:"request-id" });
});
it("does not dispatch an existing in-flight or completed id twice", async () => {
  mockRpc.mockResolvedValue({ data: { generation_id: "id", status: "running" } });
  await expect(reservePolarisGeneration("u","request-id")).rejects.toThrow("polaris_generation_active");
});
