// Web checkout ownership contract. A browser-controlled user_id is not proof of
// account ownership: the authenticated subscription-manage function must bind it
// with an HMAC that paddle-webhook verifies before granting an entitlement.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createCheckoutBinding,
  hasMatchingPaddleWebhookSignature,
  parsePaddleWebhookSignature,
  verifyCheckoutBinding,
  verifyCheckoutBindingWithSecrets,
} from "../../../../supabase/functions/_shared/paddle-checkout-binding";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const authUser: { id?: string; email?: string } | null = { id: USER_ID, email: "a@b.com" };
const invoke = jest.fn();

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: authUser } }) },
    functions: { invoke },
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
  __resetPaddleSdkForTests();
  delete (globalThis as any).Paddle;
  process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = "live_test";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_MONTHLY = "pri_cortex_m";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY = "pri_cortex_y";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY = "pri_brain_m";
  process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY = "pri_brain_y";
  invoke.mockReset();
  invoke.mockResolvedValue({
    data: {
      user_id: USER_ID,
      issued_at: 1_788_600_000,
      nonce: "00112233445566778899aabbccddeeff",
      signature: "a".repeat(64),
    },
    error: null,
  });
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
  test("sends only the server-signed checkout ownership binding", async () => {
    installPaddle();
    const r = await openPaddleCheckout({ tier: "cortex", cadence: "yearly" });
    expect(r).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("subscription-manage", {
      body: { action: "checkout_binding" },
    });
    expect(opened).toHaveLength(1);
    const arg = opened[0] as any;
    expect(arg.customData).toEqual({
      user_id: USER_ID,
      issued_at: 1_788_600_000,
      nonce: "00112233445566778899aabbccddeeff",
      signature: "a".repeat(64),
    });
    expect(arg.items).toEqual([{ priceId: "pri_cortex_y", quantity: 1 }]);
  });

  test("fails closed before Paddle opens when the server cannot bind ownership", async () => {
    installPaddle();
    invoke.mockResolvedValueOnce({ data: null, error: new Error("fixture failure") });

    await expect(openPaddleCheckout({ tier: "cortex" })).resolves.toEqual({
      ok: false,
      reason: "binding_failed",
    });
    expect(opened).toHaveLength(0);
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

describe("paddle-webhook ownership boundary", () => {
  const root = join(__dirname, "..", "..", "..", "..");
  const webhook = readFileSync(
    join(root, "supabase", "functions", "paddle-webhook", "index.ts"),
    "utf8",
  );
  const manage = readFileSync(
    join(root, "supabase", "functions", "subscription-manage", "index.ts"),
    "utf8",
  );
  const webhookCode = webhook
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  test("the authenticated function signs the JWT subject with a server-only secret", () => {
    expect(manage).toContain("PADDLE_CHECKOUT_BINDING_SECRET");
    expect(manage).toMatch(/action === 'checkout_binding'/);
    expect(manage).toMatch(/createCheckoutBinding\(bindingSecret, userId/);
    expect(manage).not.toMatch(/pdl_(?:live|sdbx)_/);
  });

  test("the webhook verifies the signed binding before using custom_data.user_id", () => {
    expect(webhook).toContain("PADDLE_CHECKOUT_BINDING_SECRET");
    expect(webhookCode).toMatch(/await verifyCheckoutBindingWithSecrets\(data\.custom_data/);
    expect(webhookCode).toMatch(/const userId = await verifyCheckoutBindingWithSecrets/);
    expect(webhookCode).not.toMatch(/const userId = data\.custom_data\?\.user_id/);
  });

  test("keeps refunds available and requires a real DB owner anchor for legacy events", () => {
    expect(webhook.indexOf("if (isAdjustmentEvent)")).toBeLessThan(
      webhook.indexOf("PADDLE_CHECKOUT_BINDING_SECRET')"),
    );
    expect(webhook).toContain("PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS");
    expect(webhookCode).toMatch(/from\('paddle_webhook_events'\)/);
    expect(webhookCode).toMatch(/eq\('paddle_subscription_id', subscriptionId\)/);
    expect(webhookCode).toMatch(/eq\('provider', 'paddle'\)/);
    expect(webhookCode).toMatch(/not\('user_id', 'is', null\)/);
    expect(webhookCode).toMatch(/ownerAnchorError[\s\S]*owner_anchor_check_failed[\s\S]*503/);
    expect(webhookCode).toMatch(/!hasOwnerAnchor[\s\S]*unattributed_subscription[\s\S]*409/);
    expect(webhook.indexOf("let hasOwnerAnchor")).toBeLessThan(
      webhook.indexOf("admin.rpc('apply_billing_event'"),
    );
  });
});

describe("Paddle checkout binding cryptography", () => {
  const secret = "local-test-secret-with-at-least-32-bytes";
  const issuedAt = 1_788_600_000;
  const nonceBytes = Uint8Array.from({ length: 16 }, (_, index) => index);

  test("accepts an intact binding and rejects subject/signature tampering", async () => {
    const binding = await createCheckoutBinding(secret, USER_ID, { issuedAt, nonceBytes });
    await expect(verifyCheckoutBinding(binding, secret, issuedAt + 60)).resolves.toBe(USER_ID);
    await expect(verifyCheckoutBinding({ ...binding, user_id: "22222222-2222-4222-8222-222222222222" }, secret, issuedAt + 60)).resolves.toBeNull();
    const tamperedSignature = `${binding.signature[0] === "0" ? "1" : "0"}${binding.signature.slice(1)}`;
    await expect(verifyCheckoutBinding({ ...binding, signature: tamperedSignature }, secret, issuedAt + 60)).resolves.toBeNull();
  });

  test("rejects expired/future bindings and weak server secrets", async () => {
    const binding = await createCheckoutBinding(secret, USER_ID, { issuedAt, nonceBytes });
    await expect(verifyCheckoutBinding(binding, secret, issuedAt + 7 * 24 * 60 * 60 + 1)).resolves.toBeNull();
    await expect(verifyCheckoutBinding(binding, secret, issuedAt - 301)).resolves.toBeNull();
    await expect(createCheckoutBinding("too-short", USER_ID)).rejects.toThrow("binding secret");
  });

  test("accepts the previous server secret during a bounded rotation window", async () => {
    const previousSecret = "previous-local-test-secret-at-least-32-bytes";
    const binding = await createCheckoutBinding(previousSecret, USER_ID, { issuedAt, nonceBytes });

    await expect(
      verifyCheckoutBindingWithSecrets(
        binding,
        ["current-local-test-secret-at-least-32-bytes", previousSecret],
        issuedAt + 60,
      ),
    ).resolves.toBe(USER_ID);
  });
});

describe("Paddle webhook signature parsing", () => {
  test("keeps every valid h1 while Paddle rotates notification secrets", () => {
    const first = "a".repeat(64);
    const second = "B".repeat(64);

    expect(parsePaddleWebhookSignature(`ts=1671552777;h1=${first};h1=${second}`)).toEqual({
      timestamp: "1671552777",
      signatures: [first, second.toLowerCase()],
    });
    expect(hasMatchingPaddleWebhookSignature(first, [first, second.toLowerCase()])).toBe(true);
    expect(hasMatchingPaddleWebhookSignature(first, [second.toLowerCase(), first])).toBe(true);
  });

  test("rejects ambiguous timestamps and malformed signatures", () => {
    expect(
      parsePaddleWebhookSignature(`ts=1671552777;ts=1671552778;h1=${"a".repeat(64)}`),
    ).toEqual({ timestamp: null, signatures: [] });
    expect(parsePaddleWebhookSignature("ts=1671552777;h1=not-hex")).toEqual({
      timestamp: "1671552777",
      signatures: [],
    });
    expect(hasMatchingPaddleWebhookSignature("a".repeat(64), ["b".repeat(64)])).toBe(false);
  });
});
