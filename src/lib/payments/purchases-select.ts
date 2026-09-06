// Pure package selection for the plans paywall. Deliberately OUTSIDE the
// react-native-purchases platform seam:
//
// `purchases.ts` may name the SDK; `purchases.web.ts` may not, and
// src/lib/__tests__/web-bundle-shims.test.ts scans every other file under src/
// for the package name TEXTUALLY -- a type-only import would still trip it.
// Both variants need this selector and must give the same answer, so it lives
// here once and is re-exported from each side. The parameter is typed
// structurally rather than as `PurchasesPackage`, which keeps the SDK name out
// of this file while still resolving to `PurchasesPackage` at every call site
// through the generic.

export type PlansPackageTier = "plus" | "pro";

/** The fields this selector reads. `PurchasesPackage` satisfies it. */
export interface TieredPackage {
  identifier: string;
  product: { identifier: string };
}

/**
 * Select only an unambiguous monthly package for the requested plans tier.
 * There is deliberately no packages[0] fallback: a wrong product is a real
 * charge at the wrong entitlement, not a cosmetic matching error.
 */
export function findMonthlyTierPackage<T extends TieredPackage>(
  packages: T[],
  tier: PlansPackageTier,
): T | undefined {
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
