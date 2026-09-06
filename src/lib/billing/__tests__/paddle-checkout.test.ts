// Web checkout ownership contract. A browser-controlled user_id is not proof of
// account ownership: the authenticated subscription-manage function must bind it
// with an HMAC that paddle-webhook verifies before granting an entitlement.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import {
  createCheckoutBinding,
  hasMatchingPaddleWebhookSignature,
  parsePaddleWebhookSignature,
  verifyCheckoutBinding,
  verifyCheckoutBindingWithSecrets,
} from "../../../../supabase/functions/_shared/paddle-checkout-binding";

type OwnerResolution = {
  userId: string | null;
  error: "ambiguous_owner_anchor" | "owner_binding_mismatch" | null;
};

type WebhookOwnershipHelpers = {
  resolvePaddleWebhookOwner: (
    signedUserId: string | null,
    rows: readonly { user_id?: unknown }[] | null,
  ) => OwnerResolution;
  previousBindingSecretForVerification: (
    secret: string,
    expiresAt: string,
    nowMs: number,
  ) => string | null;
};

type WebhookBoundaryHelpers = {
  validatePaddleEvent: (value: unknown) => unknown | null;
};

type RequestBoundaryModule = {
  readBoundedUtf8Body: (
    message: Request | Response,
    options: {
      maxBytes: number;
      timeoutMs: number;
      allowedContentTypes?: readonly string[];
      requireLengthMatch?: boolean;
    },
  ) => Promise<{ bytes: Uint8Array; text: string }>;
  parseJsonWithLimits: (text: string, maxDepth: number) => unknown;
};

const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const requestBoundaryPath = join(
  PROJECT_ROOT,
  "supabase",
  "functions",
  "_shared",
  "request-boundary.ts",
);

function loadRequestBoundary(): RequestBoundaryModule | null {
  if (!existsSync(requestBoundaryPath)) return null;
  const source = readFileSync(requestBoundaryPath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportsObj: Partial<RequestBoundaryModule> = {};
  new Function("exports", js)(exportsObj);
  if (
    typeof exportsObj.readBoundedUtf8Body !== "function"
    || typeof exportsObj.parseJsonWithLimits !== "function"
  ) return null;
  return exportsObj as RequestBoundaryModule;
}

function loadWebhookBoundaryHelpers(source: string): WebhookBoundaryHelpers {
  const start = source.indexOf("const MAX_PADDLE_WEBHOOK_BYTES");
  const end = source.indexOf("// ---------------------------------------------------------------------------", start);
  if (start < 0 || end < 0) throw new Error("Paddle webhook boundary helpers not found");
  const snippet = source.slice(start, end)
    + "\nexports.validatePaddleEvent = validatePaddleEvent;\n";
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportsObj: Partial<WebhookBoundaryHelpers> = {};
  new Function("exports", js)(exportsObj);
  if (typeof exportsObj.validatePaddleEvent !== "function") {
    throw new Error("Paddle webhook boundary helpers did not evaluate");
  }
  return exportsObj as WebhookBoundaryHelpers;
}

function loadWebhookOwnershipHelpers(source: string): WebhookOwnershipHelpers {
  const start = source.indexOf("const OWNER_ANCHOR_QUERY_LIMIT");
  const end = source.indexOf("\nDeno.serve", start);
  if (start < 0 || end < 0) throw new Error("Paddle webhook ownership helpers not found");
  const snippet = source.slice(start, end)
    + "\nexports.resolvePaddleWebhookOwner = resolvePaddleWebhookOwner;"
    + "\nexports.previousBindingSecretForVerification = previousBindingSecretForVerification;\n";
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportsObj: Partial<WebhookOwnershipHelpers> = {};
  new Function("exports", js)(exportsObj);
  if (
    typeof exportsObj.resolvePaddleWebhookOwner !== "function"
    || typeof exportsObj.previousBindingSecretForVerification !== "function"
  ) {
    throw new Error("Paddle webhook ownership helpers did not evaluate");
  }
  return exportsObj as WebhookOwnershipHelpers;
}

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

describe("Paddle request boundary primitives", () => {
  test("preserves the exact signed UTF-8 bytes while enforcing the declared length", async () => {
    const boundary = loadRequestBoundary();
    expect(boundary).not.toBeNull();
    if (!boundary) return;

    const text = '{"note":"한글"}';
    const expected = new TextEncoder().encode(text);
    const message = new Request("https://example.test/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(expected.byteLength),
      },
      body: expected,
    });
    const result = await boundary.readBoundedUtf8Body(message, {
      maxBytes: 1024,
      timeoutMs: 1000,
      allowedContentTypes: ["application/json"],
      requireLengthMatch: true,
    });

    expect(Array.from(result.bytes)).toEqual(Array.from(expected));
    expect(result.text).toBe(text);
  });

  test("rejects actual-byte overflow even without a content-length header", async () => {
    const boundary = loadRequestBoundary();
    expect(boundary).not.toBeNull();
    if (!boundary) return;

    const message = new Response(new Uint8Array(9), {
      headers: { "content-type": "application/json" },
    });
    await expect(boundary.readBoundedUtf8Body(message, {
      maxBytes: 8,
      timeoutMs: 1000,
      allowedContentTypes: ["application/json"],
    })).rejects.toMatchObject({ code: "body_too_large", status: 413 });
  });

  test("rejects ambiguous media types, duplicate keys, and excessive nesting", async () => {
    const boundary = loadRequestBoundary();
    expect(boundary).not.toBeNull();
    if (!boundary) return;

    const ambiguous = new Response("{}", {
      headers: { "content-type": "application/json, application/json" },
    });
    await expect(boundary.readBoundedUtf8Body(ambiguous, {
      maxBytes: 8,
      timeoutMs: 1000,
      allowedContentTypes: ["application/json"],
    })).rejects.toMatchObject({ code: "unsupported_content_type", status: 415 });
    expect(() => boundary.parseJsonWithLimits(
      '{"action":"cancel","action":"refund_request"}',
      4,
    )).toThrow("duplicate_json_key");
    expect(() => boundary.parseJsonWithLimits('{"outer":{"key":1,"key":2}}', 4))
      .toThrow("duplicate_json_key");
    expect(() => boundary.parseJsonWithLimits('{"a":{"b":{"c":1}}}', 2))
      .toThrow("json_too_deep");
  });

  test("rejects duplicate or mismatched lengths and malformed UTF-8", async () => {
    const boundary = loadRequestBoundary();
    expect(boundary).not.toBeNull();
    if (!boundary) return;

    const duplicateLengthHeaders = new Headers({
      "content-type": "application/json",
      "content-length": "2",
    });
    duplicateLengthHeaders.append("content-length", "2");
    await expect(boundary.readBoundedUtf8Body(new Response("{}", {
      headers: duplicateLengthHeaders,
    }), {
      maxBytes: 8,
      timeoutMs: 1000,
      allowedContentTypes: ["application/json"],
      requireLengthMatch: true,
    })).rejects.toMatchObject({ code: "invalid_content_length", status: 400 });

    await expect(boundary.readBoundedUtf8Body(new Response("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": "1",
      },
    }), {
      maxBytes: 8,
      timeoutMs: 1000,
      allowedContentTypes: ["application/json"],
      requireLengthMatch: true,
    })).rejects.toMatchObject({ code: "content_length_mismatch", status: 400 });

    await expect(boundary.readBoundedUtf8Body(new Response(
      Uint8Array.from([0xc3, 0x28]),
      { headers: { "content-type": "application/json" } },
    ), {
      maxBytes: 8,
      timeoutMs: 1000,
      allowedContentTypes: ["application/json"],
    })).rejects.toMatchObject({ code: "invalid_utf8", status: 400 });
  });

  test("cancels a stalled body at one overall read deadline", async () => {
    const boundary = loadRequestBoundary();
    expect(boundary).not.toBeNull();
    if (!boundary) return;

    const cancel = jest.fn();
    const stalled = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel,
    });
    await expect(boundary.readBoundedUtf8Body(new Response(stalled, {
      headers: { "content-type": "application/json" },
    }), {
      maxBytes: 8,
      timeoutMs: 25,
      allowedContentTypes: ["application/json"],
    })).rejects.toMatchObject({ code: "body_read_timeout", status: 408 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("Paddle webhook request and upstream boundaries", () => {
  const webhook = readFileSync(
    join(PROJECT_ROOT, "supabase", "functions", "paddle-webhook", "index.ts"),
    "utf8",
  );
  const code = webhook.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  test("bounds and validates the exact raw body before signature verification", () => {
    expect(code).toMatch(/req\.method !== 'POST'/);
    expect(code).toMatch(/MAX_PADDLE_WEBHOOK_BYTES = 512 \* 1024/);
    expect(code).toMatch(/readBoundedUtf8Body\(req,[\s\S]*allowedContentTypes: \['application\/json'\]/);
    expect(code).toMatch(/parseJsonWithLimits\(raw, MAX_PADDLE_WEBHOOK_JSON_DEPTH\)/);
    expect(code).toMatch(/validatePaddleEvent\(parsed\)/);
    expect(code).not.toMatch(/await req\.text\(\)/);
    expect(code).not.toMatch(/new TextEncoder\(\)\.encode\(raw\)/);
    expect(code.indexOf("readBoundedUtf8Body(req")).toBeLessThan(
      code.indexOf("hmacSha256Hex(secret, timestamp, rawBytes)"),
    );
  });

  test("rejects an ambiguous signature header before reading the request body", () => {
    expect(code).toMatch(/const signatureHeader = req\.headers\.get\('paddle-signature'\) \?\? ''/i);
    expect(code).toMatch(/signatureHeader\.includes\(','\)[\s\S]*bad_signature/);
    expect(code.indexOf("signatureHeader.includes(',')")).toBeLessThan(
      code.indexOf("readBoundedUtf8Body(req"),
    );
  });

  test("fetches only the fixed IP endpoint with redirect, byte, and shape caps", () => {
    expect(code).toMatch(/fetch\(PADDLE_IPS_URL,[\s\S]*redirect: 'error'/);
    expect(code).toMatch(/readBoundedUtf8Body\(res,[\s\S]*maxBytes: MAX_PADDLE_IP_LIST_BYTES/);
    expect(code).toMatch(/MAX_PADDLE_IPV4_CIDRS = 256/);
    expect(code).toMatch(/isValidPaddleIpv4Cidr/);
    expect(code).not.toMatch(/await res\.json\(\)/);
  });

  test("rejects malformed known event fields before any billing write", () => {
    const { validatePaddleEvent } = loadWebhookBoundaryHelpers(webhook);
    const valid = {
      event_id: "evt_01abc",
      event_type: "transaction.completed",
      occurred_at: "2026-09-06T12:00:00.000Z",
      data: { id: "txn_01abc", currency_code: "USD" },
    };

    expect(validatePaddleEvent(valid)).not.toBeNull();
    expect(validatePaddleEvent({ ...valid, event_id: "evt_01abc\nforged" })).toBeNull();
    expect(validatePaddleEvent({ ...valid, event_type: 7 })).toBeNull();
    expect(validatePaddleEvent({ ...valid, data: null })).toBeNull();
    expect(validatePaddleEvent({ ...valid, data: { items: Array.from({ length: 101 }, () => ({})) } }))
      .toBeNull();
    expect(validatePaddleEvent({
      ...valid,
      data: { custom_data: { issued_at: "1788600000" } },
    })).toBeNull();
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
    expect(webhookCode).toMatch(/const signedUserId = await verifyCheckoutBindingWithSecrets/);
    expect(webhookCode).not.toMatch(/const userId = data\.custom_data\?\.user_id/);
  });

  test("keeps refunds available and always resolves a bounded DB owner anchor", () => {
    expect(webhook.indexOf("if (isAdjustmentEvent)")).toBeLessThan(
      webhook.indexOf("PADDLE_CHECKOUT_BINDING_SECRET')"),
    );
    expect(webhook).toContain("PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS");
    expect(webhookCode).toMatch(/from\('paddle_webhook_events'\)/);
    expect(webhookCode).toMatch(/eq\('paddle_subscription_id', subscriptionId\)/);
    expect(webhookCode).toMatch(/eq\('provider', 'paddle'\)/);
    expect(webhookCode).toMatch(/not\('user_id', 'is', null\)/);
    expect(webhookCode).toMatch(/limit\(OWNER_ANCHOR_QUERY_LIMIT\)/);
    expect(webhookCode).toMatch(/ownerAnchorError[\s\S]*owner_anchor_check_failed[\s\S]*503/);
    expect(webhookCode).toMatch(/ownerResolution\.error[\s\S]*409/);
    expect(webhookCode).toMatch(/!resolvedUserId[\s\S]*unattributed_subscription[\s\S]*409/);
    expect(webhook).not.toMatch(/if \(!(?:userId|signedUserId) && subscriptionId\)/);
    expect(webhook.indexOf("const ownerResolution")).toBeLessThan(
      webhook.indexOf("admin.rpc('apply_billing_event'"),
    );
    expect(webhookCode).toMatch(/p_user_id: resolvedUserId/);
  });

  test("accepts the previous binding key only inside an explicit server deadline", () => {
    expect(webhook).toContain("PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS_EXPIRES_AT");
    expect(webhookCode).toMatch(
      /previousBindingSecretForVerification\([\s\S]*previousBindingSecret[\s\S]*previousBindingExpiresAt/,
    );
    expect(webhookCode).toMatch(/if \(acceptedPreviousBindingSecret\)[\s\S]*bindingSecrets\.push/);
    expect(webhookCode).not.toMatch(/if \(previousBindingSecret\.length >= 32\) bindingSecrets\.push/);
    expect(webhook).toContain("previous_checkout_binding_secret_ignored");
  });
});

describe("Paddle webhook owner resolution", () => {
  const root = join(__dirname, "..", "..", "..", "..");
  const source = readFileSync(
    join(root, "supabase", "functions", "paddle-webhook", "index.ts"),
    "utf8",
  );

  test("rejects a valid binding when the stored subscription belongs to another user", () => {
    const { resolvePaddleWebhookOwner } = loadWebhookOwnershipHelpers(source);
    expect(resolvePaddleWebhookOwner(USER_ID, [
      { user_id: "22222222-2222-4222-8222-222222222222" },
    ])).toEqual({ userId: null, error: "owner_binding_mismatch" });
  });

  test("uses the unique stored owner for a renewal without a live binding", () => {
    const { resolvePaddleWebhookOwner } = loadWebhookOwnershipHelpers(source);
    const owner = "22222222-2222-4222-8222-222222222222";
    expect(resolvePaddleWebhookOwner(null, [
      { user_id: owner },
      { user_id: owner },
    ])).toEqual({ userId: owner, error: null });
  });

  test("fails closed for conflicting owners or a truncated owner query", () => {
    const { resolvePaddleWebhookOwner } = loadWebhookOwnershipHelpers(source);
    expect(resolvePaddleWebhookOwner(null, [
      { user_id: USER_ID },
      { user_id: "22222222-2222-4222-8222-222222222222" },
    ])).toEqual({ userId: null, error: "ambiguous_owner_anchor" });
    expect(resolvePaddleWebhookOwner(null, Array.from(
      { length: 101 },
      () => ({ user_id: USER_ID }),
    ))).toEqual({ userId: null, error: "ambiguous_owner_anchor" });
  });
});

describe("Paddle previous checkout-binding key deadline", () => {
  const root = join(__dirname, "..", "..", "..", "..");
  const source = readFileSync(
    join(root, "supabase", "functions", "paddle-webhook", "index.ts"),
    "utf8",
  );
  const secret = "previous-local-test-secret-at-least-32-bytes";
  const nowMs = Date.parse("2026-09-06T12:00:00.000Z");

  test.each([
    ["", "missing deadline"],
    ["not-a-deadline", "invalid deadline"],
    ["2026-09-06T11:59:59.000Z", "expired UTC deadline"],
    [String(Math.floor(nowMs / 1000)), "expired epoch deadline"],
  ])("ignores the previous key for %s (%s)", (deadline) => {
    const { previousBindingSecretForVerification } = loadWebhookOwnershipHelpers(source);
    expect(previousBindingSecretForVerification(secret, deadline, nowMs)).toBeNull();
  });

  test.each([
    "2026-09-06T12:05:00.000Z",
    String(Math.floor(nowMs / 1000) + 300),
  ])("accepts the previous key before a valid deadline: %s", (deadline) => {
    const { previousBindingSecretForVerification } = loadWebhookOwnershipHelpers(source);
    expect(previousBindingSecretForVerification(secret, deadline, nowMs)).toBe(secret);
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
