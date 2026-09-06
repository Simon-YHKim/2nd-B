// RevenueCat IAP wrapper, WEB side of the platform split -- fail-closed stub.
// The real SDK path lives in ./purchases.ts; Metro resolves THIS file on web
// and ./purchases.ts on ios/android (and under tsc/jest, which have no
// platform extensions).
//
// WHY A SPLIT (audit D5-01): ./purchases.ts imports react-native-purchases at
// module scope. Metro walks the graph statically, so the SDK plus its
// @revenuecat/purchases-js-hybrid-mappings peer rode into the web entry even
// though every call already no-ops on web (Platform.OS === "web"). This stub
// returns exactly the values the native file returns on web today, so no
// caller can tell the difference -- the "upgrade in the mobile app" notice
// keeps rendering, nothing throws, nothing charges.
//
// RULES for this file (enforced by src/lib/__tests__/web-bundle-shims.test.ts;
// the web-export-smoke job in ci.yml only proves the web export still builds):
//   - Never reference react-native-purchases here in any importable form.
//     Types come from ./purchases via type-only imports (erased at compile).
//   - Keep the export surface identical to ./purchases.ts.

import type { PurchaseOutcome, PurchasesPackage, RestoreOutcome } from "./purchases";

export type { PurchaseOutcome, PurchasesPackage, RestoreOutcome } from "./purchases";

export const PRO_ENTITLEMENT = "pro";

/** Web: RevenueCat is native-only, so purchases are never available. */
export function arePurchasesAvailable(): boolean {
  return false;
}

/** Web: nothing to configure. */
export function configurePurchases(): void {}

/** Web: no store, no offerings. */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  return [];
}

/** Web: the checkout flow is unavailable (same answer the native file gives). */
export async function purchasePackage(_pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  return { status: "unavailable" };
}

/** Web: restore is unavailable (same answer the native file gives). */
export async function restorePurchases(): Promise<RestoreOutcome> {
  return { status: "unavailable" };
}

/** Web: treat as free -- the DB tier is the gating authority anyway (R3). */
export async function getProStatus(): Promise<boolean> {
  return false;
}
