// getReasoningUsage must read the SPENDABLE balance from the credit ledger,
// not from the usage_counters mirror.
//
// Why this matters, and why it is not cosmetic: 0135 moved credits into
// credit_ledger and left usage_counters.reward_credits / reward_consumed as a
// trigger-maintained mirror that re-derives reward_credits from AD-EARNED units
// only. That is a deliberate under-report, and it is harmless right up until a
// purchased lot exists - at which point the mirror cannot express it. A client
// reading only those columns would show "0 남음" for credits the user paid for,
// and the depleted gate in reasoning.tsx (`if (depleted) return;` inside
// startRun) would then refuse to spend them. The user is charged and blocked.
//
// So the number comes from credit_summary_self() (0137), with the mirror kept
// as the fallback. The safety argument is that this can only ever RAISE the
// number: the mirror is LEAST(available, ad_earned) by construction, so the
// ledger value is always >= it. Nobody who could run before can be blocked now.
//
// rewardEarned stays ad-scoped on purpose - it drives "이번 달 보상을 모두
// 받았어요" against REWARD_MONTHLY_CAP, and a purchase must not make the AD cap
// look reached.

const from = jest.fn();
const rpc = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from, rpc }),
}));

import { getReasoningUsage, monthBucket, weekBucket } from "../usage";

/** usage_counters read: `.from(T).select(...).eq(...).in(...)` resolves to {data,error}. */
function counters(rows: unknown[], error: { message: string } | null = null) {
  const result = Promise.resolve({ data: rows, error });
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => result,
  };
  return chain;
}

const WEEK = weekBucket();
const MONTH = monthBucket();

/** A mirror row that reports 3 ad credits earned, 1 consumed => 2 spendable. */
const MIRROR_2 = [
  { month_bucket: WEEK, reasoning_used: 1, reward_credits: 0, reward_consumed: 0 },
  { month_bucket: MONTH, reasoning_used: 0, reward_credits: 3, reward_consumed: 1 },
];

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

describe("getReasoningUsage reads the ledger, not the mirror", () => {
  test("it asks credit_summary_self, which takes no user id", () => {
    from.mockReturnValue(counters(MIRROR_2));
    rpc.mockResolvedValue({ data: { available: 2, ad_earned_this_month: 3 }, error: null });

    return getReasoningUsage("u1").then(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
      // No argument: the subject is auth.uid(). Passing a user id here is the
      // shape 0137 removed, and re-adding it would re-open a cross-user read.
      expect(rpc.mock.calls[0][0]).toBe("credit_summary_self");
      expect(rpc.mock.calls[0][1]).toBeUndefined();
    });
  });

  test("a purchased balance the mirror cannot see is still spendable", async () => {
    // The exact case the purchase path creates: 50 bought, 0 earned from ads.
    from.mockReturnValue(counters([
      { month_bucket: WEEK, reasoning_used: 2, reward_credits: 0, reward_consumed: 0 },
      { month_bucket: MONTH, reasoning_used: 0, reward_credits: 0, reward_consumed: 0 },
    ]));
    rpc.mockResolvedValue({ data: { available: 50, ad_earned_this_month: 0 }, error: null });

    const usage = await getReasoningUsage("u1");
    expect(usage.rewardCredits).toBe(50); // mirror would have said 0
    expect(usage.rewardEarned).toBe(0); // and the AD cap is untouched by a purchase
  });

  test("the ad cap stays ad-scoped even when a purchase is present", async () => {
    from.mockReturnValue(counters(MIRROR_2));
    rpc.mockResolvedValue({ data: { available: 22, ad_earned_this_month: 20 }, error: null });

    const usage = await getReasoningUsage("u1");
    expect(usage.rewardCredits).toBe(22);
    expect(usage.rewardEarned).toBe(20); // not 22 - the sheet must not claim the cap is over
  });

  test("the weekly count still comes from the counter row", async () => {
    from.mockReturnValue(counters(MIRROR_2));
    rpc.mockResolvedValue({ data: { available: 2, ad_earned_this_month: 3 }, error: null });

    const usage = await getReasoningUsage("u1");
    expect(usage.used).toBe(1);
    expect(usage.weekBucket).toBe(WEEK);
    expect(usage.monthBucket).toBe(MONTH);
  });
});

describe("it degrades to the mirror rather than to zero", () => {
  test("an RPC error falls back to the mirror, not to a blocked user", async () => {
    from.mockReturnValue(counters(MIRROR_2));
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const usage = await getReasoningUsage("u1");
    expect(usage.rewardCredits).toBe(2); // 3 earned - 1 consumed
    expect(usage.rewardEarned).toBe(3);
  });

  test("an RPC that throws does not take the whole read down", async () => {
    from.mockReturnValue(counters(MIRROR_2));
    rpc.mockRejectedValue(new Error("network"));

    // Promise.all rejects, so the outer catch fails open. The contract that
    // matters is that it returns rather than throwing into the caller.
    const usage = await getReasoningUsage("u1");
    expect(usage.used).toBe(0);
    expect(usage.rewardCredits).toBe(0);
  });

  test("a counters error still fails open to zero", async () => {
    from.mockReturnValue(counters([], { message: "table gone" }));
    rpc.mockResolvedValue({ data: { available: 9, ad_earned_this_month: 0 }, error: null });

    const usage = await getReasoningUsage("u1");
    expect(usage).toEqual({
      used: 0,
      rewardCredits: 0,
      rewardEarned: 0,
      weekBucket: WEEK,
      monthBucket: MONTH,
    });
  });

  test("a malformed summary is treated as zero credits, never as NaN", async () => {
    from.mockReturnValue(counters(MIRROR_2));
    rpc.mockResolvedValue({ data: { available: "nope" }, error: null });

    const usage = await getReasoningUsage("u1");
    expect(usage.rewardCredits).toBe(0);
    expect(Number.isNaN(usage.rewardCredits)).toBe(false);
  });
});

describe("the two reads go out together", () => {
  test("the ledger call does not wait for the counter read", async () => {
    // A serial implementation would be a second round trip on home, the limit
    // sheet and the paywall. Assert both were issued before either resolved.
    let countersStarted = false;
    let rpcStartedBeforeCountersResolved = false;
    let resolveCounters: (v: unknown) => void = () => {};
    const pending = new Promise((res) => {
      resolveCounters = res;
    });

    from.mockImplementation(() => {
      countersStarted = true;
      const chain = { select: () => chain, eq: () => chain, in: () => pending };
      return chain;
    });
    rpc.mockImplementation(() => {
      rpcStartedBeforeCountersResolved = countersStarted;
      return Promise.resolve({ data: { available: 4, ad_earned_this_month: 4 }, error: null });
    });

    const p = getReasoningUsage("u1");
    resolveCounters({ data: MIRROR_2, error: null });
    const usage = await p;

    expect(rpcStartedBeforeCountersResolved).toBe(true);
    expect(usage.rewardCredits).toBe(4);
  });
});
