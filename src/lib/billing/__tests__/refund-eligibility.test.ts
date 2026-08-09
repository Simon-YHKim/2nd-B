// Boundary tests for the refund rule.
//
// The rule lives in SQL (refund_eligibility, 0114) and jest cannot execute it, so
// the arithmetic is mirrored by pure functions in subscription-manage.ts and the
// SQL constants are pinned against those same exports in
// billing-self-service-migration.test.ts. Together that is the same contract 0089
// has with tier-map.ts: one number, two places, a test that fails when they part.
//
// What is worth asserting here is exactly the edges where money changes hands:
// the cap reached vs exceeded, and the 7-day window boundary.

import {
  FREE_RUNS_PER_WEEK,
  REFUND_WINDOW_DAYS,
  canRequestRefund,
  formatPaymentMethod,
  freeAllowanceForSpan,
  refundDaysLeft,
  refundReasonKey,
  verdictFor,
  type RefundEligibility,
} from "../subscription-manage";

const runs = (daysSincePayment: number, reasoningRuns: number) =>
  verdictFor({ daysSincePayment, reasoningRuns, reasoningCalls: 0 });

describe("free-plan allowance is pro-rated by whole or partial weeks", () => {
  test("free cap is the tier-map number, not a retyped literal", () => {
    expect(FREE_RUNS_PER_WEEK).toBe(2);
    expect(REFUND_WINDOW_DAYS).toBe(7);
  });

  test.each([
    [0, 1, 2],
    [1, 1, 2],
    [7, 1, 2],
    [6.9, 1, 2],
    [7.5, 2, 4],
    [14, 2, 4],
  ])("a %s-day-old payment allows %s week(s) = %s runs", (days, weeks, allowance) => {
    expect(freeAllowanceForSpan(days)).toEqual({ weeks, allowance });
  });

  test("a same-day payment still gets a full week of allowance, never zero", () => {
    expect(freeAllowanceForSpan(0).allowance).toBe(FREE_RUNS_PER_WEEK);
  });
});

describe("usage boundary: at the cap is still eligible, one over is not", () => {
  test("under the cap", () => {
    expect(runs(3, 1)).toBe("eligible");
  });

  test("exactly at the cap stays eligible (the allowance is inclusive)", () => {
    expect(runs(3, 2)).toBe("eligible");
  });

  test("one run past the cap loses the automatic refund", () => {
    expect(runs(3, 3)).toBe("used_beyond_free");
  });

  // The pro-rating formula still scales past a week; the 7-day window simply
  // never reaches that arm. Kept asserted so a future window change is safe.
  test("the formula still pro-rates beyond a week if the window is ever widened", () => {
    expect(freeAllowanceForSpan(10)).toEqual({ weeks: 2, allowance: 4 });
    expect(freeAllowanceForSpan(30)).toEqual({ weeks: 5, allowance: 10 });
  });

  test("zero usage is always eligible inside the window", () => {
    expect(runs(6.9, 0)).toBe("eligible");
  });

  test("the window is one allowance period, so the cap never grows: 2 all week", () => {
    for (const day of [0, 1, 3, 6.9, 7]) {
      expect(freeAllowanceForSpan(day).allowance).toBe(FREE_RUNS_PER_WEEK);
    }
  });
});

describe("7-day window boundary", () => {
  test("day 7 exactly is still inside the window", () => {
    expect(runs(7, 0)).toBe("eligible");
  });

  test("past day 7 the window closes regardless of usage", () => {
    expect(runs(7.01, 0)).toBe("window_passed");
    expect(runs(8, 0)).toBe("window_passed");
    expect(runs(45, 0)).toBe("window_passed");
  });

  test("window_passed wins over used_beyond_free (the window is checked first)", () => {
    expect(runs(60, 999)).toBe("window_passed");
  });

  test("no payment on record is its own verdict, not a refusal", () => {
    expect(verdictFor({ daysSincePayment: null, reasoningRuns: 0, reasoningCalls: 0 })).toBe("no_payment");
  });
});

describe("audit-log fallback only applies when the run ledger is empty", () => {
  test("with runs present the audit count is ignored, however large", () => {
    expect(verdictFor({ daysSincePayment: 3, reasoningRuns: 1, reasoningCalls: 50 })).toBe("eligible");
  });

  test("with no runs, logged calls beyond the allowance still block a free refund", () => {
    expect(verdictFor({ daysSincePayment: 3, reasoningRuns: 0, reasoningCalls: 3 })).toBe("used_beyond_free");
  });

  test("with no runs and calls inside the allowance it stays eligible", () => {
    expect(verdictFor({ daysSincePayment: 3, reasoningRuns: 0, reasoningCalls: 2 })).toBe("eligible");
  });
});

describe("the button opens only on the server's 'eligible'", () => {
  test.each(["used_beyond_free", "window_passed", "no_payment", "unknown"] as const)(
    "%s does not open the refund button",
    (status) => {
      expect(canRequestRefund({ status })).toBe(false);
    },
  );

  test("eligible opens it", () => {
    expect(canRequestRefund({ status: "eligible" })).toBe(true);
  });

  test("an unrecognised server verdict is treated as not eligible", () => {
    expect(canRequestRefund({ status: "something_new" as never })).toBe(false);
    expect(refundReasonKey("something_new" as never)).toBe("unknown");
  });
});

describe("days-left display", () => {
  const base: RefundEligibility = { status: "eligible", refund_window_days: 7 };

  test("counts down and never goes negative", () => {
    expect(refundDaysLeft({ ...base, days_since_payment: 0 })).toBe(7);
    expect(refundDaysLeft({ ...base, days_since_payment: 6.4 })).toBe(0);
    expect(refundDaysLeft({ ...base, days_since_payment: 45 })).toBe(0);
  });

  test("falls back to the published window when the server omits it", () => {
    expect(refundDaysLeft({ status: "eligible", days_since_payment: 3 })).toBe(4);
  });

  test("no payment means no countdown", () => {
    expect(refundDaysLeft(base)).toBeNull();
  });
});

describe("payment method is shown, never invented", () => {
  test("card brand plus remnant", () => {
    expect(formatPaymentMethod({ payment_method: "card", card_brand: "visa", card_last4: "4242" })).toBe("VISA 4242");
  });

  test("remnant without a brand still renders", () => {
    expect(formatPaymentMethod({ payment_method: "card", card_brand: null, card_last4: "4242" })).toBe("•••• 4242");
  });

  test("a non-card method falls back to the method name", () => {
    expect(formatPaymentMethod({ payment_method: "paypal", card_brand: null, card_last4: null })).toBe("paypal");
  });

  test("nothing on record renders nothing rather than a guess", () => {
    expect(formatPaymentMethod({ payment_method: null, card_brand: null, card_last4: null })).toBeNull();
  });
});
