// Plans billing + owner-safety contract.
//
// Source assertions pin renderer wiring that the bare RN Jest preset cannot
// render reliably. Runtime assertions cover the extracted async/owner gates and
// the RevenueCat result seam, so the suite does not mistake source text for the
// actual stale-request and fail-soft behavior.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockConfigure = jest.fn();
const mockGetOfferings = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: mockConfigure,
    getOfferings: mockGetOfferings,
    getCustomerInfo: mockGetCustomerInfo,
    purchasePackage: mockPurchasePackage,
    restorePurchases: mockRestorePurchases,
  },
}));
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

import {
  REWARD_MONTHLY_CAP,
  TIER_PRICE_KRW,
  TIER_PRICE_KRW_YEARLY,
} from "../../entitlements/tiers";
import {
  __resetPurchasesForTests,
  findMonthlyTierPackage,
  getOfferings,
  getOfferingsResult,
  getProStatus,
} from "../../payments/purchases";
import { TIER_PRICING } from "../../progression/pricing";
import {
  createOwnerActionGate,
  createProgressionOwnerGate,
  progressionSnapshotForOwner,
  rewardCapAllowsWatch,
  settleAsyncRead,
  type ProgressionSnapshot,
} from "../../progression/useProgression";

const ROOT = join(__dirname, "..", "..", "..");
const src = readFileSync(join(ROOT, "screens", "deepspace", "dds-plans-screen.tsx"), "utf8");
const app = readFileSync(join(ROOT, "app", "plans.tsx"), "utf8");
const checkout = readFileSync(join(ROOT, "lib", "billing", "paddle-checkout.ts"), "utf8");
const purchasesSource = readFileSync(join(ROOT, "lib", "payments", "purchases.ts"), "utf8");

const LOCALES = ["en", "ko", "es", "id", "pt"] as const;
const plansOf = (locale: string) =>
  JSON.parse(readFileSync(join(ROOT, "..", "locales", locale, "deepspace.json"), "utf8")).ds
    .plans as Record<string, string>;

type TestPackage = Parameters<typeof findMonthlyTierPackage>[0][number];
function pkg(identifier: string, productIdentifier: string): TestPackage {
  return { identifier, product: { identifier: productIdentifier } } as unknown as TestPackage;
}

describe("runtime store result and package contracts", () => {
  const originalAndroidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  let warn: jest.SpyInstance;

  beforeAll(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPurchasesForTests();
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "public-test-key";
  });

  afterAll(() => {
    warn.mockRestore();
    if (originalAndroidKey === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
    else process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = originalAndroidKey;
  });

  test("the opt-in offerings seam distinguishes unavailable, SDK error, and ready", async () => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
    expect(await getOfferingsResult()).toEqual({ status: "unavailable" });

    __resetPurchasesForTests();
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "public-test-key";
    mockGetOfferings.mockRejectedValueOnce(new Error("receipt-and-product-details"));
    expect(await getOfferingsResult()).toEqual({ status: "error" });

    __resetPurchasesForTests();
    const plus = pkg("cortex_monthly", "secondb_cortex_monthly");
    mockGetOfferings.mockResolvedValueOnce({ current: { availablePackages: [plus] } });
    expect(await getOfferingsResult()).toEqual({ status: "ready", packages: [plus] });
  });

  test("legacy getOfferings/getProStatus remain fail-soft", async () => {
    mockGetOfferings.mockRejectedValueOnce(new Error("private-offering-detail"));
    expect(await getOfferings()).toEqual([]);

    mockGetCustomerInfo.mockRejectedValueOnce(new Error("private-customer-detail"));
    expect(await getProStatus()).toBe(false);
    for (const call of warn.mock.calls) expect(call).toHaveLength(1);
  });

  test("monthly matching rejects wrong cadence, missing tier, and ambiguous tier ids", () => {
    const ambiguous = pkg("cortex_brain_monthly", "secondb_cortex_brain_monthly");
    const annual = pkg("cortex_yearly", "secondb_cortex_p1y");
    const unscoped = pkg("$rc_monthly", "secondb_monthly");
    const plus = pkg("$rc_monthly_cortex", "secondb_cortex_monthly");
    const pro = pkg("brain_monthly", "secondb_brain_p1m");

    expect(findMonthlyTierPackage([ambiguous, annual, unscoped, plus], "plus")).toBe(plus);
    expect(findMonthlyTierPackage([ambiguous, annual, unscoped], "plus")).toBeUndefined();
    expect(findMonthlyTierPackage([ambiguous, plus, pro], "pro")).toBe(pro);
    expect(findMonthlyTierPackage([ambiguous], "pro")).toBeUndefined();
  });
});

describe("runtime owner and async settlement contracts", () => {
  test("a later owner request invalidates A and sign-out invalidates B", () => {
    const gate = createProgressionOwnerGate();
    const a = gate.begin("owner-a");
    expect(gate.isStale(a, "owner-a")).toBe(false);
    const b = gate.begin("owner-b");
    expect(gate.isStale(a, "owner-b")).toBe(true);
    expect(gate.isStale(b, "owner-b")).toBe(false);
    gate.begin(null);
    expect(gate.isStale(b, null)).toBe(true);
  });

  test("the render projection drops A's tier before B's effect runs", () => {
    const a: ProgressionSnapshot = {
      ownerId: "owner-a",
      totalXp: 900,
      tier: "brain",
      judge: true,
      loading: false,
      error: false,
    };
    expect(progressionSnapshotForOwner(a, "owner-b")).toEqual({
      ownerId: "owner-b",
      totalXp: 0,
      tier: "free",
      judge: false,
      loading: true,
      error: false,
    });
    expect(progressionSnapshotForOwner(a, null).loading).toBe(false);
  });

  test("A's late action release cannot unlock or clear B", () => {
    const gate = createOwnerActionGate();
    const a = gate.acquire("owner-a");
    expect(a).not.toBeNull();
    expect(gate.acquire("owner-a")).toBeNull();
    gate.discardOtherOwner("owner-b");
    const b = gate.acquire("owner-b");
    expect(b).not.toBeNull();
    expect(gate.release(a!)).toBe(false);
    expect(gate.isLocked("owner-b")).toBe(true);
    expect(gate.release(b!)).toBe(true);
  });

  test("read settlement distinguishes rejection and consumes a late rejection after timeout", async () => {
    expect(await settleAsyncRead(Promise.resolve("ok"), 50)).toEqual({
      status: "ready",
      value: "ok",
    });
    expect(await settleAsyncRead(Promise.reject(new Error("read failed")), 50)).toEqual({
      status: "error",
    });

    jest.useFakeTimers();
    try {
      let rejectLate: ((reason?: unknown) => void) | undefined;
      const late = new Promise<string>((_resolve, reject) => {
        rejectLate = reject;
      });
      const verdict = settleAsyncRead(late, 10);
      jest.advanceTimersByTime(10);
      await expect(verdict).resolves.toEqual({ status: "timeout" });
      rejectLate?.(new Error("late private detail"));
      await Promise.resolve();
    } finally {
      jest.useRealTimers();
    }
  });

  test("the ad-earned cap closes exactly at the cap, independent of spendable credits", () => {
    expect(rewardCapAllowsWatch(REWARD_MONTHLY_CAP - 1, REWARD_MONTHLY_CAP)).toBe(true);
    expect(rewardCapAllowsWatch(REWARD_MONTHLY_CAP, REWARD_MONTHLY_CAP)).toBe(false);
    expect(rewardCapAllowsWatch(REWARD_MONTHLY_CAP + 200, REWARD_MONTHLY_CAP)).toBe(false);
    expect(rewardCapAllowsWatch(Number.NaN, REWARD_MONTHLY_CAP)).toBe(false);
  });
});

describe("auth, owner-scoped reads, and mutation boundaries", () => {
  test("auth/profile/tier failures hold or redirect honestly", () => {
    expect(src).toContain('if (!userId) return <Redirect href="/sign-in" />;');
    expect(src).toContain(
      'if (hasProfile === false) return <Redirect href="/complete-profile" />;',
    );
    expect(src).toMatch(/profileProbeFailed \|\| hasProfile === null/);
    expect(src).toMatch(/if \(tierLoading \|\| tierOwnerId !== userId\)/);
    expect(src).toMatch(/if \(tierError\)/);
  });

  test("prefs and usage use strict owner-scoped reads with explicit verdicts", () => {
    expect(src).toMatch(/\.select\("privacy_prefs"\)[\s\S]*?\.eq\("id", ownerId\)/);
    expect(src).toMatch(/\.from\("usage_counters"\)[\s\S]*?\.eq\("user_id", ownerId\)/);
    expect(src).toContain('client.rpc("credit_summary_self")');
    expect(src).toContain("credit.ad_earned_this_month");
    expect(src).toContain("monthRow?.reward_credits");
    expect(src).toContain("rewardCredits: Math.max(0, Number(credit.available) || 0)");
    expect(src).toContain(
      'type ReadStatus = "idle" | "loading" | "ready" | "unavailable" | "error" | "timeout"',
    );
    expect(src).not.toContain("fetchPrivacyPrefs");
    expect(src).not.toMatch(/\bgetReasoningUsage\(/);
  });

  test("owner projections cover reads and every transient interaction surface", () => {
    for (const marker of [
      "storeRead.ownerId === dataOwner",
      "prefsRead.ownerId === dataOwner",
      "usageRead.ownerId === dataOwner",
      "busyState?.ownerId === userId",
      "interactionBoundaryRef.current !== dataOwner",
      "pendingOwnerRef.current === dataOwner",
      "rewardOwnerRef.current === dataOwner",
    ]) {
      expect(src).toContain(marker);
    }
  });

  test("store error/timeout labels cannot masquerade as coming soon", () => {
    const labels = src.slice(
      src.indexOf("const unavailableLabel"),
      src.indexOf("const actionLabel"),
    );
    expect(labels).toMatch(
      /ownedStore\.status === "error" \|\| ownedStore\.status === "timeout"[\s\S]*?\? t\("ds\.plans\.loadError"\)/,
    );
    expect(labels.indexOf('t("ds.plans.loadError")')).toBeLessThan(
      labels.indexOf('t("ds.plans.comingSoon")'),
    );
    const canBuy = src.slice(src.indexOf("function canPurchase"), src.indexOf("const loading"));
    expect(canBuy).toContain("if (paddleCheckoutAvailable(paddleTier, cadence)) return true;");
    expect(canBuy).not.toContain("ownedStore.status");
  });

  test("mount/read effects contain zero purchase, restore, checkout, or reward-credit mutation", () => {
    const effects = src.slice(src.indexOf("useEffect(() =>"), src.indexOf("const ownedStore"));
    for (const mutation of [
      "purchasePackage(",
      "restorePurchases(",
      "openPaddleCheckout(",
      "addRewardCredits(",
    ]) {
      expect(effects).not.toContain(mutation);
    }
  });

  test("the client never writes an entitlement and errors never expose raw SDK objects", () => {
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\(e as Error\)\.message/);
    expect(purchasesSource).not.toMatch(/console\.warn\([^\n]+,\s*e\s*\)/);
  });
});

describe("the yearly rail and price authority", () => {
  test("a price id is resolved per tier and cadence", () => {
    expect(checkout).toMatch(/export type CheckoutCadence = "monthly" \| "yearly"/);
    expect(checkout).toMatch(
      /EXPO_PUBLIC_PADDLE_PRICE_\$\{tier\.toUpperCase\(\)\}_\$\{cadence\.toUpperCase\(\)\}/,
    );
    expect(checkout).toMatch(/const cadence = input\.cadence \?\? "monthly";/);
  });

  test("the screen passes cadence to availability and checkout", () => {
    expect(src).toMatch(/useState<CheckoutCadence>\("monthly"\)/);
    expect(src).toMatch(/paddleCheckoutAvailable\(paddleTier, cadence\)/);
    expect(src).toMatch(/openPaddleCheckout\(\{ tier, cadence, locale:/);
  });

  test("the period control exists only when both displayed Paddle cadences are live", () => {
    const offered = src.slice(src.indexOf("const yearlyOffered"), src.indexOf("const onNorthStar"));
    expect(offered).toContain('paddleCheckoutAvailable("cortex", "yearly")');
    expect(offered).toContain('paddleCheckoutAvailable("cortex", "monthly")');
    expect(offered).toContain("!PRO_COMING_SOON");
    expect(src).toMatch(/\{yearlyOffered \? \(/);
  });

  test("RevenueCat is refused for yearly and package[0] is never a fallback", () => {
    const purchasability = src.slice(
      src.indexOf("function canPurchase"),
      src.indexOf("const loading"),
    );
    expect(purchasability.indexOf('if (cadence !== "monthly") return false;')).toBeLessThan(
      purchasability.indexOf("plusPkg"),
    );
    const money = src.slice(src.indexOf("function beginPurchase"), src.indexOf("const adsConsent"));
    expect(money).toMatch(
      /if \(cadence !== "monthly"\) \{\s*setError\(t\("ds\.plans\.purchaseError"\)\);\s*return;/,
    );
    expect(money.indexOf('cadence !== "monthly"')).toBeLessThan(money.indexOf("void buy(plusPkg)"));
    expect(src).not.toMatch(/packages\[0\]/);
  });

  test("card prices use the pricing SoT", () => {
    expect(src).toMatch(/TIER_PRICE_KRW_YEARLY\[key\]/);
    expect(src).toMatch(/TIER_PRICE_KRW\[key\]/);
    expect(src).not.toMatch(/99[,_]?000/);
    expect(src).not.toMatch(/199[,_]?000/);
    expect(TIER_PRICE_KRW_YEARLY.plus).toBe(TIER_PRICING.cortex.krwYearly);
    expect(TIER_PRICE_KRW_YEARLY.pro).toBe(TIER_PRICING.brain.krwYearly);
    expect(TIER_PRICE_KRW_YEARLY.plus).toBe(TIER_PRICE_KRW.plus * 10);
    expect(TIER_PRICE_KRW_YEARLY.pro).toBe(TIER_PRICE_KRW.pro * 10);
  });
});

describe("explicit money, restore, reward, and legal paths", () => {
  test("the first tier tap opens terms and only the consented confirm reaches money", () => {
    const firstTap = src.slice(
      src.indexOf("function onStart("),
      src.indexOf("function beginPurchase("),
    );
    expect(firstTap).toContain("setPendingTier(key);");
    expect(firstTap).not.toContain("purchasePackage(");
    expect(firstTap).not.toContain("openPaddleCheckout(");
    expect(src).toMatch(
      /label=\{t\("ds\.plans\.terms\.cta"\)\}[\s\S]{0,160}?disabled=\{!termsOk\}/,
    );
    expect(src.match(/beginPurchase\(/g)).toHaveLength(2);
    expect(src).toMatch(/setPendingTier\(null\);\s*if \(key\) beginPurchase\(key\);/);
    expect(src).toContain("createOwnerActionGate()");
  });

  test("restore and reward credit each exist only behind their explicit CTA/callback", () => {
    expect(src.match(/restorePurchases\(/g)).toHaveLength(1);
    expect(src).toContain("onPress={() => void restore()}");
    expect(src.match(/addRewardCredits\(/g)).toHaveLength(1);
    const earned = src.slice(
      src.indexOf("async function onRewardEarned"),
      src.indexOf("if (authLoading)"),
    );
    expect(earned).toContain("await addRewardCredits(owner, credits);");
    expect(src).toContain("onEarned={onRewardEarned}");
  });

  test("rewarded entry requires capability, policy, consent, and a ready usage read", () => {
    expect(src).toContain("canCompleteRewardedWatch()");
    expect(src).toContain("canShowRewardedAds({");
    expect(src).toContain('ownedPrefs.status === "ready"');
    expect(src).toContain("adsConsent === true");
    expect(src).toContain("rewardCapAllowsWatch(ownedUsage.rewardEarned, REWARD_MONTHLY_CAP)");
    const allowed = src.slice(
      src.indexOf("const rewardedAllowed"),
      src.indexOf("const freeRemaining"),
    );
    expect(allowed).toContain("rewardCapOpen");
  });

  test("at the monthly cap the screen shows honest copy and exposes no watch/open/grant path", () => {
    expect(src).toContain('t("ds.reasoningLimit.rewardCapReached", { cap: REWARD_MONTHLY_CAP })');
    const earned = src.slice(
      src.indexOf("async function onRewardEarned"),
      src.indexOf("if (authLoading)"),
    );
    expect(earned.indexOf("!rewardedAllowed")).toBeLessThan(earned.indexOf("addRewardCredits("));
    const capped = src.slice(
      src.indexOf("rewardCapReached ? ("),
      src.indexOf(") : rewardedAllowed ? ("),
    );
    expect(capped).not.toContain("setRewardVisible(true)");
    expect(capped).not.toContain("addRewardCredits(");
  });

  test("real terms, refund, and support routes remain reachable", () => {
    expect(src).toContain('router.push("/terms")');
    expect(src).toContain('router.push("/refund")');
    expect(src).toContain('router.push("/support")');
  });
});

describe("PIXEL-CLAY renderer and legacy boundary", () => {
  test("the deep-space renderer uses Pixel primitives, square state, and 44dp actions", () => {
    for (const primitive of ["PixelSurface", "PixelPressable", "PixelGlyph", "PixelScrim"]) {
      expect(src).toContain(primitive);
    }
    expect(src).not.toContain('from "@/components/m3"');
    expect(src).not.toMatch(/<Md(?:Button|Card)|<SegBtn|<PremiumModal/);
    expect(src).toContain("minHeight: m3.minTouch");
    expect(src).not.toMatch(/opacity:\s*(?:0?\.\d+)/);
    expect(src).not.toMatch(/borderRadius:\s*(?!m3\.shape\.none|0)/);
  });

  test("tier headers reflow vertically and legal/terms actions can wrap at 320dp", () => {
    expect(src).toContain("tierTop: { gap: m3.spacing.s1 }");
    expect(src).toMatch(/legalLinks: \{ flexDirection: "row", flexWrap: "wrap"/);
    expect(src).toMatch(/termsActions: \{ marginTop: m3\.spacing\.s6, gap:/);
    expect(src).toContain('modalScroll: { maxHeight: "90%" }');
  });

  test("PlansLegacy and its existing style boundary remain in app/plans.tsx", () => {
    expect(app).toContain("function PlansLegacy()");
    expect(app).toContain("const styles = StyleSheet.create({");
    expect(app).toContain("if (isDeepSpaceUI()) return <DeepSpacePlansScreen />;");
    expect(app).not.toContain("PixelSurface");
  });
});

describe("price disclosure follows the selected period", () => {
  test("the screen swaps monthly and yearly disclosure and terms", () => {
    expect(src).toMatch(
      /cadence === "yearly" \? t\("ds\.plans\.disclosureYearly"\) : t\("ds\.plans\.disclosure"\)/,
    );
    expect(src).toMatch(
      /cadence === "yearly" \? t\("ds\.plans\.terms\.cycleYearly"\) : t\("ds\.plans\.terms\.cycleMonthly"\)/,
    );
  });

  test.each(LOCALES)("%s carries every cadence key", (locale) => {
    const p = plansOf(locale);
    for (const key of [
      "perYear",
      "cadenceMonthly",
      "cadenceYearly",
      "cadenceSaving",
      "disclosureYearly",
    ]) {
      expect(typeof p[key]).toBe("string");
      expect(p[key].length).toBeGreaterThan(0);
    }
  });

  test("reviewed yearly disclosures state the right renewal and refund window", () => {
    const ko = plansOf("ko");
    expect(ko.disclosureYearly).toContain("연 단위로 자동 갱신");
    expect(ko.disclosureYearly).not.toContain("월 단위로 자동 갱신");
    const en = plansOf("en");
    expect(en.disclosureYearly).toContain("each year");
    expect(en.disclosureYearly).not.toContain("each month");
    for (const locale of LOCALES) {
      expect(plansOf(locale).disclosureYearly).toMatch(/7/);
      expect(plansOf(locale).disclosureYearly.length).toBeGreaterThan(80);
    }
  });
});
