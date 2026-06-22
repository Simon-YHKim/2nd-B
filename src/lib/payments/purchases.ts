// Platform-native IAP wrapper around RevenueCat (react-native-purchases v10).
// RevenueCat routes a single Offering to Google Play Billing on Android and
// Apple In-App Purchase on iOS automatically; this module is the only place
// the app touches the SDK.
//
// SCAFFOLD ONLY — this is NOT live charging yet. Real charging requires:
//   (a) a RevenueCat project with the public SDK keys set in env:
//       EXPO_PUBLIC_REVENUECAT_IOS_KEY (iOS) / EXPO_PUBLIC_REVENUECAT_ANDROID_KEY (Android).
//   (b) products + an entitlement named "pro" configured in App Store Connect
//       AND Google Play Console, then attached to an Offering in the RevenueCat
//       dashboard.
//   (c) server-side revenue logging: a RevenueCat webhook -> Supabase edge
//       function that INSERTs into revenue_events. That is OUT OF SCOPE here and
//       must NOT weaken the existing revenue_events schema (constraint C4:
//       month_bucket + is_related_party + customer_relation_type stay required).
//       TODO(IAP-webhook): wire the RevenueCat -> edge function -> revenue_events path.
//
// Web is unsupported (RevenueCat react-native-purchases is native-only). On web,
// or when the platform key is missing, every call NO-OPs and returns a safe
// default so the UI never crashes and never shows a dead button.

import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";

// The entitlement identifier configured in the RevenueCat dashboard. A customer
// who owns any "pro" product has customerInfo.entitlements.active["pro"] set.
export const PRO_ENTITLEMENT = "pro";

export type PurchaseOutcome =
  | { status: "purchased"; isPro: boolean }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export type RestoreOutcome =
  | { status: "restored"; isPro: boolean }
  | { status: "unavailable" }
  | { status: "error"; message: string };

// True only on a native platform with a configured public key. Drives every
// guard below; flipped during configurePurchases().
let purchasesAvailable = false;
let configured = false;

function platformKey(): string | undefined {
  // Member-expression reads so babel-preset-expo can inline EXPO_PUBLIC_* at
  // build time (see src/lib/env.ts for why aliasing process.env breaks this).
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return undefined;
}

/**
 * Whether real purchases can run: native platform + a public SDK key + a
 * successful configure(). Returns false on web / missing key — callers should
 * show the "upgrade in the mobile app" notice instead of a checkout flow.
 */
export function arePurchasesAvailable(): boolean {
  return purchasesAvailable;
}

/**
 * Configure the RevenueCat SDK once with the public key for the current
 * platform. NO-OP and leaves purchasesAvailable=false on web or when the key is
 * missing. Never throws — a misconfigured store must not crash the app.
 */
export function configurePurchases(): void {
  if (configured) return;
  configured = true;

  if (Platform.OS === "web") {
    purchasesAvailable = false;
    return;
  }
  const apiKey = platformKey();
  if (!apiKey || apiKey.trim().length === 0) {
    purchasesAvailable = false;
    return;
  }
  try {
    Purchases.configure({ apiKey });
    purchasesAvailable = true;
  } catch (e) {
    purchasesAvailable = false;
    if (typeof console !== "undefined") {
      console.warn("[purchases] configure failed; purchases disabled.", e);
    }
  }
}

/**
 * Fetch the current Offering's packages (each maps to a Play / App Store
 * product). Returns [] on web / no-key / no-offering / error — never throws.
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!ensureConfigured()) return [];
  try {
    const offerings: PurchasesOfferings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[purchases] getOfferings failed.", e);
    return [];
  }
}

/**
 * Buy a package. RevenueCat routes to Play Billing (Android) or StoreKit (iOS).
 * Distinguishes user-cancellation from real errors so the UI can stay quiet on
 * cancel. Returns "unavailable" on web / no-key.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!ensureConfigured()) return { status: "unavailable" };
  try {
    const result = await Purchases.purchasePackage(pkg);
    return { status: "purchased", isPro: hasProEntitlement(result.customerInfo) };
  } catch (e) {
    if (isUserCancelled(e)) return { status: "cancelled" };
    if (typeof console !== "undefined") console.warn("[purchases] purchasePackage failed.", e);
    return { status: "error", message: errorMessage(e) };
  }
}

/**
 * Restore prior purchases (required by both stores). Returns "unavailable" on
 * web / no-key.
 */
export async function restorePurchases(): Promise<RestoreOutcome> {
  if (!ensureConfigured()) return { status: "unavailable" };
  try {
    const info = await Purchases.restorePurchases();
    return { status: "restored", isPro: hasProEntitlement(info) };
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[purchases] restorePurchases failed.", e);
    return { status: "error", message: errorMessage(e) };
  }
}

/**
 * Whether the current customer owns the "pro" entitlement. Returns false on
 * web / no-key / error — the safe default (treat as free).
 */
export async function getProStatus(): Promise<boolean> {
  if (!ensureConfigured()) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasProEntitlement(info);
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[purchases] getCustomerInfo failed.", e);
    return false;
  }
}

// --- internals ---------------------------------------------------------------

// Lazily configure on first use so callers that forget configurePurchases()
// still behave safely, and re-check availability each time.
function ensureConfigured(): boolean {
  if (!configured) configurePurchases();
  return purchasesAvailable;
}

function hasProEntitlement(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

function isUserCancelled(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { userCancelled?: boolean }).userCancelled === true;
}

function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "purchase_error";
}
