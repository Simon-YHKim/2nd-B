// Structural guard for refund adjustment handling in paddle-webhook.
//
// Source assertions pin the broad boundary, while the runtime harness below
// executes the signed handler with a fake service-role client. The combination
// catches both source drift and orchestration bugs between lifecycle recording,
// consequence application, durable review, and Paddle retry responses.

import { createHmac, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import * as requestJson from "../../../../supabase/functions/_shared/request-json";
import * as paddleEnvironment from "../../../../supabase/functions/_shared/paddle-environment";
import * as checkoutBindings from "../../../../supabase/functions/_shared/paddle-checkout-binding";

const ROOT = join(__dirname, "..", "..", "..", "..");
const source = readFileSync(
  join(ROOT, "supabase", "functions", "paddle-webhook", "index.ts"),
  "utf8",
);
const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

type OwnerResolution = {
  userId: string | null;
  error: "ambiguous_owner_anchor" | "owner_binding_mismatch" | null;
};

type WebhookOwnershipHelpers = {
  resolvePaddleWebhookOwner: (
    signedUserId: string | null,
    anchoredUserId: string | null,
    hasDifferentOwner: boolean,
  ) => OwnerResolution;
  ownerIdFromAnchorRows: (rows: unknown) => {
    userId: string | null;
    error: "invalid_owner_anchor" | null;
  };
  previousBindingSecretForVerification: (
    secret: string,
    expiresAt: string,
    nowMs: number,
  ) => string | null;
};

function loadWebhookOwnershipHelpers(): WebhookOwnershipHelpers {
  const start = source.indexOf("const PADDLE_OWNER_UUID_RE");
  const end = source.indexOf("\nDeno.serve", start);
  if (start < 0 || end < 0) throw new Error("Paddle webhook ownership helpers not found");
  const snippet = source.slice(start, end)
    + "\nexports.resolvePaddleWebhookOwner = resolvePaddleWebhookOwner;"
    + "\nexports.ownerIdFromAnchorRows = ownerIdFromAnchorRows;"
    + "\nexports.previousBindingSecretForVerification = previousBindingSecretForVerification;\n";
  const compiled = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as Partial<WebhookOwnershipHelpers> };
  new Function("module", "exports", compiled)(loaded, loaded.exports);
  if (
    typeof loaded.exports.resolvePaddleWebhookOwner !== "function"
    || typeof loaded.exports.ownerIdFromAnchorRows !== "function"
    || typeof loaded.exports.previousBindingSecretForVerification !== "function"
  ) throw new Error("Paddle webhook ownership helpers did not evaluate");
  return loaded.exports as WebhookOwnershipHelpers;
}

const adjustmentStart = code.indexOf("const isAdjustmentEvent");
const entitlementStart = code.indexOf("const isSubscriptionEvent");
const adjustmentBlock = code.slice(adjustmentStart, entitlementStart);

describe("paddle-webhook refund adjustments", () => {
  test("handles money-out adjustments while ignoring unrelated adjustments", () => {
    expect(adjustmentStart).toBeGreaterThan(-1);
    expect(entitlementStart).toBeGreaterThan(adjustmentStart);
    expect(adjustmentBlock).toMatch(/eventType === 'adjustment\.created'/);
    expect(adjustmentBlock).toMatch(/eventType === 'adjustment\.updated'/);
    expect(adjustmentBlock).toMatch(
      /MONEY_OUT_ADJUSTMENT_ACTIONS\.has\(adjustmentAction\)[\s\S]*?ignored: 'non_refund_adjustment'/,
    );
    expect(code).toMatch(
      /MONEY_OUT_ADJUSTMENT_ACTIONS = new Set\(\[[\s\S]*?'refund'[\s\S]*?'chargeback'[\s\S]*?'chargeback_warning'/,
    );
    expect(code).toMatch(
      /CHARGEBACK_REVERSAL_ACTIONS = new Set\(\[[\s\S]*?'chargeback_reverse'[\s\S]*?'chargeback_warning_reverse'/,
    );
  });

  test("requires Paddle object ids and a supported refund status", () => {
    expect(code).toMatch(
      /REFUND_ADJUSTMENT_STATUSES = new Set\(\[[\s\S]*?'pending_approval'[\s\S]*?'approved'[\s\S]*?'rejected'[\s\S]*?'reversed'/,
    );
    expect(adjustmentBlock).toMatch(/typeof data\.id === 'string'[\s\S]*?data\.id\.trim\(\)/);
    expect(adjustmentBlock).toMatch(
      /typeof data\.transaction_id === 'string'[\s\S]*?data\.transaction_id\.trim\(\)/,
    );
    // 0123 split this in two: a missing id is unrecoverable and stays a 400,
    // while an unrecognised status is recorded rather than refused (the status
    // set is an assumption, and refusing lost the event entirely).
    expect(adjustmentBlock).toMatch(/typeof data\.status === 'string'/);
    expect(adjustmentBlock).toMatch(/error: 'invalid_refund_adjustment'[\s\S]*?400/);
  });

  test("records through the service-role RPC and returns its result", () => {
    expect(adjustmentBlock).toMatch(/rpc\('record_paddle_refund_adjustment'/);
    expect(adjustmentBlock).toMatch(/p_event_id: eventId/);
    expect(adjustmentBlock).toMatch(/p_event_type: eventType/);
    expect(adjustmentBlock).toMatch(/p_adjustment_id: adjustmentId/);
    expect(adjustmentBlock).toMatch(/p_transaction_id: adjustmentTransactionId/);
    expect(adjustmentBlock).toMatch(/p_status: adjustmentStatus/);
    expect(adjustmentBlock).toMatch(/p_occurred_at: occurredAt/);
    expect(adjustmentBlock).toMatch(/return json\(\{ ok: true, result, applied \}\)/);
  });

  test("surfaces ledger failures so Paddle can retry", () => {
    expect(adjustmentBlock).toMatch(
      /if \(error\)[\s\S]*?error: 'refund_adjustment_apply_failed'[\s\S]*?, 500/,
    );
  });

  // The invariant, stated precisely (0119). An adjustment must never enter
  // apply_billing_event: that is the price-id -> tier mapping writer, and running
  // an adjustment through it would clobber the tier and the billing-period expiry
  // off a payload that describes neither. It may, and now does, reach the narrow
  // apply_billing_refund path, which only writes the offsetting revenue row and
  // revokes to 'free' for a FULL approved refund under 0109's ordering guard.
  // Without that, an approved refund returned the money and left the paid tier
  // live for the rest of the period while auto-renewal kept billing.
  test("never calls the price-mapping entitlement writer", () => {
    expect(adjustmentBlock).not.toMatch(/apply_billing_event/);
    expect(adjustmentBlock).not.toMatch(/p_tier|subscription_tier|tier\s*=/);
    expect(adjustmentBlock).toMatch(/return json\(\{ ok: true, result, applied \}\)/);
  });

  test("an APPROVED refund also applies its consequence, and only then", () => {
    expect(adjustmentBlock).toMatch(/if \(adjustmentStatus === 'approved'\)/);
    expect(adjustmentBlock).toMatch(/rpc\('apply_billing_refund'/);
    expect(adjustmentBlock).toMatch(/rpc\('set_paddle_refund_review'/);
    expect(adjustmentBlock).toMatch(/error: 'refund_consequence_failed'[\s\S]*?, 503/);
  });
});

describe("paddle-webhook checkout ownership", () => {
  test("verifies the complete HMAC binding and never trusts raw custom_data.user_id", () => {
    expect(code).toMatch(/verifyCheckoutBindingWithSecrets\(data\.custom_data, bindingSecrets, undefined,/);
    expect(code).not.toMatch(/const userId = data\.custom_data\?\.user_id/);
    expect(code).toMatch(/p_user_id: resolvedUserId/);
  });

  test("accepts a previous binding secret only before an explicit deadline", () => {
    expect(code).toMatch(/PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS/);
    expect(code).toMatch(/PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS_EXPIRES_AT/);
    expect(code).toMatch(/previousBindingSecretForVerification/);
  });

  test("uses two limit-one queries instead of counting bounded history rows", () => {
    expect(code).toMatch(/from\('paddle_webhook_events'\)/);
    expect(code).toMatch(/\.eq\('paddle_subscription_id', subscriptionId\)/);
    expect(code).toMatch(/\.order\('occurred_at', \{ ascending: false, nullsFirst: false \}\)/);
    expect(code).toMatch(/\.neq\('user_id', comparisonOwnerId\)/);
    expect(code.match(/\.limit\(1\)/g)).toHaveLength(2);
    expect(code).not.toMatch(/OWNER_ANCHOR_QUERY_LIMIT/);
    expect(code).toMatch(
      /resolvePaddleWebhookOwner\(\s*signedUserId,\s*anchoredUserId,\s*hasDifferentOwner,?\s*\)/,
    );
    expect(code).toMatch(/'owner_binding_mismatch'/);
    expect(code).toMatch(/'ambiguous_owner_anchor'/);
  });

  test("fails closed when either bounded owner query fails", () => {
    expect(code).toMatch(/ownerAnchorError[\s\S]*owner_anchor_check_failed[\s\S]*503/);
    expect(code).toMatch(/ownerConflictError[\s\S]*owner_anchor_check_failed[\s\S]*503/);
  });

  test("fails retryably instead of acknowledging an unattributed billing event", () => {
    expect(code).toMatch(/error: 'unattributed_subscription'[\s\S]*?409/);
    expect(code).not.toMatch(/ignored: 'no_user'/);
  });

  test("preserves the stronger refund rail before strict checkout rollout checks", () => {
    const adjustmentAt = code.indexOf("const isAdjustmentEvent");
    const bindingAt = code.indexOf("const bindingSecret");
    expect(adjustmentAt).toBeGreaterThan(-1);
    expect(bindingAt).toBeGreaterThan(adjustmentAt);
  });
});

describe("paddle-webhook owner resolution", () => {
  const USER_ID = "11111111-1111-4111-8111-111111111111";
  const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

  test("rejects a valid binding when the stored subscription belongs to another user", () => {
    const { resolvePaddleWebhookOwner } = loadWebhookOwnershipHelpers();
    expect(resolvePaddleWebhookOwner(USER_ID, OTHER_USER_ID, false)).toEqual({
      userId: null,
      error: "owner_binding_mismatch",
    });
  });

  test("uses the unique stored owner for a renewal without a live binding", () => {
    const { resolvePaddleWebhookOwner } = loadWebhookOwnershipHelpers();
    expect(resolvePaddleWebhookOwner(null, OTHER_USER_ID, false)).toEqual({
      userId: OTHER_USER_ID,
      error: null,
    });
  });

  test("fails closed for a distinct stored owner or malformed anchor", () => {
    const { resolvePaddleWebhookOwner, ownerIdFromAnchorRows } = loadWebhookOwnershipHelpers();
    expect(resolvePaddleWebhookOwner(null, USER_ID, true)).toEqual({
      userId: null,
      error: "ambiguous_owner_anchor",
    });
    expect(ownerIdFromAnchorRows([{ user_id: "not-a-uuid" }])).toEqual({
      userId: null,
      error: "invalid_owner_anchor",
    });
  });
});

describe("paddle-webhook previous checkout-binding key deadline", () => {
  const secret = "previous-local-test-secret-at-least-32-bytes";
  const nowMs = Date.parse("2026-09-06T12:00:00.000Z");

  test.each([
    "",
    "not-a-deadline",
    "2026-09-06T11:59:59.000Z",
    "2026-02-30T12:05:00.000Z",
    String(Math.floor(nowMs / 1000)),
  ])("ignores the previous key outside a valid future deadline: %s", (deadline) => {
    const { previousBindingSecretForVerification } = loadWebhookOwnershipHelpers();
    expect(previousBindingSecretForVerification(secret, deadline, nowMs)).toBeNull();
  });

  test.each([
    "2026-09-06T12:05:00.000Z",
    String(Math.floor(nowMs / 1000) + 300),
  ])("accepts the previous key only before a valid deadline: %s", (deadline) => {
    const { previousBindingSecretForVerification } = loadWebhookOwnershipHelpers();
    expect(previousBindingSecretForVerification(secret, deadline, nowMs)).toBe(secret);
  });
});

// ── 0123: an unverified assumption must not be able to lose a refund ─────────
// REFUND_ADJUSTMENT_STATUSES was written from model knowledge; no adjustment
// webhook has been observed on this project. A 400 for an unexpected status made
// Paddle retry, fail, and leave NO row on our side - the refund would be visible
// only in Paddle's dashboard, which is not where anyone looks for a missing one.
describe("paddle-webhook - an unknown adjustment status is recorded, not dropped", () => {
  test("unknown status returns 200 and records the event with its payload", () => {
    expect(adjustmentBlock).toMatch(/!REFUND_ADJUSTMENT_STATUSES\.has\(adjustmentStatus\)/);
    expect(adjustmentBlock).toMatch(/rpc\('record_unhandled_billing_event'/);
    expect(adjustmentBlock).toMatch(/p_payload: event/);
    expect(adjustmentBlock).toMatch(/ignored: 'unhandled_adjustment_status'/);
  });

  test("it is greppable in the logs", () => {
    // Fixed string on purpose: this is what an operator searches for.
    expect(source).toContain("[paddle-webhook][ALERT] unhandled_adjustment_status");
  });

  test("it still touches neither the entitlement nor revenue", () => {
    const at = adjustmentBlock.indexOf("record_unhandled_billing_event");
    const ret = adjustmentBlock.indexOf("unhandled_adjustment_status'", at);
    const between = adjustmentBlock.slice(at, ret);
    expect(between).not.toMatch(/apply_billing_refund|apply_billing_event|record_paddle_refund_adjustment/);
  });

  test("a MISSING id is still a 400: the target must never be guessed", () => {
    expect(adjustmentBlock).toMatch(
      /if \(!adjustmentId \|\| !adjustmentTransactionId\) \{[\s\S]*?error: 'invalid_refund_adjustment'[\s\S]*?400/,
    );
    // and the status is no longer part of that same refusal
    expect(adjustmentBlock).not.toMatch(
      /!adjustmentId \|\| !adjustmentTransactionId \|\| !REFUND_ADJUSTMENT_STATUSES/,
    );
  });

  test("failing to record is a 500, so Paddle keeps retrying", () => {
    expect(adjustmentBlock).toMatch(/error: 'unhandled_adjustment_record_failed'[\s\S]*?500/);
  });
});

type RpcReply = { data: unknown; error: { message: string } | null };
type RpcImplementation = (name: string, args: Record<string, unknown>) => Promise<RpcReply>;
type EdgeHandler = (request: Request) => Promise<Response>;
type RuntimeOptions = {
  env?: Record<string, string | undefined>;
  realBinding?: boolean;
  bindingUserId?: string | null;
  anchorRows?: Array<{ user_id: unknown }>;
  conflictingOwnerRows?: Array<{ user_id: unknown }>;
  anchorError?: { message: string } | null;
  conflictError?: { message: string } | null;
};

const WEBHOOK_SECRET = "test-secret";

function loadRuntimeHandler(implementation: RpcImplementation, options: RuntimeOptions = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const rpc = jest.fn(implementation);
  const ownerQuery = (
    data: Array<{ user_id: unknown }>,
    error: { message: string } | null,
  ) => {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      not: jest.fn(),
      order: jest.fn(),
      neq: jest.fn(),
      limit: jest.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.not.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.neq.mockReturnValue(query);
    query.limit.mockResolvedValue({ data, error } as never);
    return query;
  };
  const ownerQueries = [
    ownerQuery(options.anchorRows ?? [], options.anchorError ?? null),
    ownerQuery(options.conflictingOwnerRows ?? [], options.conflictError ?? null),
  ];
  let ownerQueryIndex = 0;
  const from = jest.fn(() => ownerQueries[ownerQueryIndex++] ?? ownerQueries[1]);
  const verifyBinding = jest.fn(async (...args: Parameters<typeof checkoutBindings.verifyCheckoutBindingWithSecrets>) =>
    options.realBinding ? checkoutBindings.verifyCheckoutBindingWithSecrets(...args) : options.bindingUserId ?? null);
  let handler: EdgeHandler | null = null;
  const deno = {
    env: {
      get: (name: string) => ({
        PADDLE_WEBHOOK_ENABLED: "1",
        PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        PADDLE_IP_ALLOWLIST: "off",
        PADDLE_CHECKOUT_BINDING_SECRET: "runtime-checkout-binding-secret-32-bytes",
        PADDLE_PRICE_CORTEX: "pri_cortex",
        SUPABASE_URL: "https://example.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
        ...options.env,
      })[name],
    },
    serve: (value: EdgeHandler) => { handler = value; },
  };
  const loaded = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", "Deno", "crypto", compiled)(
    (id: string) => {
      if (id === "https://esm.sh/@supabase/supabase-js@2") {
        return { createClient: () => ({ rpc, from }) };
      }
      if (id === "../_shared/request-json.ts") {
        // The real media-type check and strict JSON parser run here, so every
        // signed fixture in this file also crosses the post-HMAC boundary.
        return {
          ...requestJson,
          PADDLE_WEBHOOK_BODY_LIMIT_BYTES: 256_000,
          readBodyBytes: async (request: Request) => new Uint8Array(await request.arrayBuffer()),
        };
      }
      if (id === "../_shared/paddle-checkout-binding.ts") {
        return { verifyCheckoutBindingWithSecrets: verifyBinding };
      }
      if (id === "../_shared/paddle-environment.ts") return paddleEnvironment;
      throw new Error(`Unexpected edge dependency: ${id}`);
    },
    loaded,
    loaded.exports,
    deno,
    webcrypto,
  );
  if (!handler) throw new Error("paddle-webhook did not register a handler");
  return { handler: handler as EdgeHandler, rpc, from, ownerQueries, verifyBinding };
}

function signedAdjustment(
  overrides: Record<string, unknown> = {},
  eventId = "evt_refund_1",
  appendInvalidRotatingSignature = false,
): Request {
  const payload = {
    event_id: eventId,
    event_type: "adjustment.updated",
    occurred_at: "2026-09-10T01:02:03.000Z",
    data: {
      id: "adj_refund_1",
      transaction_id: "txn_refund_1",
      action: "refund",
      status: "approved",
      type: "partial",
      items: [{ type: "partial" }],
      totals: { total: "500", currency_code: "USD" },
      currency_code: "USD",
      ...overrides,
    },
  };
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}:${raw}`)
    .digest("hex");
  return new Request("https://example.invalid/functions/v1/paddle-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Paddle-Signature": `ts=${timestamp};h1=${signature}${
        appendInvalidRotatingSignature ? `;h1=${"0".repeat(64)}` : ""
      }`,
    },
    body: raw,
  });
}

function signedBillingEvent(
  customData: unknown,
  eventId = "evt_subscription_1",
  priceId = "pri_cortex",
): Request {
  const payload = {
    event_id: eventId,
    event_type: "subscription.created",
    occurred_at: "2026-09-10T01:02:03.000Z",
    data: {
      id: "sub_ownership_1",
      status: "active",
      custom_data: customData,
      items: [{ price: { id: priceId } }],
      current_billing_period: { ends_at: "2026-10-10T01:02:03.000Z" },
    },
  };
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}:${raw}`)
    .digest("hex");
  return new Request("https://example.invalid/functions/v1/paddle-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Paddle-Signature": `ts=${timestamp};h1=${signature}`,
    },
    body: raw,
  });
}

const okRpc: RpcImplementation = async (name) => ({
  data: name === "record_paddle_refund_adjustment"
    ? "applied"
    : name === "apply_billing_refund"
      ? "recorded"
      : "updated",
  error: null,
});

describe("paddle-webhook ownership runtime", () => {
  const USER_ID = "11111111-1111-4111-8111-111111111111";
  const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

  test("an isolated sandbox subscription grants only with a matching real scoped HMAC", async () => {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    const price = `pri_${"a".repeat(26)}`;
    const secret = "runtime-checkout-binding-secret-32-bytes";
    const scope = { environment: "sandbox" as const, audience: "https://sandbox.supabase.co", price_id: price };
    const env = { PADDLE_ENVIRONMENT: "sandbox", SUPABASE_URL: scope.audience,
      PADDLE_SANDBOX_SUPABASE_URL: scope.audience, PADDLE_LIVE_SUPABASE_URL: "https://live.supabase.co",
      PADDLE_PRICE_CORTEX: price,
    };
    const binding = await checkoutBindings.createCheckoutBinding(secret, USER_ID, { scope });
    const good = loadRuntimeHandler(okRpc, { env, realBinding: true });
    expect((await good.handler(signedBillingEvent(binding, "evt_sandbox", price))).status).toBe(200);
    expect(good.rpc.mock.calls.find(([name]) => name === "apply_billing_event")?.[1]).toMatchObject({
      p_user_id: USER_ID, p_tier: "cortex",
    });

    for (const changed of [
      { ...binding, environment: "production" }, { ...binding, audience: "https://live.supabase.co" },
    ]) {
      const bad = loadRuntimeHandler(okRpc, { env, realBinding: true, anchorRows: [{ user_id: USER_ID }] });
      expect((await bad.handler(signedBillingEvent(changed, "evt_crossed", price))).status).toBe(403);
      expect(bad.rpc).not.toHaveBeenCalled();
      expect(bad.from).not.toHaveBeenCalled();
    }
    const legacy = await checkoutBindings.createCheckoutBinding(secret, USER_ID);
    const bad = loadRuntimeHandler(okRpc, { env, realBinding: true });
    expect((await bad.handler(signedBillingEvent(legacy, "evt_legacy", price))).status).toBe(403);
    expect(bad.rpc).not.toHaveBeenCalled();
  });

  test("sandbox callbacks cannot write refunds or entitlements into the live database", async () => {
    const { handler, rpc, from } = loadRuntimeHandler(okRpc, { env: {
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_SANDBOX_SUPABASE_URL: "https://sandbox.supabase.co",
      PADDLE_LIVE_SUPABASE_URL: "https://live.supabase.co",
      SUPABASE_URL: "https://live.supabase.co",
    } });
    expect((await handler(signedAdjustment())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("applies a new subscription to the cryptographically verified owner", async () => {
    const { handler, rpc, verifyBinding } = loadRuntimeHandler(okRpc, {
      bindingUserId: USER_ID,
    });

    const response = await handler(signedBillingEvent({ signed: "fixture" }));

    expect(response.status).toBe(200);
    expect(verifyBinding).toHaveBeenCalledWith(
      { signed: "fixture" },
      ["runtime-checkout-binding-secret-32-bytes"],
      undefined,
      { environment: "production", audience: "https://example.invalid", price_id: "pri_cortex" },
    );
    expect(rpc.mock.calls.find(([name]) => name === "apply_billing_event")?.[1]).toMatchObject({
      p_user_id: USER_ID,
      p_subscription_id: "sub_ownership_1",
    });
  });

  test("rejects a signed owner that conflicts with the stored subscription anchor", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc, {
      bindingUserId: USER_ID,
      anchorRows: [{ user_id: OTHER_USER_ID }],
    });

    const response = await handler(signedBillingEvent({ signed: "fixture" }, "evt_conflict"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "owner_binding_mismatch" });
    expect(rpc).not.toHaveBeenCalledWith("apply_billing_event", expect.anything());
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("owner_resolution_failed");
    errorSpy.mockRestore();
  });

  test("accepts an unsigned renewal with 8+ same-owner history via two limit-one queries", async () => {
    const { handler, rpc, from, ownerQueries } = loadRuntimeHandler(okRpc, {
      // The database may hold any number of rows; query one returns only the
      // deterministic latest anchor and query two proves no different owner.
      anchorRows: [{ user_id: OTHER_USER_ID }],
      conflictingOwnerRows: [],
    });

    const response = await handler(signedBillingEvent(null, "evt_anchored"));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.find(([name]) => name === "apply_billing_event")?.[1]).toMatchObject({
      p_user_id: OTHER_USER_ID,
    });
    expect(from).toHaveBeenCalledTimes(2);
    expect(ownerQueries[0].limit).toHaveBeenCalledWith(1);
    expect(ownerQueries[1].neq).toHaveBeenCalledWith("user_id", OTHER_USER_ID);
    expect(ownerQueries[1].limit).toHaveBeenCalledWith(1);
  });

  test("rejects when the second bounded query finds a different stored owner", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc, {
      anchorRows: [{ user_id: USER_ID }],
      conflictingOwnerRows: [{ user_id: OTHER_USER_ID }],
    });

    const response = await handler(signedBillingEvent(null, "evt_stored_conflict"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "ambiguous_owner_anchor" });
    expect(rpc).not.toHaveBeenCalledWith("apply_billing_event", expect.anything());
    errorSpy.mockRestore();
  });

  test("rejects a malformed deterministic owner anchor", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc, from } = loadRuntimeHandler(okRpc, {
      anchorRows: [{ user_id: "not-a-uuid" }],
    });

    const response = await handler(signedBillingEvent(null, "evt_bad_anchor"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "ambiguous_owner_anchor" });
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith("apply_billing_event", expect.anything());
    errorSpy.mockRestore();
  });

  test("fails closed when the different-owner existence query errors", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc, {
      anchorRows: [{ user_id: USER_ID }],
      conflictError: { message: "database unavailable" },
    });

    const response = await handler(signedBillingEvent(null, "evt_conflict_query_error"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "owner_anchor_check_failed" });
    expect(rpc).not.toHaveBeenCalledWith("apply_billing_event", expect.anything());
    errorSpy.mockRestore();
  });

  test("returns non-2xx when neither a binding nor an owner anchor exists", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedBillingEvent(null, "evt_unattributed"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "unattributed_subscription" });
    expect(rpc).not.toHaveBeenCalledWith("apply_billing_event", expect.anything());
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("unattributed_subscription");
    errorSpy.mockRestore();
  });
});

describe("paddle-webhook refund integrity runtime", () => {
  test("accepts any matching h1 while Paddle rotates webhook secrets", async () => {
    const { handler } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment({}, "evt_refund_rotation", true));

    expect(response.status).toBe(200);
  });

  test("a provider partial refund passes false to SQL even when a self-service row may be accepted", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment());

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "apply_billing_refund",
      "set_paddle_refund_review",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_event_id: "evt_refund_1",
      p_amount_cents: 500,
      p_currency: "USD",
      p_is_full: false,
    });
    expect(rpc.mock.calls[2][1]).toEqual({
      p_event_id: "evt_refund_1",
      p_needs_review: false,
    });
  });

  test("only matching signed top-level and item full types request a full consequence", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment({
      type: "full",
      items: [{ type: "full" }, { type: "full" }],
    }));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.find(([name]) => name === "apply_billing_refund")?.[1]).toMatchObject({
      p_is_full: true,
    });
  });

  test.each(["chargeback", "chargeback_warning"])(
    "an approved full %s applies the same money-and-entitlement consequence as a refund",
    async (action) => {
      const { handler, rpc } = loadRuntimeHandler(okRpc);

      const response = await handler(signedAdjustment({
        action,
        type: "full",
        items: [{ type: "full" }],
      }, `evt_${action}`));

      expect(response.status).toBe(200);
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        "record_paddle_refund_adjustment",
        "apply_billing_refund",
        "set_paddle_refund_review",
      ]);
      expect(rpc.mock.calls[1][1]).toMatchObject({
        p_is_full: true,
        p_transaction_id: "txn_refund_1",
      });
    },
  );

  test.each(["chargeback_reverse", "chargeback_warning_reverse"])(
    "%s is durably queued for restoration review instead of silently ignored",
    async (action) => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
      const { handler, rpc } = loadRuntimeHandler(okRpc);

      const response = await handler(signedAdjustment({ action }, `evt_${action}`));

      expect(response.status).toBe(200);
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        "record_paddle_adjustment_review",
      ]);
      expect(rpc.mock.calls[0][1]).toMatchObject({
        p_adjustment_id: "adj_refund_1",
        p_adjustment_action: action,
        p_adjustment_status: "approved",
        p_review_reason: "chargeback_reversal",
      });
      expect(rpc).not.toHaveBeenCalledWith("apply_billing_refund", expect.anything());
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        review: "chargeback_reversal",
      });
      expect(errorSpy.mock.calls.flat().join(" ")).toContain("chargeback_reversal_review");
      errorSpy.mockRestore();
    },
  );

  test.each([
    ["chargeback_reverse", { id: "" }],
    ["chargeback_warning_reverse", { transaction_id: "" }],
  ])("rejects %s without complete adjustment identity before any RPC", async (action, missing) => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment({ action, ...missing }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_refund_adjustment" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("a chargeback reversal record failure is retryable and does not leak provider errors", async () => {
    const rawFailure = "customer@example.com must not reach logs or the response";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler } = loadRuntimeHandler(async (name) => ({
      data: null,
      error: name === "record_paddle_adjustment_review" ? { message: rawFailure } : null,
    }));

    const response = await handler(signedAdjustment({
      action: "chargeback_reverse",
    }, "evt_chargeback_reverse_failure"));
    const body = await response.text();
    const logged = errorSpy.mock.calls.flat().join(" ");

    expect(response.status).toBe(500);
    expect(body).toBe('{"error":"chargeback_reversal_record_failed"}');
    expect(body).not.toContain(rawFailure);
    expect(logged).toContain("chargeback_reversal_record_failed");
    expect(logged).not.toContain(rawFailure);
    errorSpy.mockRestore();
  });

  test("a reversed chargeback lifecycle is marked for restoration review", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment({
      action: "chargeback",
      status: "reversed",
    }, "evt_chargeback_reversed"));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "record_paddle_adjustment_review",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_event_id: "evt_chargeback_reversed",
      p_adjustment_id: "adj_refund_1",
      p_adjustment_action: "chargeback",
      p_adjustment_status: "reversed",
      p_review_reason: "reversed_adjustment",
      p_payload: expect.objectContaining({ event_id: "evt_chargeback_reversed" }),
    });
    expect(rpc).not.toHaveBeenCalledWith("apply_billing_refund", expect.anything());
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("reversed_adjustment_review");
    errorSpy.mockRestore();
  });

  test("an unrelated credit adjustment remains ignored", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment({ action: "credit" }, "evt_credit"));

    expect(response.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      ignored: "non_refund_adjustment",
    });
  });

  test("distinct lifecycle events pass their source identity while SQL owns the consequence key", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    expect((await handler(signedAdjustment({}, "evt_refund_created"))).status).toBe(200);
    expect((await handler(signedAdjustment({}, "evt_refund_updated"))).status).toBe(200);

    const consequenceArgs = rpc.mock.calls
      .filter(([name]) => name === "apply_billing_refund")
      .map(([, args]) => args);
    expect(consequenceArgs).toHaveLength(2);
    expect(consequenceArgs[0].p_event_id).toBe("evt_refund_created");
    expect(consequenceArgs[1].p_event_id).toBe("evt_refund_updated");
    expect(consequenceArgs[1].p_adjustment_id).toBe(consequenceArgs[0].p_adjustment_id);
  });

  test("a signed partial transaction stays partial when it fully refunds one line item", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment({
      type: "partial",
      items: [{ type: "full" }, { type: "partial" }],
    }));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.find(([name]) => name === "apply_billing_refund")?.[1]).toMatchObject({
      p_is_full: false,
    });
    expect(rpc.mock.calls.at(-1)).toEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: false },
    ]);
  });

  test.each([
    ["full", [{ type: "partial" }]],
    ["full", [{ type: "tax" }]],
    ["partial", [{ type: "unexpected" }]],
    ["unexpected", [{ type: "unexpected" }]],
    [null, [{ type: "partial" }]],
    [undefined, [{ type: "partial" }]],
    ["partial", []],
  ])("marks an ambiguous type for review without applying a consequence: %p / %p", async (type, items) => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment({ type, items }));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "record_paddle_adjustment_review",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_event_id: "evt_refund_1",
      p_event_type: "adjustment.updated",
      p_adjustment_id: "adj_refund_1",
      p_transaction_id: "txn_refund_1",
      p_adjustment_action: "refund",
      p_adjustment_status: "approved",
      p_review_reason: "ambiguous_refund_type",
    });
    expect(rpc.mock.calls[1][1].p_payload).toMatchObject({ event_id: "evt_refund_1" });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      review: "ambiguous_refund_type",
    });
    expect(errorSpy.mock.calls.flat().join(" ")).toContain(
      "[paddle-webhook][ALERT] ambiguous_refund_type",
    );
    errorSpy.mockRestore();
  });

  test.each([
    ["partially parsed total", { totals: { total: "500junk", currency_code: "USD" } }],
    ["decimal total", { totals: { total: "5.00", currency_code: "USD" } }],
    ["negative total", { totals: { total: "-1", currency_code: "USD" } }],
    ["zero total", { totals: { total: "0", currency_code: "USD" } }],
    ["numeric total", { totals: { total: 500, currency_code: "USD" } }],
    ["database integer overflow", { totals: { total: "2147483648", currency_code: "USD" } }],
    ["unsafe total", { totals: { total: "9007199254740992", currency_code: "USD" } }],
    ["missing totals", { totals: null }],
    ["missing top-level currency", { currency_code: undefined }],
    ["lowercase top-level currency", { currency_code: "usd" }],
    ["missing totals currency", { totals: { total: "500" } }],
    ["mismatched totals currency", { totals: { total: "500", currency_code: "EUR" } }],
  ])("marks invalid signed refund financials for review without revoking: %s", async (_label, overrides) => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedAdjustment(overrides));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "record_paddle_adjustment_review",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_event_id: "evt_refund_1",
      p_event_type: "adjustment.updated",
      p_adjustment_id: "adj_refund_1",
      p_transaction_id: "txn_refund_1",
      p_adjustment_action: "refund",
      p_adjustment_status: "approved",
      p_review_reason: "invalid_refund_financials",
    });
    expect(rpc.mock.calls[1][1].p_payload).toMatchObject({ event_id: "evt_refund_1" });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      review: "invalid_refund_financials",
    });
    expect(errorSpy.mock.calls.flat().join(" ")).toContain(
      "[paddle-webhook][ALERT] invalid_refund_financials",
    );
    errorSpy.mockRestore();
  });

  test("a consequence failure is durably marked, returns generic 503, and replays the same atomic key", async () => {
    let applyAttempts = 0;
    const rawFailure = "customer@example.com should never reach logs or the response";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => {
      if (name === "record_paddle_refund_adjustment") {
        return { data: applyAttempts === 0 ? "applied" : "duplicate", error: null };
      }
      if (name === "apply_billing_refund") {
        applyAttempts += 1;
        return applyAttempts === 1
          ? { data: null, error: { message: rawFailure } }
          : { data: "recorded", error: null };
      }
      return { data: "updated", error: null };
    });

    const failed = await handler(signedAdjustment());
    const failedBody = await failed.text();
    expect(failed.status).toBe(503);
    expect(failedBody).toBe('{"error":"refund_consequence_failed"}');
    expect(failedBody).not.toContain(rawFailure);
    expect(rpc.mock.calls[2]).toEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: true },
    ]);

    const retried = await handler(signedAdjustment());
    expect(retried.status).toBe(200);
    const applies = rpc.mock.calls.filter(([name]) => name === "apply_billing_refund");
    expect(applies).toHaveLength(2);
    expect(applies[0][1]).toEqual(applies[1][1]);
    expect(rpc.mock.calls.at(-1)).toEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: false },
    ]);
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain(rawFailure);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("evt_refund_1");
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("adj_refund_1");
    errorSpy.mockRestore();
  });

  test("a committed consequence with a lost response replays as duplicate and clears review", async () => {
    let delivery = 0;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => {
      if (name === "record_paddle_refund_adjustment") {
        return { data: delivery === 0 ? "applied" : "duplicate", error: null };
      }
      if (name === "apply_billing_refund") {
        delivery += 1;
        return delivery === 1
          ? { data: null, error: { message: "response lost after commit" } }
          : { data: "duplicate", error: null };
      }
      return { data: "updated", error: null };
    });

    expect((await handler(signedAdjustment())).status).toBe(503);
    const replay = await handler(signedAdjustment());

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      ok: true,
      result: "duplicate",
      applied: "duplicate",
    });
    const applies = rpc.mock.calls.filter(([name]) => name === "apply_billing_refund");
    expect(applies).toHaveLength(2);
    expect(applies[0][1].p_event_id).toBe("evt_refund_1");
    expect(applies[1][1]).toEqual(applies[0][1]);
    expect(rpc.mock.calls.at(-1)).toEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: false },
    ]);
    errorSpy.mockRestore();
  });

  test("an unknown lifecycle recorder outcome fails closed before consequence parsing", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => ({
      data: name === "record_paddle_refund_adjustment" ? "future_unknown_result" : "updated",
      error: null,
    }));

    const response = await handler(signedAdjustment());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "refund_adjustment_result_invalid" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "set_paddle_refund_review",
    ]);
    expect(rpc.mock.calls.at(-1)).toEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: true },
    ]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("refund_adjustment_result_invalid");
    errorSpy.mockRestore();
  });

  test("an ownerless reversed lifecycle keeps recorder-before-review ordering", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => ({
      data: name === "record_paddle_refund_adjustment" ? "owner_missing_review" : "recorded",
      error: null,
    }));

    const response = await handler(signedAdjustment({
      action: "refund",
      status: "reversed",
    }, "evt_ownerless_reversed"));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "record_paddle_adjustment_review",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_event_id: "evt_ownerless_reversed",
      p_adjustment_id: "adj_refund_1",
      p_adjustment_status: "reversed",
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: "owner_missing_review",
      review: "reversed_adjustment",
    });
    errorSpy.mockRestore();
  });

  test("ownerless reversed then older approved is acknowledged without a permanent retry loop", async () => {
    let lifecycleCalls = 0;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => {
      if (name === "record_paddle_refund_adjustment") {
        lifecycleCalls += 1;
        return { data: lifecycleCalls === 1 ? "owner_missing_review" : "stale", error: null };
      }
      return { data: "recorded", error: null };
    });

    const reversed = await handler(signedAdjustment({
      status: "reversed",
    }, "evt_ownerless_reversed_first"));
    const olderApproved = await handler(signedAdjustment({
      status: "approved",
    }, "evt_ownerless_approved_old"));

    expect(reversed.status).toBe(200);
    expect(olderApproved.status).toBe(200);
    await expect(olderApproved.json()).resolves.toMatchObject({
      ok: true,
      result: "stale",
      review: "stale_adjustment",
    });
    expect(rpc.mock.calls.filter(([name]) => name === "record_paddle_adjustment_review")).toHaveLength(1);
    expect(rpc.mock.calls.filter(([name]) => name === "apply_billing_refund")).toHaveLength(0);
    expect(rpc.mock.calls).not.toContainEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_ownerless_approved_old", p_needs_review: false },
    ]);
    errorSpy.mockRestore();
  });

  test("a stale recorder result is terminal review and never reaches the consequence RPC", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => ({
      data: name === "record_paddle_refund_adjustment" ? "stale" : "updated",
      error: null,
    }));

    const response = await handler(signedAdjustment());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: "stale",
      review: "stale_adjustment",
      applied: null,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
    ]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("stale_adjustment");
    errorSpy.mockRestore();
  });

  test("an approved owner-missing lifecycle stays retryable without attempting a consequence", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => ({
      data: name === "record_paddle_refund_adjustment" ? "owner_missing_review" : "updated",
      error: null,
    }));

    const response = await handler(signedAdjustment());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "refund_owner_pending" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
    ]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("refund_owner_pending");
    errorSpy.mockRestore();
  });

  test("a lifecycle race returned by the consequence RPC remains in review", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => ({
      data: name === "record_paddle_refund_adjustment"
        ? "applied"
        : name === "apply_billing_refund"
          ? "stale_consequence_review"
          : "updated",
      error: null,
    }));

    const response = await handler(signedAdjustment());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: "applied",
      applied: "stale_consequence_review",
      review: "stale_adjustment",
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "apply_billing_refund",
    ]);
    expect(rpc.mock.calls).not.toContainEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: false },
    ]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("stale_consequence");
    errorSpy.mockRestore();
  });

  test.each([
    "duplicate_review",
    "legacy_consequence_review",
    "pack_partial_review",
    "pack_clawback_missed",
    "entitlement_review",
  ])("the %s consequence outcome is acknowledged without clearing its review", async (applyResult) => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => ({
      data: name === "record_paddle_refund_adjustment"
        ? "applied"
        : name === "apply_billing_refund"
          ? applyResult
          : "updated",
      error: null,
    }));

    const response = await handler(signedAdjustment());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      applied: applyResult,
      review: applyResult,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "record_paddle_refund_adjustment",
      "apply_billing_refund",
    ]);
    expect(rpc.mock.calls).not.toContainEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: false },
    ]);
    errorSpy.mockRestore();
  });

  test("an unknown consequence outcome is review-marked and retried", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(async (name) => ({
      data: name === "record_paddle_refund_adjustment"
        ? "applied"
        : name === "apply_billing_refund"
          ? "future_unknown_result"
          : "marked",
      error: null,
    }));

    const response = await handler(signedAdjustment());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "refund_consequence_result_invalid" });
    expect(rpc.mock.calls.at(-1)).toEqual([
      "set_paddle_refund_review",
      { p_event_id: "evt_refund_1", p_needs_review: true },
    ]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("refund_consequence_result_invalid");
    errorSpy.mockRestore();
  });

  test("a lifecycle record failure logs safe correlation ids without the provider error body", async () => {
    const rawFailure = "customer@example.com should never reach logs or the response";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler } = loadRuntimeHandler(async (name) => ({
      data: null,
      error: name === "record_paddle_refund_adjustment" ? { message: rawFailure } : null,
    }));

    const response = await handler(signedAdjustment());
    const responseBody = await response.text();
    const logged = errorSpy.mock.calls.flat().join(" ");

    expect(response.status).toBe(500);
    expect(responseBody).toBe('{"error":"refund_adjustment_apply_failed"}');
    expect(responseBody).not.toContain(rawFailure);
    expect(logged).toContain("refund_adjustment_record_failed");
    expect(logged).toContain("evt_refund_1");
    expect(logged).toContain("adj_refund_1");
    expect(logged).not.toContain(rawFailure);
    errorSpy.mockRestore();
  });
});

// ── Request boundary: a bounded signature header, the JSON media type, and a
// post-HMAC shape guard. The guard refuses only JSON types the handler cannot
// safely forward to SQL or dereference. Value judgments stay with the review
// rails above, so the malformed amounts, currencies, and refund types those
// tests route to durable review keep reaching them through the same parser.
describe("paddle-webhook request boundary runtime", () => {
  const USER_ID = "11111111-1111-4111-8111-111111111111";
  const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
  // Literal on purpose: this suite states the contract rather than echoing
  // the implementation constant.
  const MAX_JSON_DEPTH = 32;
  const ZERO_SIGNATURE = "0".repeat(64);

  function refundEvent(eventId: string, data: Record<string, unknown> = {}) {
    return {
      event_id: eventId,
      event_type: "adjustment.updated",
      occurred_at: "2026-09-10T01:02:03.000Z",
      data: {
        id: "adj_refund_1",
        transaction_id: "txn_refund_1",
        action: "refund",
        status: "approved",
        type: "partial",
        items: [{ type: "partial" }],
        totals: { total: "500", currency_code: "USD" },
        currency_code: "USD",
        ...data,
      },
    };
  }

  function signedRaw(
    raw: string,
    options: {
      contentType?: string | null;
      signatureHeaders?: (timestamp: string, signature: string) => string[];
    } = {},
  ): Request {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", WEBHOOK_SECRET)
      .update(`${timestamp}:${raw}`)
      .digest("hex");
    const headers = new Headers();
    const signatureHeaders = options.signatureHeaders?.(timestamp, signature)
      ?? [`ts=${timestamp};h1=${signature}`];
    for (const value of signatureHeaders) headers.append("Paddle-Signature", value);
    const contentType = options.contentType === undefined ? "application/json" : options.contentType;
    if (contentType !== null) headers.set("content-type", contentType);
    // A byte body keeps fetch from inventing a text/plain media type.
    return new Request("https://example.invalid/functions/v1/paddle-webhook", {
      method: "POST",
      headers,
      body: new TextEncoder().encode(raw),
    });
  }

  test("accepts up to eight h1 candidates while Paddle rotates secrets", async () => {
    const { handler } = loadRuntimeHandler(okRpc);

    const response = await handler(signedRaw(JSON.stringify(refundEvent("evt_eight_h1")), {
      signatureHeaders: (ts, sig) => [`ts=${ts};${`h1=${ZERO_SIGNATURE};`.repeat(7)}h1=${sig}`],
    }));

    expect(response.status).toBe(200);
  });

  test("refuses a ninth h1 candidate even when one of them matches", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedRaw(JSON.stringify(refundEvent("evt_nine_h1")), {
      signatureHeaders: (ts, sig) => [`ts=${ts};h1=${sig};${`h1=${ZERO_SIGNATURE};`.repeat(8)}`],
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "bad_signature" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("bounds the Paddle-Signature header at 4096 characters", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);
    const raw = JSON.stringify(refundEvent("evt_header_length"));
    const paddedTo = (length: number) => (ts: string, sig: string) => {
      const header = `ts=${ts};h1=${sig};`;
      return [header + "x".repeat(length - header.length)];
    };

    const atLimit = await handler(signedRaw(raw, { signatureHeaders: paddedTo(4096) }));
    const oversized = await handler(signedRaw(raw, { signatureHeaders: paddedTo(4097) }));

    expect(atLimit.status).toBe(200);
    expect(oversized.status).toBe(403);
    await expect(oversized.json()).resolves.toEqual({ error: "bad_signature" });
    expect(rpc.mock.calls.filter(([name]) => name === "record_paddle_refund_adjustment"))
      .toHaveLength(1);
  });

  test("refuses two physical Paddle-Signature headers as ambiguous", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedRaw(JSON.stringify(refundEvent("evt_two_headers")), {
      signatureHeaders: (ts, sig) => [`ts=${ts};h1=${sig}`, `ts=${ts};h1=${sig}`],
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "bad_signature" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each<[string, string | null]>([
    ["text", "text/plain;charset=UTF-8"],
    ["a form body", "application/x-www-form-urlencoded"],
    ["a JSON look-alike", "application/json-patch+json"],
    ["a missing media type", null],
  ])("answers %s with 415 before any RPC", async (_label, contentType) => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);

    const response = await handler(signedRaw(JSON.stringify(refundEvent("evt_media_type")), {
      contentType,
    }));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: "unsupported_media_type" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("accepts a UTF-8 charset parameter on the JSON media type", async () => {
    const { handler } = loadRuntimeHandler(okRpc);

    const response = await handler(signedRaw(JSON.stringify(refundEvent("evt_charset")), {
      contentType: "application/json; charset=utf-8",
    }));

    expect(response.status).toBe(200);
  });

  test("authenticates before judging JSON: an unsigned ambiguous body is still a 403", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc);
    const raw = JSON.stringify(refundEvent("evt_unsigned"))
      .replace('"event_id":', '"event_id":"evt_shadow","event_id":');

    const response = await handler(signedRaw(raw, {
      signatureHeaders: (ts) => [`ts=${ts};h1=${ZERO_SIGNATURE}`],
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "bad_signature" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("a signed duplicate key is refused instead of letting the last value win", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc);
    const raw = JSON.stringify(refundEvent("evt_duplicate_status", { status: "pending_approval" }))
      .replace('"status":"pending_approval"', '"status":"pending_approval","status":"approved"');

    const response = await handler(signedRaw(raw));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "bad_payload" });
    expect(rpc).not.toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("[paddle-webhook][ALERT] bad_payload");
    expect(logged).toContain("duplicate_json_key");
    errorSpy.mockRestore();
  });

  test("signed JSON nested past the depth limit is refused, and the limit itself is not", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc } = loadRuntimeHandler(okRpc);
    // The event object is level 1 and data is level 2, so custom_data holding
    // `levels` nested objects reaches depth 2 + levels.
    const nested = (levels: number): unknown =>
      JSON.parse(`${'{"a":'.repeat(levels)}1${"}".repeat(levels)}`);

    const atLimit = await handler(signedRaw(JSON.stringify(
      refundEvent("evt_depth_limit", { custom_data: nested(MAX_JSON_DEPTH - 2) }),
    )));
    const tooDeep = await handler(signedRaw(JSON.stringify(
      refundEvent("evt_depth_over", { custom_data: nested(MAX_JSON_DEPTH - 1) }),
    )));

    expect(atLimit.status).toBe(200);
    expect(tooDeep.status).toBe(400);
    await expect(tooDeep.json()).resolves.toEqual({ error: "bad_payload" });
    expect(rpc.mock.calls.map(([, args]) => args.p_event_id)).not.toContain("evt_depth_over");
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("json_too_deep");
    errorSpy.mockRestore();
  });

  test.each<[string, Record<string, unknown>]>([
    ["a numeric event_type", { ...refundEvent("evt_type_number"), event_type: 7 }],
    ["a control character in event_id", refundEvent("evt_forged\nline")],
    ["a numeric occurred_at", { ...refundEvent("evt_time_number"), occurred_at: 1_788_000_000 }],
    ["an oversized adjustment transaction id", refundEvent("evt_long_txn", {
      transaction_id: `txn_${"x".repeat(200)}`,
    })],
    ["an object where the subscription id goes", {
      event_id: "evt_subscription_id_object",
      event_type: "subscription.created",
      occurred_at: "2026-09-10T01:02:03.000Z",
      data: { id: { nested: "sub_1" }, status: "active", items: [{ price: { id: "pri_cortex" } }] },
    }],
    ["payments that are not a list", {
      event_id: "evt_payments_object",
      event_type: "transaction.completed",
      occurred_at: "2026-09-10T01:02:03.000Z",
      data: { id: "txn_1", currency_code: "USD", payments: { status: "captured" } },
    }],
    ["a card remnant that is not text", {
      event_id: "evt_card_number",
      event_type: "transaction.completed",
      occurred_at: "2026-09-10T01:02:03.000Z",
      data: {
        id: "txn_1",
        currency_code: "USD",
        details: { totals: { grand_total: "1000" } },
        payments: [{
          status: "captured",
          method_details: { type: "card", card: { type: "visa", last4: 4242 } },
        }],
      },
    }],
  ])("refuses a signed payload with %s before any RPC", async (_label, event) => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, rpc, from } = loadRuntimeHandler(okRpc, { bindingUserId: USER_ID });

    const response = await handler(signedRaw(JSON.stringify(event)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "bad_payload" });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("[paddle-webhook][ALERT] bad_payload");
    errorSpy.mockRestore();
  });

  // The guard must not take a signed adjustment away from the rail that records
  // it: a 400 here would make Paddle retry until the event is lost (0123).
  test.each<[string, Record<string, unknown>, string]>([
    ["a numeric status", { status: 7 }, "unhandled_adjustment_status"],
    ["a numeric currency", { currency_code: 840 }, "invalid_refund_financials"],
    ["refund-type evidence that is not a list", { items: "full" }, "ambiguous_refund_type"],
  ])("still routes a signed adjustment with %s to its review rail", async (_label, data, rail) => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler } = loadRuntimeHandler(okRpc);

    const response = await handler(signedRaw(JSON.stringify(refundEvent("evt_review_rail", data))));

    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain(rail);
    errorSpy.mockRestore();
  });

  test("Paddle's documented nulls on a one-off transaction still reach the ledger", async () => {
    const { handler, rpc, from } = loadRuntimeHandler(okRpc, { bindingUserId: USER_ID });
    const event = {
      event_id: "evt_one_off_transaction",
      event_type: "transaction.completed",
      occurred_at: "2026-09-10T01:02:03.000Z",
      data: {
        id: "txn_one_off",
        status: "completed",
        subscription_id: null,
        custom_data: null,
        currency_code: "USD",
        items: [{ price: { id: "pri_pack" }, quantity: 1 }],
        details: { totals: { grand_total: "1000" } },
        payments: [{ status: "captured", method_details: { type: "card", card: null } }],
      },
    };

    const response = await handler(signedRaw(JSON.stringify(event)));

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc.mock.calls.find(([name]) => name === "apply_billing_event")?.[1]).toMatchObject({
      p_user_id: USER_ID,
      p_subscription_id: null,
      p_transaction_id: "txn_one_off",
      p_amount_cents: 1000,
      p_currency: "USD",
      p_payment_method: "card",
      p_card_brand: null,
      p_card_last4: null,
    });
  });

  test("a past_due renewal with cleared schedule fields is still recorded", async () => {
    const { handler, rpc } = loadRuntimeHandler(okRpc, {
      anchorRows: [{ user_id: OTHER_USER_ID }],
    });
    const event = {
      event_id: "evt_past_due",
      event_type: "subscription.updated",
      occurred_at: "2026-09-10T01:02:03.000Z",
      data: {
        id: "sub_past_due",
        status: "past_due",
        custom_data: null,
        items: [{ price: { id: "pri_cortex" } }],
        current_billing_period: null,
        scheduled_change: null,
      },
    };

    const response = await handler(signedRaw(JSON.stringify(event)));

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.find(([name]) => name === "apply_billing_event")?.[1]).toMatchObject({
      p_user_id: OTHER_USER_ID,
      p_subscription_id: "sub_past_due",
      p_tier: null,
      p_expires_at: null,
      p_scheduled_cancel_at: null,
    });
  });
});
