import { captureEvent, getAnalyticsConsentSnapshot } from "./index";
import {
  cleanConversionProps, isConversionCurrency, isMoney, isPaddleId, objectValue,
  type CheckoutConversionProps, type ConversionCadence, type ConversionTier, type PurchaseConversionProps,
} from "./conversion-events";

export interface PaddleAnalyticsInput {
  tier: ConversionTier;
  cadence: ConversionCadence;
  priceId: string;
  environment: "production" | "sandbox";
}

/** Paddle.js totals are currency units (numbers), unlike API minor-unit strings. */
export function paddlePurchaseProps(event: unknown, input: PaddleAnalyticsInput): PurchaseConversionProps | null {
  const callback = objectValue(event);
  const data = objectValue(callback.data);
  if (callback.name !== "checkout.completed" || data.status !== "completed") return null;
  if (!isPaddleId(data.transaction_id, "txn") || !isConversionCurrency(data.currency_code)) return null;
  if (!Array.isArray(data.items) || data.items.length !== 1) return null;
  const item = objectValue(data.items[0]);
  if (item.price_id !== input.priceId || item.quantity !== 1) return null;
  const totals = objectValue(data.totals);
  const itemTotals = objectValue(item.totals);
  // Revenue excludes tax and includes the actual discount. Never use a plan
  // catalogue price, a guessed currency, or the amount left after payment.
  if (!isMoney(totals.subtotal) || !isMoney(totals.discount) || totals.discount > totals.subtotal) return null;
  if (!isMoney(itemTotals.subtotal) || !isMoney(itemTotals.discount) || itemTotals.discount > itemTotals.subtotal) return null;
  const amount = totals.subtotal - totals.discount;
  const itemAmount = itemTotals.subtotal - itemTotals.discount;
  if (Math.abs(amount - itemAmount) > 0.000001) return null;
  const props: PurchaseConversionProps = {
    transaction_id: data.transaction_id, tier: input.tier, period: input.cadence,
    currency: data.currency_code, value: amount,
    items: [{ item_id: input.priceId, item_name: input.tier, quantity: 1, price: itemAmount }],
  };
  return cleanConversionProps("purchase", props) ? props : null;
}

/** No consent at open, or any later withdrawal/account change, retires this attempt. */
export function createPaddleAnalyticsAttempt(input: PaddleAnalyticsInput): {
  started(): boolean;
  completed(event: unknown): boolean;
} {
  const scope = getAnalyticsConsentSnapshot();
  let opened = false;
  let startedObserved = false;
  const allowed = () => {
    const now = getAnalyticsConsentSnapshot();
    return input.environment === "production" && scope.granted && scope.resolved &&
      now.granted && now.revision === scope.revision && now.epoch === scope.epoch &&
      now.ownerId === scope.ownerId;
  };
  return {
    started() {
      if (opened) return false;
      opened = true;
      if (!allowed()) return false;
      const props: CheckoutConversionProps = {
        tier: input.tier, period: input.cadence,
        items: [{ item_id: input.priceId, item_name: input.tier, quantity: 1 }],
      };
      startedObserved = captureEvent({ name: "begin_checkout", props });
      return startedObserved;
    },
    completed(event) {
      if (!opened || !startedObserved || !allowed()) return false;
      const props = paddlePurchaseProps(event, input);
      return props ? captureEvent({ name: "purchase", props }) : false;
    },
  };
}
