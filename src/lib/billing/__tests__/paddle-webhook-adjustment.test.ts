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
    // The ledger record must not be lost because the consequence failed.
    expect(adjustmentBlock).toMatch(/\[ALERT\] refund consequence failed/);
  });
});
