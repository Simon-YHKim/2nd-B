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

const ROOT = join(__dirname, "..", "..", "..", "..");
const source = readFileSync(
  join(ROOT, "supabase", "functions", "paddle-webhook", "index.ts"),
  "utf8",
);
const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const adjustmentStart = code.indexOf("const isAdjustmentEvent");
const entitlementStart = code.indexOf("const isSubscriptionEvent");
const adjustmentBlock = code.slice(adjustmentStart, entitlementStart);

describe("paddle-webhook refund adjustments", () => {
  test("handles created and updated while ignoring non-refund adjustments", () => {
    expect(adjustmentStart).toBeGreaterThan(-1);
    expect(entitlementStart).toBeGreaterThan(adjustmentStart);
    expect(adjustmentBlock).toMatch(/eventType === 'adjustment\.created'/);
    expect(adjustmentBlock).toMatch(/eventType === 'adjustment\.updated'/);
    expect(adjustmentBlock).toMatch(
      /data\.action !== 'refund'[\s\S]*?ignored: 'non_refund_adjustment'/,
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

const WEBHOOK_SECRET = "test-secret";

class TestJsonBodyError extends Error {
  constructor(
    readonly code: string,
    readonly maxBytes: number,
  ) {
    super(code);
  }
}

function loadRuntimeHandler(implementation: RpcImplementation) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const rpc = jest.fn(implementation);
  let handler: EdgeHandler | null = null;
  const deno = {
    env: {
      get: (name: string) => ({
        PADDLE_WEBHOOK_ENABLED: "1",
        PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        PADDLE_IP_ALLOWLIST: "off",
        SUPABASE_URL: "https://example.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      })[name],
    },
    serve: (value: EdgeHandler) => { handler = value; },
  };
  const loaded = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", "Deno", "crypto", compiled)(
    (id: string) => {
      if (id === "https://esm.sh/@supabase/supabase-js@2") {
        return { createClient: () => ({ rpc }) };
      }
      if (id === "../_shared/request-json.ts") {
        return {
          JsonBodyError: TestJsonBodyError,
          PADDLE_WEBHOOK_BODY_LIMIT_BYTES: 256_000,
          readBodyBytes: async (request: Request) => new Uint8Array(await request.arrayBuffer()),
        };
      }
      throw new Error(`Unexpected edge dependency: ${id}`);
    },
    loaded,
    loaded.exports,
    deno,
    webcrypto,
  );
  if (!handler) throw new Error("paddle-webhook did not register a handler");
  return { handler: handler as EdgeHandler, rpc };
}

function signedAdjustment(overrides: Record<string, unknown> = {}): Request {
  const payload = {
    event_id: "evt_refund_1",
    event_type: "adjustment.updated",
    occurred_at: "2026-09-10T01:02:03.000Z",
    data: {
      id: "adj_refund_1",
      transaction_id: "txn_refund_1",
      action: "refund",
      status: "approved",
      type: "partial",
      items: [{ type: "partial" }],
      totals: { total: "500" },
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

describe("paddle-webhook refund integrity runtime", () => {
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
      p_event_id: "evt_refund_1:consequence",
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
      "set_paddle_refund_review",
    ]);
    expect(rpc.mock.calls[1][1]).toEqual({
      p_event_id: "evt_refund_1",
      p_needs_review: true,
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      review: "ambiguous_refund_type",
    });
    expect(errorSpy).toHaveBeenCalledWith("[paddle-webhook][ALERT] ambiguous_refund_type");
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
    errorSpy.mockRestore();
  });
});
