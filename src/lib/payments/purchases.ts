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

/**
 * Opt-in strict read for surfaces that must distinguish a store outage from an
 * unconfigured build. `getOfferings()` intentionally remains fail-soft for its
 * existing callers; the plans screen uses this result seam so an SDK error is
 * never presented as an empty Offering or a coming-soon product.
 */
export type OfferingsOutcome =
  | { status: "ready"; packages: PurchasesPackage[] }
  | { status: "unavailable" }
  | { status: "error" };

export type PlansPackageTier = "plus" | "pro";

/**
 * Select only an unambiguous monthly package for the requested plans tier.
 * There is deliberately no packages[0] fallback: a wrong product is a real
 * charge at the wrong entitlement, not a cosmetic matching error.
 */
export function findMonthlyTierPackage(
  packages: PurchasesPackage[],
  tier: PlansPackageTier,
): PurchasesPackage | undefined {
  const requested =
    tier === "plus" ? ["plus", "voyager", "cortex"] : ["pro", "northstar", "north", "brain"];
  const other =
    tier === "plus" ? ["pro", "northstar", "north", "brain"] : ["plus", "voyager", "cortex"];
  return packages.find((pkg) => {
    const tokens = `${pkg.identifier} ${pkg.product.identifier}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const hasRequestedTier = requested.some((hint) => tokens.includes(hint));
    const hasOtherTier = other.some((hint) => tokens.includes(hint));
    const monthly = tokens.some(
      (token) => token === "monthly" || token === "month" || token === "p1m",
    );
    const yearly = tokens.some(
      (token) => token === "yearly" || token === "annual" || token === "year" || token === "p1y",
    );
    return hasRequestedTier && !hasOtherTier && monthly && !yearly;
  });
}

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
  } catch {
    purchasesAvailable = false;
    if (typeof console !== "undefined") {
      console.warn("[purchases] configure failed; purchases disabled.");
    }
  }
}

/**
 * Fetch the current Offering's packages (each maps to a Play / App Store
 * product). Returns [] on web / no-key / no-offering / error — never throws.
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  const outcome = await getOfferingsResult();
  return outcome.status === "ready" ? outcome.packages : [];
}

/**
 * Load the current Offering without collapsing SDK failures into `[]`.
 *
 * No raw SDK error is returned: purchase identifiers, receipts, and customer
 * details must not leak into UI copy, accessibility labels, or snapshots.
 */
export async function getOfferingsResult(): Promise<OfferingsOutcome> {
  if (!ensureConfigured()) return { status: "unavailable" };
  try {
    const offerings: PurchasesOfferings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages.length > 0 ? { status: "ready", packages } : { status: "unavailable" };
  } catch {
    if (typeof console !== "undefined") console.warn("[purchases] getOfferings failed.");
    return { status: "error" };
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
    if (typeof console !== "undefined") console.warn("[purchases] purchasePackage failed.");
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
    if (typeof console !== "undefined") console.warn("[purchases] restorePurchases failed.");
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
  } catch {
    if (typeof console !== "undefined") console.warn("[purchases] getCustomerInfo failed.");
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
  return (
    typeof e === "object" && e !== null && (e as { userCancelled?: boolean }).userCancelled === true
  );
}

function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "purchase_error";
}

/** Test-only: restore the module-level configuration latch. */
export function __resetPurchasesForTests(): void {
  purchasesAvailable = false;
  configured = false;
}
