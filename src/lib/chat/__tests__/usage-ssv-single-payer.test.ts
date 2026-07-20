// D2 single-payer guard for the chat rewarded top-up (grantChatAdBonus).
//
// When AdMob SSV is the grant authority (EXPO_PUBLIC_REWARD_SSV=true), the
// verified server callback (rewarded-ssv -> grant_chat_ad_bonus_ssv, 0091) is
// the ONLY payer. The client must NOT also call grant_chat_ad_bonus, or one
// impression credits twice (+4 instead of +2). The reasoning twin
// (entitlements/usage.ts addRewardCredits) has carried this guard since D2;
// this suite pins the chat path to the same contract.

jest.mock("../../supabase/client", () => ({ getSupabaseClient: jest.fn() }));

import { getSupabaseClient } from "../../supabase/client";
import { ChatRewardCapReachedError, grantChatAdBonus } from "../usage";

const mockGetClient = getSupabaseClient as jest.Mock;

function clientWithRead(row: { count: number; ad_bonus: number } | null) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
  const eq2 = jest.fn().mockReturnValue({ maybeSingle });
  const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
  const select = jest.fn().mockReturnValue({ eq: eq1 });
  const from = jest.fn().mockReturnValue({ select });
  const rpc = jest.fn();
  return { client: { from, select, rpc }, rpc, from };
}

const ORIGINAL_SSV = process.env.EXPO_PUBLIC_REWARD_SSV;

afterEach(() => {
  if (ORIGINAL_SSV === undefined) delete process.env.EXPO_PUBLIC_REWARD_SSV;
  else process.env.EXPO_PUBLIC_REWARD_SSV = ORIGINAL_SSV;
  jest.clearAllMocks();
});

describe("grantChatAdBonus single-payer guard (SSV mode)", () => {
  test("SSV mode: never calls the client grant RPC, reports the current bonus", async () => {
    process.env.EXPO_PUBLIC_REWARD_SSV = "true";
    const { client, rpc, from } = clientWithRead({ count: 3, ad_bonus: 2 });
    mockGetClient.mockReturnValue(client);

    const bonus = await grantChatAdBonus("user-1");

    expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("chat_usage");
    expect(bonus).toBe(2);
  });

  test("SSV mode: no usage row yet reads as bonus 0 (still no grant)", async () => {
    process.env.EXPO_PUBLIC_REWARD_SSV = "true";
    const { client, rpc } = clientWithRead(null);
    mockGetClient.mockReturnValue(client);

    const bonus = await grantChatAdBonus("user-1");

    expect(rpc).not.toHaveBeenCalled();
    expect(bonus).toBe(0);
  });

  test("SSV off: the client grant RPC stays the payer", async () => {
    delete process.env.EXPO_PUBLIC_REWARD_SSV;
    const rpc = jest.fn().mockResolvedValue({ data: 4, error: null });
    mockGetClient.mockReturnValue({ rpc });

    const bonus = await grantChatAdBonus("user-1");

    expect(rpc).toHaveBeenCalledWith("grant_chat_ad_bonus", { p_user_id: "user-1" });
    expect(bonus).toBe(4);
  });

  test("SSV off: monthly-cap rejection still surfaces as the typed error", async () => {
    delete process.env.EXPO_PUBLIC_REWARD_SSV;
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "P0001: chat_reward_cap_reached" },
    });
    mockGetClient.mockReturnValue({ rpc });

    await expect(grantChatAdBonus("user-1")).rejects.toBeInstanceOf(ChatRewardCapReachedError);
  });
});
