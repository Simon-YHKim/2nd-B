// The price on the card and the price Paddle charges, pinned together.
//
// WHY THIS IS NOT A UNIT TEST OF ARITHMETIC. src/lib/progression/pricing.ts is
// the source of truth for what the paywall PRINTS, and Paddle is the source of
// truth for what the customer is CHARGED. Nothing connected the two: the price
// ids live in repo Variables, the amounts live in Paddle's dashboard, and the
// numbers live in this repo. Three places, no link. A paywall that prints a
// number the processor does not charge is a false price disclosure, which in
// Korea is the one thing that has to be right at the price surface
// (전자상거래법 §13; the app's own disclosure copy promises VAT-inclusive prices).
//
// So on 2026-08-20 the live Paddle prices were MEASURED and are pinned below.
// The pin does not prove Paddle still agrees today - nothing in CI can, without
// a browser and a live call. What it does is make the pairing explicit: editing
// pricing.ts now fails this test, which forces whoever edits it to re-measure
// rather than change one side of a two-sided contract.
//
// HOW TO RE-MEASURE (no API key needed - the client token is a public repo
// Variable, and this is the same read a customer's browser does when the paywall
// loads):
//
//   1. A page that loads https://cdn.paddle.com/paddle/v2/paddle.js
//   2. Paddle.Initialize({ token: <EXPO_PUBLIC_PADDLE_CLIENT_TOKEN> })
//   3. Paddle.PricePreview({ items: [{ priceId, quantity: 1 }],
//                            address: { countryCode: "KR" } })
//   4. Read data.details.lineItems[].formattedTotals.total  (VAT-INCLUSIVE)
//      and data.availablePaymentMethods
//
// Run it in headless Chrome and read the DOM. formattedTotals.subtotal is
// PRE-tax and will look 10% low; .total is the number the paywall prints.

import { TIER_PRICING } from "../../progression/pricing";
import { TIER_PRICE_KRW, TIER_PRICE_KRW_YEARLY } from "../../entitlements/tiers";

/**
 * Measured against LIVE Paddle on 2026-08-20 with countryCode KR, via
 * Paddle.PricePreview through the public client token. `total` is VAT-inclusive;
 * `subtotal` + `tax` are recorded because the 10% split is what makes the
 * app's "표시 가격은 부가세(VAT)가 포함돼 있습니다" copy true.
 */
const PADDLE_MEASURED_2026_08_20 = {
  cortexMonthly: { total: 9_900, subtotal: 9_000, tax: 900, name: "항해자 월간 구독 (Voyager Monthly)" },
  cortexYearly: { total: 99_000, subtotal: 90_000, tax: 9_000, name: "항해자 연간 구독 (Voyager Yearly, 2개월 무료)" },
  brainMonthly: { total: 19_900, subtotal: 18_091, tax: 1_809, name: "북극성 월간 구독 (North Star Monthly)" },
  brainYearly: { total: 199_000, subtotal: 180_909, tax: 18_091, name: "북극성 연간 구독 (North Star Yearly, 2개월 무료)" },
} as const;

/** Also measured in the same call. Recorded because a doc claimed the opposite. */
const PADDLE_PAYMENT_METHODS_KR_2026_08_20 = [
  "card",
  "naver_pay",
  "kakao_pay",
  "south_korea_local_card",
  "apple_pay",
] as const;

describe("what the paywall prints is what Paddle charges", () => {
  test("항해자 monthly", () => {
    expect(TIER_PRICING.cortex.krwMonthly).toBe(PADDLE_MEASURED_2026_08_20.cortexMonthly.total);
    expect(TIER_PRICE_KRW.plus).toBe(PADDLE_MEASURED_2026_08_20.cortexMonthly.total);
  });

  test("항해자 yearly", () => {
    expect(TIER_PRICING.cortex.krwYearly).toBe(PADDLE_MEASURED_2026_08_20.cortexYearly.total);
    expect(TIER_PRICE_KRW_YEARLY.plus).toBe(PADDLE_MEASURED_2026_08_20.cortexYearly.total);
  });

  test("북극성 monthly", () => {
    expect(TIER_PRICING.brain.krwMonthly).toBe(PADDLE_MEASURED_2026_08_20.brainMonthly.total);
    expect(TIER_PRICE_KRW.pro).toBe(PADDLE_MEASURED_2026_08_20.brainMonthly.total);
  });

  test("북극성 yearly", () => {
    expect(TIER_PRICING.brain.krwYearly).toBe(PADDLE_MEASURED_2026_08_20.brainYearly.total);
    expect(TIER_PRICE_KRW_YEARLY.pro).toBe(PADDLE_MEASURED_2026_08_20.brainYearly.total);
  });
});

describe("the VAT-inclusive claim in the disclosure copy is true", () => {
  test.each(Object.entries(PADDLE_MEASURED_2026_08_20))("%s: subtotal + tax = total", (_k, m) => {
    expect(m.subtotal + m.tax).toBe(m.total);
  });

  test("tax is Korean VAT at 10%, within the rounding Paddle applies", () => {
    for (const m of Object.values(PADDLE_MEASURED_2026_08_20)) {
      expect(Math.abs(m.tax - m.subtotal * 0.1)).toBeLessThanOrEqual(1);
    }
  });
});

describe("the two-months-free claim is literally true on both sides", () => {
  test("our own numbers say ten months", () => {
    expect(TIER_PRICING.cortex.krwYearly).toBe(TIER_PRICING.cortex.krwMonthly * 10);
    expect(TIER_PRICING.brain.krwYearly).toBe(TIER_PRICING.brain.krwMonthly * 10);
  });

  test("Paddle's own numbers say ten months too", () => {
    const m = PADDLE_MEASURED_2026_08_20;
    expect(m.cortexYearly.total).toBe(m.cortexMonthly.total * 10);
    expect(m.brainYearly.total).toBe(m.brainMonthly.total * 10);
  });

  test("and Paddle's price names say so out loud", () => {
    expect(PADDLE_MEASURED_2026_08_20.cortexYearly.name).toContain("2개월 무료");
    expect(PADDLE_MEASURED_2026_08_20.brainYearly.name).toContain("2개월 무료");
  });
});

describe("the Korean payment methods the legal docs promise are actually offered", () => {
  // docs/legal and the paywall disclosure name 카드 / KakaoPay / NaverPay. Until
  // this was measured, several docs asserted the opposite - that none of them
  // were enabled and the legal text was therefore false in production.
  test.each(["card", "kakao_pay", "naver_pay", "south_korea_local_card"])("%s is available for KR", (m) => {
    expect(PADDLE_PAYMENT_METHODS_KR_2026_08_20).toContain(m);
  });

  test("the KRW condition Paddle requires for them is met by real KRW prices", () => {
    // Paddle only surfaces the Korean methods when the price is in KRW and the
    // buyer address is KR. The preview above was made with countryCode KR and
    // came back in KRW, so both halves held.
    for (const m of Object.values(PADDLE_MEASURED_2026_08_20)) {
      expect(Number.isInteger(m.total)).toBe(true);
      expect(m.total).toBeGreaterThan(0);
    }
  });
});
