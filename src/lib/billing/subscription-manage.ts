// Client side of [설정 → 구독 관리]: read the subscription summary + the refund
// verdict, and ask the server to cancel or to request a refund.
//
// Everything here is a thin, honest wrapper. Two rules the UI depends on:
//
//   1. The verdict is NEVER decided here. refund_eligibility() (0115) is the single
//      source of truth, and subscription-manage re-derives it server-side before it
//      spends money. This module only transports and formats it.
//   2. A refund is a REQUEST. Paddle is the Merchant of Record and reviews refund
//      adjustments, so "accepted" means "submitted to Paddle", never "money is back".
//      No string in this file or its callers may say otherwise.
//
// The pure helpers (reasonKey, formatting) live here rather than in the screen so
// the boundary logic is unit-testable: component render tests are blocked in this
// repo, so anything worth asserting has to be reachable without rendering.

import { getSupabaseClient } from "../supabase/client";
import { REASONING_PER_WEEK } from "../entitlements/tier-map";

/** Refund window in days. Mirrors c_window_days in refund_eligibility() (0115)
 *  and "7일" in docs/legal/refund-policy.md. The server decides; this is the
 *  display fallback and the number the migration's structural test pins against.
 *
 *  7, not 30 (Simon, 2026-08-09): the statutory floor of 전자상거래법 제17조①,
 *  and exactly one free-plan allowance period, so the allowance never depends on
 *  how long the user waited to ask. */
export const REFUND_WINDOW_DAYS = 7;

/** The window the policy published 2026-07-17 promised, still in force until the
 *  revision's effective date: 30 days, no questions asked. */
export const PRE_REVISION_WINDOW_DAYS = 30;

/** Free-plan reasoning allowance per ISO week. ONE number, taken from the tier
 *  vocabulary SoT rather than retyped, so a cap change cannot silently split the
 *  refund rule away from the plan it is measured against. */
export const FREE_RUNS_PER_WEEK = REASONING_PER_WEEK.free ?? 0;

/** When the revised refund policy takes effect (docs/legal/refund-policy.md
 *  header: "개정 시행일: 2026-09-08", 이용약관 제3조② 30-day notice for an
 *  adverse change). KST, because the policy is a Korean document.
 *
 *  This exists because PADDLE_SELF_SERVICE_ENABLED gates only the WRITE path.
 *  The verdict READ is granted to `authenticated` and /subscription is reachable
 *  from settings today, so without a date gate the screen would show the new
 *  7-day conditional standard to users while the 30-day no-questions-asked
 *  guarantee is still the one in force. Showing a stricter rule than the one
 *  that binds us is the exact thing the 30-day notice period exists to prevent. */
export const REFUND_POLICY_EFFECTIVE_AT = Date.parse("2026-09-08T00:00:00+09:00");

/** Whether the revised (7-day, usage-gated) policy is in force yet.
 *  `now` is injectable so the boundary is testable without faking the clock. */
export function revisedPolicyInForce(now: number = Date.now()): boolean {
  return now >= REFUND_POLICY_EFFECTIVE_AT;
}

/** What the free plan would have allowed over a span of `days`, pro-rated by
 *  whole or partial weeks. A 1-day-old payment still gets a full week's worth:
 *  the alternative would make the verdict depend on how fast the user asked.
 *  Pure mirror of the v_weeks / v_allowance arithmetic in refund_eligibility(). */
export function freeAllowanceForSpan(days: number): { weeks: number; allowance: number } {
  const weeks = Math.max(1, Math.ceil(days / 7));
  return { weeks, allowance: FREE_RUNS_PER_WEEK * weeks };
}

/** Pure mirror of the server verdict, for tests and for reasoning about the rule
 *  in one place. NOT used to decide anything at runtime: refund_eligibility() is
 *  the single source of truth and subscription-manage re-derives it server-side. */
export function verdictFor(input: {
  daysSincePayment: number | null;
  reasoningRuns: number;
  reasoningCalls: number;
  /** Defaults to now, so the mirror picks the same rule the server would. */
  now?: number;
}): RefundStatus {
  if (input.daysSincePayment == null) return "no_payment";
  const revised = revisedPolicyInForce(input.now ?? Date.now());
  const windowDays = revised ? REFUND_WINDOW_DAYS : PRE_REVISION_WINDOW_DAYS;
  if (input.daysSincePayment > windowDays) return "window_passed";
  // Only the revised policy carries a usage condition. Before its effective date
  // the published promise is "사유를 묻지 않으며" and this arm must be unreachable.
  if (!revised) return "eligible";
  // Runs are the meter the free cap actually spends from. The audit-log count is
  // the fallback only when the run ledger has nothing for the window, so a call
  // that was logged without reserving a run cannot buy a free refund.
  const used = input.reasoningRuns > 0 ? input.reasoningRuns : input.reasoningCalls;
  const { allowance } = freeAllowanceForSpan(input.daysSincePayment);
  return used > allowance ? "used_beyond_free" : "eligible";
}

/** Server verdict codes from refund_eligibility(). */
export type RefundStatus =
  | "eligible"
  | "refund_already_requested"
  | "used_beyond_free"
  | "window_passed"
  | "no_payment"
  | "unknown";

/** Narrow the RPC's untrusted JSON status onto the client vocabulary. Unknown
 *  values fail closed so a new server verdict cannot accidentally open the
 *  refund action before the app knows how to explain it. */
export function parseRefundStatus(raw: unknown): RefundStatus {
  switch (raw) {
    case "eligible":
    case "refund_already_requested":
    case "used_beyond_free":
    case "window_passed":
    case "no_payment":
    case "unknown":
      return raw;
    default:
      return "unknown";
  }
}

/** The verdict plus every number behind it. The screen shows these verbatim: a
 *  user told "no" is entitled to see which count produced that answer. */
export interface RefundEligibility {
  status: RefundStatus;
  /** Which published policy produced this verdict (0120). Before the revision's
   *  effective date the server applies the 30-day no-questions-asked rule that is
   *  actually in force; from that instant, the 7-day usage-gated one. */
  policy?: "pre_revision" | "revised";
  /** false while the pre-revision policy applies: usage cannot refuse a refund,
   *  though the numbers are still measured and shown. */
  usage_gate_applies?: boolean;
  tier?: string;
  paid_at?: string | null;
  transaction_id?: string | null;
  has_subscription?: boolean;
  days_since_payment?: number;
  refund_window_days?: number;
  window_expires_at?: string | null;
  free_runs_per_week?: number;
  weeks_elapsed?: number;
  free_allowance?: number;
  reasoning_runs_used?: number;
  reasoning_calls_logged?: number;
  counted_usage?: number;
  counted_from?: "reasoning_runs" | "ai_audit_log";
}

/** Display summary for the subscription card. Mirrors subscription_overview(). */
export interface SubscriptionOverview {
  tier: string;
  stored_tier: string;
  judge_comp: boolean;
  renews_at: string | null;
  provider: string | null;
  last_paid_at: string | null;
  payment_method: string | null;
  card_brand: string | null;
  card_last4: string | null;
  can_self_cancel: boolean;
  /** false once EITHER Paddle or our own ledger says a cancellation is booked. */
  auto_renew: boolean;
  /** Paddle's scheduled_change effective_at, once the webhook has landed. */
  cancel_scheduled_at: string | null;
  /** Our accepted cancel, so the screen updates before the webhook returns. */
  cancel_requested_at: string | null;
}

export type ManageOutcome =
  | "accepted"
  | "dry_run"
  | "duplicate"
  | "rejected"
  | "provider_error"
  | "misconfigured";

/** Why the server refused. Present only on outcome "rejected"; the two refusals
 *  need different sentences ("not owed a refund" vs "nothing to cancel"). */
export type ManageRejectReason = "not_eligible" | "not_subscribed";

export interface ManageResult {
  ok: boolean;
  outcome: ManageOutcome;
  reason: ManageRejectReason | null;
  /** true when the server could not act and the user must be routed to support. */
  contactSupport: boolean;
  /** Paddle adjustment / subscription reference, when the call succeeded. */
  reference: string | null;
  dryRun: boolean;
  eligibility: RefundEligibility;
}

const UNKNOWN: RefundEligibility = { status: "unknown" };

function asEligibility(raw: unknown): RefundEligibility {
  if (!raw || typeof raw !== "object") return UNKNOWN;
  const rec = raw as Record<string, unknown>;
  // Spread first so unknown extra fields survive for display, then pin `status`
  // to the narrowed union: the RPC is the authority on the verdict vocabulary.
  return { ...rec, status: parseRefundStatus(rec.status) } as RefundEligibility;
}

/** Read the refund verdict for the signed-in user. Own-row only: the RPC rejects
 *  a p_user_id that is not the caller (42501). */
export async function fetchRefundEligibility(userId: string): Promise<RefundEligibility> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("refund_eligibility", { p_user_id: userId });
  if (error) throw error;
  return asEligibility(data);
}

/** Read the subscription summary card data (tier, next charge, payment method). */
export async function fetchSubscriptionOverview(userId: string): Promise<SubscriptionOverview> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("subscription_overview", { p_user_id: userId });
  if (error) throw error;
  const rec = (data ?? {}) as Partial<SubscriptionOverview>;
  return {
    tier: rec.tier ?? "free",
    stored_tier: rec.stored_tier ?? "free",
    judge_comp: rec.judge_comp === true,
    renews_at: rec.renews_at ?? null,
    provider: rec.provider ?? null,
    last_paid_at: rec.last_paid_at ?? null,
    payment_method: rec.payment_method ?? null,
    card_brand: rec.card_brand ?? null,
    card_last4: rec.card_last4 ?? null,
    can_self_cancel: rec.can_self_cancel === true,
    // Fails safe toward "not renewing": claiming an upcoming charge that is not
    // coming is the one wrong answer here.
    auto_renew: rec.auto_renew === true,
    cancel_scheduled_at: rec.cancel_scheduled_at ?? null,
    cancel_requested_at: rec.cancel_requested_at ?? null,
  };
}

/** Which renewal sentence the card should show. Pure, so the three states are
 *  testable without rendering: renewing / cancellation booked / not subscribed. */
export function renewalState(o: SubscriptionOverview): "auto_renew" | "cancel_scheduled" | "none" {
  if (o.tier === "free") return "none";
  if (o.auto_renew) return "auto_renew";
  return "cancel_scheduled";
}

function asResult(raw: unknown): ManageResult {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const outcome = (typeof rec.outcome === "string" ? rec.outcome : "provider_error") as ManageOutcome;
  const reason =
    rec.reason === "not_eligible" || rec.reason === "not_subscribed" ? (rec.reason as ManageRejectReason) : null;
  return {
    ok: rec.ok === true,
    outcome,
    reason,
    contactSupport: rec.contact_support === true,
    reference: typeof rec.reference === "string" ? rec.reference : null,
    dryRun: rec.dry_run === true,
    eligibility: asEligibility(rec.eligibility),
  };
}

/** Cancel the subscription. Defaults to the next renewal date so the user keeps
 *  the period they already paid for; "immediately" is the explicit opt-in. */
export async function cancelSubscription(
  effectiveFrom: "next_billing_period" | "immediately" = "next_billing_period",
): Promise<ManageResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("subscription-manage", {
    body: { action: "cancel", effective_from: effectiveFrom },
  });
  if (error) throw error;
  return asResult(data);
}

/** Submit a full-refund request. The server re-checks eligibility first, so a
 *  client that somehow shows a stale "eligible" cannot force one through. */
export async function requestRefund(): Promise<ManageResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("subscription-manage", {
    body: { action: "refund_request" },
  });
  if (error) throw error;
  return asResult(data);
}

/** i18n key suffix for the sentence that explains a verdict. Pure, so the
 *  verdict-to-copy mapping is testable without rendering the screen. */
export function refundReasonKey(status: RefundStatus): string {
  switch (status) {
    case "eligible":
      return "eligible";
    case "refund_already_requested":
      return "alreadyRequested";
    case "used_beyond_free":
      return "usedBeyondFree";
    case "window_passed":
      return "windowPassed";
    case "no_payment":
      return "noPayment";
    default:
      return "unknown";
  }
}

/** Whether the refund button should be tappable at all. Only the server's
 *  "eligible" opens it; every other verdict renders as an explanation. */
export function canRequestRefund(eligibility: RefundEligibility): boolean {
  return eligibility.status === "eligible";
}

/** "카드 ·· 4242" style remnant, or null when Paddle reported no card. Never
 *  invents a method name: an unknown method shows as nothing rather than a guess. */
export function formatPaymentMethod(o: Pick<SubscriptionOverview, "payment_method" | "card_brand" | "card_last4">): string | null {
  const brand = o.card_brand ? o.card_brand.toUpperCase() : null;
  if (o.card_last4) return brand ? `${brand} ${o.card_last4}` : `•••• ${o.card_last4}`;
  if (o.payment_method) return o.payment_method;
  return null;
}

/** Days left in the refund window, floored at 0. null when there is no payment.
 *  Falls back to REFUND_WINDOW_DAYS if an older server omits the field, so the
 *  user still sees a window rather than a blank. */
export function refundDaysLeft(e: RefundEligibility): number | null {
  if (e.days_since_payment == null) return null;
  const total = e.refund_window_days ?? (revisedPolicyInForce() ? REFUND_WINDOW_DAYS : PRE_REVISION_WINDOW_DAYS);
  return Math.max(0, Math.floor(total - e.days_since_payment));
}
