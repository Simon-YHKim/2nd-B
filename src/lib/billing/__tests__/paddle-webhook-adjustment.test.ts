// Structural guard for refund adjustment handling in paddle-webhook.
//
// The edge function is outside this repo's TypeScript and ESLint include paths,
// so source assertions pin the money-sensitive boundary: validate Paddle's
// adjustment shape, record it through one service-role RPC, surface failures,
// and return before the entitlement writer.

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    expect(adjustmentBlock).toMatch(
      /!adjustmentId \|\| !adjustmentTransactionId \|\| !REFUND_ADJUSTMENT_STATUSES\.has\(adjustmentStatus\)/,
    );
    expect(adjustmentBlock).toMatch(/error: 'invalid_refund_adjustment'[\s\S]*?, 400/);
  });

  test("records through the service-role RPC and returns its result", () => {
    expect(adjustmentBlock).toMatch(/rpc\('record_paddle_refund_adjustment'/);
    expect(adjustmentBlock).toMatch(/p_event_id: eventId/);
    expect(adjustmentBlock).toMatch(/p_event_type: eventType/);
    expect(adjustmentBlock).toMatch(/p_adjustment_id: adjustmentId/);
    expect(adjustmentBlock).toMatch(/p_transaction_id: adjustmentTransactionId/);
    expect(adjustmentBlock).toMatch(/p_status: adjustmentStatus/);
    expect(adjustmentBlock).toMatch(/p_occurred_at: occurredAt/);
    expect(adjustmentBlock).toMatch(/return json\(\{ ok: true, result \}\)/);
  });

  test("surfaces ledger failures so Paddle can retry", () => {
    expect(adjustmentBlock).toMatch(
      /if \(error\)[\s\S]*?error: 'refund_adjustment_apply_failed'[\s\S]*?, 500/,
    );
  });

  test("returns before and never calls the entitlement writer", () => {
    expect(adjustmentBlock).not.toMatch(/apply_billing_event/);
    expect(adjustmentBlock).not.toMatch(/p_tier|subscription_tier|tier\s*=/);
    expect(adjustmentBlock).toMatch(/return json\(\{ ok: true, result \}\)/);
  });
});
