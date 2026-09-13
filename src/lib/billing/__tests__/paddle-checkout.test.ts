// Web checkout ownership contract. The browser may choose what to buy, but it
// must obtain the complete server-signed customData binding before Paddle opens.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const authUser: { id?: string; email?: string } | null = { id: USER_ID, email: "a@b.com" };
const checkoutBinding = {
  user_id: USER_ID,
  issued_at: 1_789_000_000,
  nonce: "a".repeat(32),
  signature: "b".repeat(64),
};
const mockInvoke = jest.fn(async () => ({ data: checkoutBinding, error: null }));

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: authUser } }) },
    functions: { invoke: mockInvoke },
  }),
}));

import {
  openPaddleCheckout,
  paddleCheckoutAvailable,
  priceIdFor,
  __resetPaddleSdkForTests,
} from "../paddle-checkout";

const opened: unknown[] = [];

function installPaddle() {
  (globalThis as any).Paddle = {
    Initialize: jest.fn(),
    Checkout: { open: (o: unknown) => opened.push(o) },
  };
}

beforeEach(() => {
  opened.length = 0;
  mockInvoke.mockClear();
  mockInvoke.mockResolvedValue({ data: checkoutBinding, error: null });
  __resetPaddleSdkForTests();
  delete (globalThis as any).Paddle;
  process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = "live_test";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_MONTHLY = "pri_cortex_m";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY = "pri_cortex_y";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY = "pri_brain_m";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY = "pri_brain_y";
});

describe("config", () => {
  test("resolves a distinct price id per tier AND cadence", () => {
    expect(priceIdFor("cortex", "monthly")).toBe("pri_cortex_m");
    expect(priceIdFor("cortex", "yearly")).toBe("pri_cortex_y");
    expect(priceIdFor("brain", "monthly")).toBe("pri_brain_m");
    expect(priceIdFor("brain", "yearly")).toBe("pri_brain_y");
  });

  test("unset config fails closed rather than opening a broken checkout", async () => {
    process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = "";
    expect(paddleCheckoutAvailable("cortex")).toBe(false);
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(opened).toHaveLength(0);
  });

  test("a missing price id for one cadence does not enable that cadence", () => {
    process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY = "";
    expect(paddleCheckoutAvailable("brain", "monthly")).toBe(true);
    expect(paddleCheckoutAvailable("brain", "yearly")).toBe(false);
  });
});

describe("openPaddleCheckout", () => {
  test("sends only the server-signed ownership binding as customData", async () => {
    installPaddle();
    const r = await openPaddleCheckout({ tier: "cortex", cadence: "yearly" });
    expect(r).toEqual({ ok: true });
    expect(mockInvoke).toHaveBeenCalledWith("subscription-manage", {
      body: { action: "checkout_binding" },
    });
    expect(opened).toHaveLength(1);
    const arg = opened[0] as any;
    expect(arg.customData).toEqual(checkoutBinding);
    expect(arg.items).toEqual([{ priceId: "pri_cortex_y", quantity: 1 }]);
  });

  test.each([
    ["edge failure", { data: null, error: { message: "unavailable" } }],
    ["wrong owner", { data: { ...checkoutBinding, user_id: "22222222-2222-4222-8222-222222222222" }, error: null }],
    ["unsigned shape", { data: { user_id: USER_ID }, error: null }],
  ])("fails closed before loading Paddle when the checkout binding has %s", async (_label, reply) => {
    installPaddle();
    mockInvoke.mockResolvedValueOnce(reply as never);

    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({
      ok: false,
      reason: "binding_failed",
    });
    expect(opened).toHaveLength(0);
    expect((globalThis as any).Paddle.Initialize).not.toHaveBeenCalled();
  });

  test("refuses to open when there is no signed-in user", async () => {
    installPaddle();
    const saved = authUser!.id;
    delete authUser!.id;
    try {
      await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({
        ok: false,
        reason: "no_user",
      });
      expect(opened).toHaveLength(0);
    } finally {
      authUser!.id = saved;
    }
  });
});
