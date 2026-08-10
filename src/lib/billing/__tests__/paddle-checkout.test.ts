// Web checkout contract. The one thing that must never regress silently:
// customData.user_id. supabase/functions/paddle-webhook resolves a purchase to
// a user through data.custom_data.user_id — drop it and a payer is charged and
// stays 'free', with no error on either side.

const authUser: { id?: string; email?: string } | null = { id: "u-123", email: "a@b.com" };

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: authUser } }) } }),
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
  test("sends customData.user_id — the webhook's only link to the payer", async () => {
    installPaddle();
    const r = await openPaddleCheckout({ tier: "cortex", cadence: "yearly" });
    expect(r).toEqual({ ok: true });
    expect(opened).toHaveLength(1);
    const arg = opened[0] as any;
    expect(arg.customData).toEqual({ user_id: "u-123" });
    expect(arg.items).toEqual([{ priceId: "pri_cortex_y", quantity: 1 }]);
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
