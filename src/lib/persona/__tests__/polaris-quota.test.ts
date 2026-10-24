const mockRpc = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ rpc: mockRpc }) }));
import { loadPolarisQuota, loadPolarisQuotaStrict, reservePolarisGeneration } from "../polaris-quota";

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


describe("strict display status without changing admission fallback", () => {
  it.each([true, false].flatMap(available => [0, 1, 2].map(intro_remaining => ({available, intro_remaining, tier: "free"}))))("accepts confirmed server state %s", async data => {
    mockRpc.mockResolvedValue({data, error: null});
    await expect(loadPolarisQuotaStrict("owner")).resolves.toEqual({available:data.available, introRemaining:data.intro_remaining, tier:"free"});
    expect(mockRpc).toHaveBeenCalledWith("polaris_generation_status", {p_user_id:"owner"});
  });
  it.each([null, [], {}, {available:"true",intro_remaining:2,tier:"free"}, {available:false,intro_remaining:null,tier:"free"},
    ...[-1,3,1.5,NaN,"2"].map(intro_remaining=>({available:true,intro_remaining,tier:"free"})),
    ...[null,"",7].map(tier=>({available:true,intro_remaining:2,tier}))])("rejects malformed status %s", async data => {
    mockRpc.mockResolvedValue({data});
    await expect(loadPolarisQuotaStrict("owner")).rejects.toThrow("polaris_status_invalid");
  });
  it.each(["returned", "thrown"])("preserves %s transport failure instead of manufacturing disabled",async mode=>{
    const error = new Error("offline");
    if(mode==="returned") mockRpc.mockResolvedValue({data:null,error}); else mockRpc.mockRejectedValue(error);
    await expect(loadPolarisQuotaStrict("owner")).rejects.toBe(error);
    await expect(loadPolarisQuota("owner")).resolves.toEqual({available:false,introRemaining:null,tier:null});
  });
  it("does no read for a missing owner", async()=>{
    await expect(loadPolarisQuotaStrict("")).rejects.toThrow("polaris_status_owner_required");
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
