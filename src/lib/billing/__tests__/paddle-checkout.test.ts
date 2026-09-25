// Web checkout ownership contract. The browser may choose what to buy, but it
// must obtain the complete server-signed customData binding before Paddle opens.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PRICES = { cortex_m: `pri_${"a".repeat(26)}`, cortex_y: `pri_${"b".repeat(26)}`,
  brain_m: `pri_${"c".repeat(26)}`, brain_y: `pri_${"d".repeat(26)}` };
const authUser: { id?: string; email?: string } | null = { id: USER_ID, email: "a@b.com" };
const checkoutBinding = {
  user_id: USER_ID,
  issued_at: Math.floor(Date.now() / 1000),
  nonce: "a".repeat(32),
  signature: "b".repeat(64),
  version: 2,
  environment: "production",
  audience: "https://project.supabase.test",
  price_id: PRICES.cortex_m,
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
import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

const opened: unknown[] = [];

function installPaddle() {
  (globalThis as any).Paddle = {
    Initialize: jest.fn(),
    Environment: { set: jest.fn() },
    Update: jest.fn(),
    Checkout: { open: (o: unknown) => opened.push(o) },
  };
}

beforeEach(() => {
  beginAccountOwnerTransition(USER_ID);
  noteResolvedOwner(USER_ID);
  clearAccountTransition(currentAccountEpoch());
  opened.length = 0;
  mockInvoke.mockClear();
  mockInvoke.mockResolvedValue({ data: checkoutBinding, error: null });
  __resetPaddleSdkForTests();
  delete (globalThis as any).Paddle;
  delete process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT;
  process.env.EXPO_PUBLIC_SUPABASE_URL = checkoutBinding.audience;
  process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = `live_${"a".repeat(27)}`;
  process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_MONTHLY = PRICES.cortex_m;
  process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY = PRICES.cortex_y;
  process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY = PRICES.brain_m;
  process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY = PRICES.brain_y;
});

describe("config", () => {
  test("resolves a distinct price id per tier AND cadence", () => {
    expect(priceIdFor("cortex", "monthly")).toBe(PRICES.cortex_m);
    expect(priceIdFor("cortex", "yearly")).toBe(PRICES.cortex_y);
    expect(priceIdFor("brain", "monthly")).toBe(PRICES.brain_m);
    expect(priceIdFor("brain", "yearly")).toBe(PRICES.brain_y);
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
  test("retires a checkout if the account changes while its binding is issued", async () => {
    installPaddle();
    let finish!: (reply: { data: typeof checkoutBinding; error: null }) => void;
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = openPaddleCheckout({ tier: "cortex" });
    await Promise.resolve();
    beginAccountOwnerTransition("another-owner");
    finish({ data: checkoutBinding, error: null });
    await expect(pending).resolves.toEqual({ ok: false, reason: "no_user" });
    expect(opened).toHaveLength(0);
    expect((globalThis as any).Paddle.Initialize).not.toHaveBeenCalled();
  });

  test("retires a checkout if the account changes while Paddle loads", async () => {
    let script: { onload: () => void } | undefined;
    (globalThis as any).document = { createElement: () => ({}), head: {
      appendChild: (element: { onload: () => void }) => { script = element; },
    } };
    try {
      const pending = openPaddleCheckout({ tier: "cortex" });
      await Promise.resolve();
      await Promise.resolve();
      expect(script).toBeDefined();
      beginAccountOwnerTransition("another-owner");
      installPaddle();
      script!.onload();
      await expect(pending).resolves.toEqual({ ok: false, reason: "no_user" });
      expect(opened).toHaveLength(0);
    } finally {
      delete (globalThis as any).document;
    }
  });

  test("keeps the SDK pinned to its first environment and token for the page lifetime", async () => {
    installPaddle();
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: true });
    process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT = "sandbox";
    process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = `test_${"a".repeat(27)}`;
    mockInvoke.mockResolvedValueOnce({ data: { ...checkoutBinding, environment: "sandbox" }, error: null });
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: false, reason: "sdk_load_failed" });
    expect(opened).toHaveLength(1);
    expect((globalThis as any).Paddle.Initialize).toHaveBeenCalledTimes(1);
  });

  test("SDK initialization failure returns a retryable failure without opening", async () => {
    installPaddle();
    (globalThis as any).Paddle.Initialize.mockImplementationOnce(() => { throw new Error("SDK unavailable"); });
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: false, reason: "sdk_load_failed" });
    expect(opened).toHaveLength(0);
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: true });
  });

  test("script insertion failure fails closed and allows a later retry", async () => {
    (globalThis as any).document = { createElement: () => ({}), head: {
      appendChild: () => { throw new Error("script blocked"); },
    } };
    try {
      await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: false, reason: "sdk_load_failed" });
      installPaddle();
      await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: true });
    } finally {
      delete (globalThis as any).document;
    }
  });

  test.each([
    ["sandbox", `live_${"a".repeat(27)}`],
    ["production", `test_${"a".repeat(27)}`],
    ["unknown", `live_${"a".repeat(27)}`],
    ["", `live_${"a".repeat(27)}`],
    ["production", "pdl_live_apikey_not-a-client-token"],
  ])("refuses the %s environment with a mismatched client token", async (environment, token) => {
    process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT = environment;
    process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = token;
    installPaddle();
    expect(paddleCheckoutAvailable("cortex")).toBe(false);
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: false, reason: "not_configured" });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(opened).toHaveLength(0);
  });

  test("selects sandbox before SDK initialization and requires the same scoped binding", async () => {
    process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT = "sandbox";
    process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = `test_${"a".repeat(27)}`;
    mockInvoke.mockResolvedValueOnce({ data: { ...checkoutBinding, environment: "sandbox" }, error: null });
    installPaddle();
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: true });
    const paddle = (globalThis as any).Paddle;
    expect(paddle.Environment.set).toHaveBeenCalledWith("sandbox");
    expect(paddle.Environment.set.mock.invocationCallOrder[0]).toBeLessThan(paddle.Initialize.mock.invocationCallOrder[0]);
  });

  test.each([
    { environment: "sandbox" }, { audience: "https://another.supabase.test" },
    { price_id: PRICES.brain_m }, { version: undefined },
  ])("rejects a binding from another environment, project, price, or version: %#", async (changed) => {
    mockInvoke.mockResolvedValueOnce({ data: { ...checkoutBinding, ...changed }, error: null } as never);
    installPaddle();
    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({ ok: false, reason: "binding_failed" });
    expect(opened).toHaveLength(0);
  });

  test("sends only the server-signed ownership binding as customData", async () => {
    installPaddle();
    const binding = { ...checkoutBinding, price_id: PRICES.cortex_y };
    mockInvoke.mockResolvedValueOnce({ data: binding, error: null });
    const r = await openPaddleCheckout({ tier: "cortex", cadence: "yearly" });
    expect(r).toEqual({ ok: true });
    expect(mockInvoke).toHaveBeenCalledWith("subscription-manage", {
      body: { action: "checkout_binding", price_id: PRICES.cortex_y, paddle_environment: "production" },
    });
    expect(opened).toHaveLength(1);
    const arg = opened[0] as any;
    expect(arg.customData).toEqual(binding);
    expect(arg.items).toEqual([{ priceId: PRICES.cortex_y, quantity: 1 }]);
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
