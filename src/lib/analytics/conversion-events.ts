// Web conversion payloads are constructed from allowlisted values, never from
// spreads of an auth result or Paddle callback. No customer identifiers belong here.
export const AUTH_METHODS = ["email", "google", "apple", "kakao", "naver", "facebook", "github"] as const;
export type AuthMethod = typeof AUTH_METHODS[number];
export type ConversionTier = "cortex" | "brain";
export type ConversionCadence = "monthly" | "yearly";
export interface AnalyticsItem {
  item_id: string;
  item_name: ConversionTier;
  quantity: number;
  price?: number;
}
export interface CheckoutConversionProps {
  tier: ConversionTier;
  period: ConversionCadence;
  items: AnalyticsItem[];
  value?: number;
  currency?: string;
}
export interface PurchaseConversionProps extends CheckoutConversionProps {
  transaction_id: string;
  value: number;
  currency: string;
}
export type WebConversionEvent =
  | { name: "login" | "sign_up"; props: { method: AuthMethod } }
  | { name: "begin_checkout"; props: CheckoutConversionProps };

// Paddle's supported ISO 4217 codes, checked against its currency reference.
const CURRENCIES = new Set("USD EUR GBP JPY AUD CAD CHF HKD SGD SEK ARS BRL CLP CNY COP CZK DKK HUF ILS INR KRW MXN NOK NZD PEN PLN RUB THB TRY TWD UAH VND ZAR".split(" "));
export function isConversionCurrency(value: unknown): value is string {
  return typeof value === "string" && CURRENCIES.has(value);
}
export function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}
function hasCurrencyPrecision(value: number, currency: string): boolean {
  const scale = ["CLP", "JPY", "KRW", "VND"].includes(currency) ? 1 : 100;
  const units = value * scale;
  return units <= Number.MAX_SAFE_INTEGER && Math.abs(units - Math.round(units)) < 0.000001;
}
export function authMethod(value: unknown): AuthMethod | null {
  return AUTH_METHODS.includes(value as AuthMethod) ? value as AuthMethod : null;
}
export function isPaddleId(value: unknown, prefix: "pri" | "txn"): value is string {
  return typeof value === "string" && new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{26}$`).test(value);
}
export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** null means refuse the event, not send a partially populated purchase. */
export function cleanConversionProps(name: string, value: unknown): Record<string, string | number | AnalyticsItem[]> | null {
  const props = objectValue(value);
  if (name === "login" || name === "sign_up") {
    const method = authMethod(props.method);
    return method ? { method } : null;
  }
  if (props.tier !== "cortex" && props.tier !== "brain") return null;
  if (props.period !== "monthly" && props.period !== "yearly") return null;
  if (!Array.isArray(props.items) || props.items.length !== 1) return null;
  const item = objectValue(props.items[0]);
  if (!isPaddleId(item.item_id, "pri") || item.item_name !== props.tier || item.quantity !== 1) return null;
  if (item.price !== undefined && !isMoney(item.price)) return null;
  const out: Record<string, string | number | AnalyticsItem[]> = {
    tier: props.tier, period: props.period,
    items: [{ item_id: item.item_id, item_name: props.tier, quantity: 1,
      ...(item.price !== undefined ? { price: item.price as number } : {}) }],
  };
  if (name === "purchase" || props.value !== undefined || props.currency !== undefined) {
    if (!isMoney(props.value) || !isConversionCurrency(props.currency)) return null;
    if (!hasCurrencyPrecision(props.value, props.currency)) return null;
    if (item.price !== undefined && Math.abs(item.price as number - props.value) > 0.000001) return null;
    out.value = props.value;
    out.currency = props.currency;
  }
  if (name === "purchase") {
    if (!isPaddleId(props.transaction_id, "txn")) return null;
    out.transaction_id = props.transaction_id;
  }
  return out;
}
