// Source pins for supabase/functions/subscription-manage/index.ts.
//
// Edge functions get no type-check and no lint in this repo (tsconfig `include`
// skips supabase/**, eslint ignores it), and component render tests are blocked,
// so a structural test on the source text is the ONLY automated coverage this
// function has. Same style as src/lib/ads/__tests__/ssv-wiring.test.ts.
//
// The four properties asserted here are the ones that cost money or leak access
// if they regress: fail-closed without a key, IDOR safety, idempotency, and the
// promise that this function never writes an entitlement.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const fn = readFileSync(join(ROOT, "supabase", "functions", "subscription-manage", "index.ts"), "utf8");
const config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");

// Comments are stripped before keyword assertions so a comment that merely
// MENTIONS a check cannot satisfy a test that requires the check in code.
const code = fn.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("subscription-manage - auth boundary", () => {
  test("registered with verify_jwt = true in config.toml", () => {
    expect(config).toMatch(/\[functions\.subscription-manage\][\s\S]*?verify_jwt = true/);
  });

  test("requires a real signed-in user, not merely a valid token", () => {
    // The public anon key is itself a valid JWT; role must be checked in CODE
    // (this is also what src/lib/safety/__tests__/edge-jwt-hardening.test.ts scans for).
    expect(code).toMatch(/role !== 'authenticated'/);
    expect(code).toMatch(/'missing_authorization'/);
    expect(code).toMatch(/'invalid_jwt'/);
  });

  test("the acting user comes from the JWT, never from the request body", () => {
    expect(code).toMatch(/const userId = userIdFromJwt\(authHeader\)/);
    expect(code).toMatch(/p_user_id: userId/);
    expect(code).not.toMatch(/body\.user_id/);
  });

  test("non-POST and preflight are handled before any work", () => {
    expect(code).toMatch(/req\.method === 'OPTIONS'/);
    expect(code).toMatch(/'method_not_allowed'/);
  });
});

describe("subscription-manage - fail closed", () => {
  test("does nothing without the API key or the enable flag", () => {
    expect(code).toMatch(/PADDLE_SELF_SERVICE_ENABLED'\) === '1'/);
    expect(code).toMatch(/PADDLE_API_KEY/);
    expect(code).toMatch(/if \(!enabled \|\| \(!hasKey && !dryRun\)\)/);
  });

  test("a fail-closed action is still audited and routes the user to support", () => {
    expect(code).toMatch(/settleTerminal\('misconfigured'/);
    expect(code).toMatch(/contact_support: true/);
  });

  test("an unresolvable Paddle id is support, never a guessed id", () => {
    expect(code).toMatch(/no_paddle_id_on_record/);
  });

  test("the key is only ever read from the environment", () => {
    expect(code).toMatch(/Deno\.env\.get\('PADDLE_API_KEY'\)/);
    // No literal Paddle key shape anywhere in the file.
    expect(fn).not.toMatch(/pdl_(live|sdbx)_/);
  });
});

describe("subscription-manage - eligibility is re-derived server-side", () => {
  test("calls the RPC itself rather than trusting anything from the client", () => {
    expect(code).toMatch(/rpc\('refund_eligibility'/);
  });

  test("an ineligible refund never reaches Paddle", () => {
    expect(code).toMatch(/action === 'refund_request' && eligibility\.status !== 'eligible'/);
    expect(code).toMatch(/settleTerminal\('rejected'/);
  });

  // The screen hides the cancel button on a free tier, but the function is the
  // boundary. Without this gate a stale or direct call claims a cancel row and
  // fires a Paddle request for a subscription the caller does not hold, and the
  // user is handed "contact support" for an action that was never valid.
  test("cancel on a free tier is refused before any claim or provider call", () => {
    expect(code).toMatch(/action === 'cancel' && eligibility\.tier === 'free'/);
    expect(code).toMatch(/'not_subscribed'/);
    // The gate must sit BEFORE the claim, or the ledger holds a claim for an
    // action that can never succeed.
    const gateAt = code.indexOf("eligibility.tier === 'free'");
    const claimAt = code.indexOf('claim_billing_self_service');
    expect(gateAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(gateAt);
  });

  test("the two refusals are distinguishable by the client", () => {
    expect(code).toMatch(/reason: 'not_eligible'/);
    expect(code).toMatch(/reason: 'not_subscribed'/);
  });

  test("the verdict travels back to the client so the screen can explain it", () => {
    expect(code).toMatch(/eligibility\s*}/);
  });
});

describe("subscription-manage - idempotency", () => {
  test("the ledger row is claimed BEFORE the provider call", () => {
    const claimAt = code.indexOf("claim_billing_self_service");
    const callAt = code.indexOf("callPaddle(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(code.lastIndexOf("await callPaddle"));
  });

  test("a duplicate claim returns success without spending money again", () => {
    expect(code).toMatch(/if \(claim\.duplicate\)/);
    expect(code).toMatch(/outcome: 'duplicate'/);
  });

  test("an idempotency key is sent to Paddle as well", () => {
    expect(code).toMatch(/'paddle-idempotency-key'/);
  });

  test("every terminal state is settled back onto the claim", () => {
    expect(code).toMatch(/settleClaim\('accepted'/);
    expect(code).toMatch(/settleClaim\('provider_error'/);
  });
});

describe("subscription-manage - provider contract", () => {
  test("cancel defaults to the next billing period, immediate is explicit opt-in", () => {
    expect(code).toMatch(/body\.effective_from === 'immediately'\s*\?\s*'immediately'\s*:\s*'next_billing_period'/);
    expect(code).toMatch(/\/subscriptions\/\$\{encodeURIComponent\(targetId\)\}\/cancel/);
  });

  test("refund is a full adjustment against the transaction", () => {
    expect(code).toMatch(/'\/adjustments'/);
    expect(code).toMatch(/action: 'refund'/);
    expect(code).toMatch(/type: 'full'/);
    expect(code).toMatch(/transaction_id: targetId/);
  });

  test("the base URL is overridable so sandbox can be exercised", () => {
    expect(code).toMatch(/PADDLE_API_BASE/);
  });

  test("outbound calls are bounded by a timeout", () => {
    expect(code).toMatch(/AbortSignal\.timeout\(PADDLE_TIMEOUT_MS\)/);
  });
});

describe("subscription-manage - no second entitlement writer", () => {
  test("never writes the tier itself: the webhook rail stays the only revoker", () => {
    expect(code).not.toMatch(/subscription_tier/);
    expect(code).not.toMatch(/apply_billing_event/);
    expect(code).not.toMatch(/from\('users'\)/);
  });
});

describe("subscription-manage - honest wording at the boundary", () => {
  test("the response says the request was accepted, never that money was refunded", () => {
    expect(code).not.toMatch(/refunded: true/);
    expect(code).toMatch(/outcome: 'accepted'/);
  });
});

describe("subscription-manage - the revised policy has an effective date", () => {
  test("refunds are refused before it, and the constant matches the TS mirror", () => {
    // PADDLE_SELF_SERVICE_ENABLED is an operator switch, not a legal one. Even
    // flipped early, the function must not apply a standard that is not yet in
    // force (docs/legal/refund-policy.md "개정 시행일: 2026-09-08").
    expect(code).toMatch(/const REFUND_POLICY_EFFECTIVE_AT = Date\.parse\('2026-09-08T00:00:00\+09:00'\)/);
    expect(code).toMatch(/action === 'refund_request' && Date\.now\(\) < REFUND_POLICY_EFFECTIVE_AT/);
    expect(code).toMatch(/'policy_not_in_effect'/);
  });

  test("cancel is NOT date-gated: cancelling was never the adverse change", () => {
    const gate = code.match(/Date\.now\(\) < REFUND_POLICY_EFFECTIVE_AT/g) ?? [];
    expect(gate).toHaveLength(1);
    expect(code).not.toMatch(/action === 'cancel' && Date\.now\(\)/);
  });
});

describe("subscription-manage - 0118 hardening", () => {
  test("the idempotency key identifies the request, not the attempt", () => {
    // A per-attempt uuid could never dedupe a retry, which is the only case the
    // header exists for: timeout -> claim released -> retry -> second refund.
    expect(code).toMatch(/`refund:\$\{targetId\}`/);
    expect(code).toMatch(/`cancel:\$\{targetId\}:\$\{effectiveFrom\}`/);
    expect(code).not.toMatch(/callPaddle\([^)]*,\s*claimId\)/);
  });

  test("there is a per-user rate limit, and it fails closed", () => {
    expect(code).toMatch(/from\('billing_self_service_log'\)/);
    expect(code).toMatch(/'too_many_requests'/);
    expect(code).toMatch(/429/);
    expect(code).toMatch(/'rate_check_unavailable'/);
  });

  test("DRYRUN while ENABLED is loud, because it must not survive the go-live flip", () => {
    expect(code).toMatch(/if \(enabled && dryRun\)/);
    expect(code).toMatch(/\[ALERT\] DRYRUN is set while the feature is ENABLED/);
  });
});

describe("supabase/config.toml declares every deployed function", () => {
  // Declared values must match what is LIVE, not what the header comment
  // implies. Undeclared meant the CLI default (TRUE) applied on the next
  // redeploy, which would have 401'd every Paddle delivery and stopped billing.
  // The inverse mistake is just as real: peer-respond reads as "no account, so
  // no JWT", but its caller posts the anon key as a bearer token and the gateway
  // check passes, so it is live as TRUE - declaring false would have loosened it.
  test("the callers that send no token at all are declared verify_jwt = false", () => {
    for (const fn of ["paddle-webhook", "rewarded-ssv"]) {
      const header = `[functions.${fn}]`;
      const at = config.indexOf(header);
      expect(at).toBeGreaterThan(-1);
      // Scope the assertion to THIS block: up to the next [functions.*] header.
      const rest = config.slice(at + header.length);
      const next = rest.indexOf("\n[functions.");
      const block = next === -1 ? rest : rest.slice(0, next);
      expect(block).toContain("verify_jwt = false");
    }
  });

  test("peer-respond is declared TRUE, matching live and its caller", () => {
    const header = "[functions.peer-respond]";
    const at = config.indexOf(header);
    expect(at).toBeGreaterThan(-1);
    const rest = config.slice(at + header.length);
    const next = rest.indexOf("\n[functions.");
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).toContain("verify_jwt = true");
    // And the caller really does present a token, or the declaration is wrong.
    const caller = readFileSync(join(ROOT, "src", "lib", "peer", "peer-respond.ts"), "utf8");
    expect(caller).toMatch(/authorization: `Bearer \$\{env\.EXPO_PUBLIC_SUPABASE_ANON_KEY\}`/);
  });
});
