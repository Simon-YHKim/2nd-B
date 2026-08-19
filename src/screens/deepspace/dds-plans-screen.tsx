// Paywall (① 페이월) - rev2 M3 clone of the reference PlansScreen
// (sb-screens-extra.jsx). Structure matches the reference verbatim: an
// in-body 요금제 headline, a tertiary-container honesty card, three journey
// tier cards (별바라기 / 항해자 / 북극성) each carrying its OWN full-width M3
// button, then the "결제 없이 늘리기" reward-ad row. Tiers are NEVER labelled
// Free/Plus/Pro in the UI.
//
// Wiring preserved exactly: RevenueCat (getOfferings / purchasePackage /
// getProStatus / restorePurchases) drives the CTAs; the entitlement engine
// (src/lib/entitlements/tiers.ts → TIER_PRICE_KRW) is the price SoT so on-card
// copy can never drift from what is actually granted. Per that file's HARD
// invariant, money buys MORE/LONGER memory + MORE features - never a better
// answer; this surface must never imply a pricier tier reasons better.
// revenue_events logging stays server-side via a RevenueCat webhook (C4 schema
// untouched). The rewarded row tops up COUNTS only, never quality.
// ──────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";

import { m3 } from "@/lib/theme/m3";
import {
  TIER_PRICE_KRW,
  TIER_PRICE_KRW_YEARLY,
  REWARD_PER_WATCH,
  REWARD_MONTHLY_CAP,
} from "@/lib/entitlements/tiers";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage, addRewardCredits } from "@/lib/entitlements/usage";
import { canShowRewardedAds } from "@/lib/ads/policy";
import {
  openPaddleCheckout,
  paddleCheckoutAvailable,
  type CheckoutCadence,
} from "@/lib/billing/paddle-checkout";
import { canCompleteRewardedWatch } from "@/lib/ads/rewarded";
import { fetchPrivacyPrefs } from "@/lib/supabase/privacy";
import { Text } from "@/components/ui/Text";
import { MdButton, MdCard, SegBtn } from "@/components/m3";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { RewardedSheet } from "@/components/deepspace/RewardedSheet";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import {
  arePurchasesAvailable,
  configurePurchases,
  getOfferings,
  getProStatus,
  purchasePackage,
  restorePurchases,
} from "@/lib/payments/purchases";
import type { PurchasesPackage } from "react-native-purchases";

function DockShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title ?? ""} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

// Phase 4 launch scope = Free + Plus; Pro ships later. The card stays visible
// (price anchor + roadmap signal, Simon 확정 2026-07-17) with a "준비 중" pill and
// no live purchase CTA.
//
// Module scope, not component scope: canPurchase() reads it while computing
// showStoreNotice, which runs earlier in the render body than the old in-component
// `const` did. A `const` cannot be read before its declaration is evaluated, so
// leaving it below would have thrown a ReferenceError on every render of this
// screen rather than merely being untidy.
const PRO_COMING_SOON = true;

// Format a KRW integer as ₩6,900 without a hardcoded currency literal in copy.
function krw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z"
        fill={color}
      />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M4.5 12.5l4.5 4.5 10.5-11" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function BoltIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10.5H13z" fill={color} />
    </Svg>
  );
}

function ChevronRight({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

type TierKey = "free" | "plus" | "pro";
interface TierCopy {
  key: TierKey;
  name: string;
  sub: string;
  price: string;
  feats: string[];
}

export function DeepSpacePlansScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language === "ko";

  const { userId, isMinor } = useAuth();
  const { tier: currentTier, loading: tierLoading, refresh: refreshTier } = useProgression();
  const pathname = usePathname();
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);
  // users.privacy_prefs.ads - null until resolved; the rewarded gate fails closed.
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);

  // Real native IAP scaffold (unchanged): RevenueCat routes the Offering to
  // Google Play Billing (Android) / Apple IAP (iOS). On web / no key / no
  // Offering, packages is empty so we show an honest notice instead of a dead
  // button. No charge until store products are configured.
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isPro, setIsPro] = useState(false);
  const [busyAction, setBusyAction] = useState<"buy" | "restore" | null>(null);
  const busy = busyAction !== null;
  const [error, setError] = useState<string | null>(null);
  const available = arePurchasesAvailable();
  const [rewardVisible, setRewardVisible] = useState(false);

  // Billing period. paddle-checkout has resolved a distinct price id per tier
  // AND cadence since it was written (EXPO_PUBLIC_PADDLE_PRICE_<TIER>_YEARLY),
  // and web-deploy already injects both, but this screen was the only consumer
  // and never passed one - so `input.cadence ?? "monthly"` always won and the
  // yearly price id could not be reached from anywhere in the app.
  const [cadence, setCadence] = useState<CheckoutCadence>("monthly");

  // The control appears ONLY when a yearly price id is actually configured for
  // a sellable tier. An annual segment that resolves to "" would produce exactly
  // the dead priced control this file already argues against, and pro is behind
  // PRO_COMING_SOON so its price id cannot make the segment live on its own.
  // With no yearly id set, this screen renders exactly as it did before.
  const yearlyOffered =
    paddleCheckoutAvailable("cortex", "yearly") ||
    (!PRO_COMING_SOON && paddleCheckoutAvailable("brain", "yearly"));

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchPrivacyPrefs(userId)
      .then((prefs) => {
        if (!cancelled) setAdsConsent(prefs.ads === true);
      })
      .catch(() => {
        if (!cancelled) setAdsConsent(false); // fetch failure = no rewarded entry
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Rewarded entry eligibility (policy rules 1-5; every null fails closed).
  // Capability first (Simon B-decision): no CTA when this build cannot
  // complete a watch.
  const rewardedAllowed =
    canCompleteRewardedWatch() &&
    canShowRewardedAds({
      tier: tierLoading ? null : currentTier,
      isMinor,
      adsConsent,
      route: pathname ?? "/",
    });

  useEffect(() => {
    let alive = true;
    (async () => {
      configurePurchases();
      if (!arePurchasesAvailable()) {
        if (alive) setLoading(false);
        return;
      }
      try {
        const [pkgs, pro] = await Promise.all([getOfferings(), getProStatus()]);
        if (!alive) return;
        setPackages(pkgs);
        setIsPro(pro);
      } catch {
        if (alive) setError(t("ds.plans.loadError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ko]);

  // This month's remaining free deep-asks - powers the rewarded sheet's
  // "remaining" prop. Only loaded on the free tier; fails open to null.
  useEffect(() => {
    if (!userId || currentTier !== "free") {
      setFreeRemaining(null);
      return;
    }
    let alive = true;
    (async () => {
      const usage = await getReasoningUsage(userId);
      if (!alive) return;
      setFreeRemaining(remainingReasoning("free", usage.used, usage.rewardCredits));
    })();
    return () => {
      alive = false;
    };
  }, [userId, currentTier]);

  // Package resolution (unchanged heuristics): map the current Offering onto
  // the 항해자 / 북극성 CTAs.
  const plusPkg = useMemo(() => {
    if (packages.length === 0) return undefined;
    const hint = packages.find((p) => {
      const id = `${p.identifier} ${p.product.identifier}`.toLowerCase();
      return id.includes("plus") || id.includes("voyager") || id.includes("monthly") || id.includes("month");
    });
    return hint ?? packages[0];
  }, [packages]);
  const proPkg = useMemo(() => {
    if (packages.length === 0) return undefined;
    const hint = packages.find((p) => {
      const id = `${p.identifier} ${p.product.identifier}`.toLowerCase();
      return id.includes("pro") || id.includes("northstar") || id.includes("north") || id.includes("year") || id.includes("annual");
    });
    return hint && hint !== plusPkg ? hint : undefined;
  }, [packages, plusPkg]);

  async function buy(pkg: PurchasesPackage) {
    if (busy) return;
    setBusyAction("buy");
    setError(null);
    const outcome = await purchasePackage(pkg);
    if (outcome.status === "purchased") {
      setIsPro(outcome.isPro);
      // R3 reconciliation: local isPro is optimistic display only -- the DB tier
      // (users.subscription_tier) is the entitlement authority the whole app gates
      // on, and it moves ONLY via the store->revenue_events webhook
      // (TODO(IAP-webhook) in src/lib/payments/purchases.ts, an owner action
      // before enabling RevenueCat keys). Re-read it so that once the webhook is
      // live the tier (and every gate) reconciles without a manual reload.
      void refreshTier();
    } else if (outcome.status === "error" || outcome.status === "unavailable")
      setError(t("ds.plans.purchaseError"));
    setBusyAction(null);
  }

  async function restore() {
    if (busy) return;
    setBusyAction("restore");
    setError(null);
    const outcome = await restorePurchases();
    if (outcome.status === "restored") {
      setIsPro(outcome.isPro);
      void refreshTier(); // R3: reconcile the DB tier (the gating authority) too
      if (!outcome.isPro) setError(t("ds.plans.restoredNone"));
    } else {
      setError(t("ds.plans.restoreError"));
    }
    setBusyAction(null);
  }

  // Which tier the user is currently on. `currentTier` (DB users.subscription_tier)
  // is the authority every OTHER gate in the app uses; RevenueCat `isPro` here is an
  // OPTIMISTIC plans-screen-only promotion for the just-purchased moment before the
  // store->revenue_events webhook reconciles the DB (owner action -- see buy()).
  // isPro must never leak into real feature gating: payment-tier-authority.test.ts
  // pins that useProgression/entitlements read the DB tier only, so this optimistic
  // display can never become a "shows pro / features locked" contradiction elsewhere.
  const onNorthStar = currentTier === "brain";
  const onVoyager = !onNorthStar && (currentTier === "cortex" || currentTier === "soma" || isPro);
  const onStargazer = !onNorthStar && !onVoyager;
  const isCurrent: Record<TierKey, boolean> = { free: onStargazer, plus: onVoyager, pro: onNorthStar };

  // Can this tier actually be bought RIGHT NOW, on THIS surface?
  //
  // There are two rails and they are mutually exclusive per platform: Paddle is
  // web-only (paddleCheckoutAvailable returns false off-web and when the price
  // ids are unset) and RevenueCat is native-only (purchasesAvailable stays false
  // on web and without a platform key). Before this existed the CTA was enabled
  // whenever the tier was not the current one, so on every surface where NEITHER
  // rail was live the button was a priced, live-looking control that failed
  // 100% of the time with ds.plans.purchaseError - and failed again on retry,
  // because nothing about the state it complains about is retryable. That is a
  // dead-end purchase flow (App Review 2.1) and, more to the point, a lie to the
  // user. A control that cannot succeed must not look like one that can.
  function canPurchase(key: TierKey): boolean {
    if (key === "free") return false; // nothing to buy; the CTA is a label
    if (key === "pro" && PRO_COMING_SOON) return false;
    const paddleTier = key === "plus" ? "cortex" : "brain";
    if (paddleCheckoutAvailable(paddleTier, cadence)) return true;
    // The RevenueCat Offering this screen reads is monthly. Letting it answer
    // for the yearly segment would show a yearly price on a control that
    // charges a monthly package - a worse failure than the dead CTA, because
    // it succeeds at the wrong thing.
    if (cadence !== "monthly") return false;
    return (key === "plus" ? plusPkg : proPkg) != null;
  }

  // No rail is live for any sellable tier: say so once, plainly, instead of
  // letting each card imply a checkout that is not there.
  //
  // The old condition keyed off RevenueCat alone (`!available || ...`), which
  // made this notice ALWAYS show on web - including when Paddle checkout was
  // configured and working - while its copy told the reader to go buy in the
  // phone app. That advice was false in both directions: web is the only
  // surface that can currently take money, and the native build has no live
  // store keys at all, so it sent paying users to a dead end.
  const showStoreNotice = !loading && !canPurchase("plus") && !canPurchase("pro");

  // ── Tier copy (reference PlansScreen tiers[]). Prices from TIER_PRICE_KRW so
  // display can never drift from the entitlement SoT. ──
  const per = t("ds.plans.per");
  const perYear = t("ds.plans.perYear");
  // Both figures come from the same SoT (pricing.ts via tiers.ts), so the card
  // cannot show a yearly number Paddle is not charging.
  const priceFor = (key: "plus" | "pro"): string =>
    cadence === "yearly"
      ? `${krw(TIER_PRICE_KRW_YEARLY[key])}${perYear}`
      : `${krw(TIER_PRICE_KRW[key])}${per}`;
  const tiers: TierCopy[] = [
    {
      key: "free",
      name: t("ds.plans.freeName"),
      sub: t("ds.plans.freeSub"),
      price: t("ds.plans.freePrice"),
      feats: [t("ds.plans.freeFeat1"), t("ds.plans.freeFeat2"), t("ds.plans.freeFeat3")],
    },
    {
      key: "plus",
      name: t("ds.plans.plusName"),
      sub: t("ds.plans.plusSub"),
      price: priceFor("plus"),
      feats: [t("ds.plans.plusFeat1"), t("ds.plans.plusFeat2"), t("ds.plans.plusFeat3")],
    },
    {
      key: "pro",
      name: t("ds.plans.proName"),
      sub: t("ds.plans.proSub"),
      price: priceFor("pro"),
      feats: [t("ds.plans.proFeat1"), t("ds.plans.proFeat2"), t("ds.plans.proFeat3")],
    },
  ];

  function onStart(key: TierKey) {
    if (busy) return;
    if (key === "pro" && PRO_COMING_SOON) return; // 준비 중 — not purchasable at launch

    // RevenueCat is native-only, so before this the web export - which is the
    // live surface (GitHub Pages) - had no way to take money at all. Paddle is
    // the Merchant-of-Record path there; native keeps RevenueCat untouched.
    // paddleCheckoutAvailable() is false off-web and when unconfigured, so this
    // branch simply does not exist until the price ids are set.
    const paddleTier = key === "plus" ? "cortex" : key === "pro" ? "brain" : null;
    if (paddleTier && paddleCheckoutAvailable(paddleTier, cadence)) {
      setBusyAction("buy");
      setError(null);
      void openPaddleCheckout({ tier: paddleTier, cadence, locale: ko ? "ko" : "en" })
        .then((r) => {
          // The tier itself is granted server-side by paddle-webhook, never
          // here - the client never writes entitlement.
          if (!r.ok) setError(t("ds.plans.purchaseError"));
        })
        .finally(() => setBusyAction(null));
      return;
    }

    // Native rail. canPurchase() already refuses the yearly segment here, and
    // this repeats the refusal at the money path rather than trusting a caller:
    // the RevenueCat package is monthly, so buying it under a yearly price would
    // charge the wrong amount silently.
    if (cadence !== "monthly") {
      setError(t("ds.plans.purchaseError"));
      return;
    }
    if (key === "plus" && plusPkg) void buy(plusPkg);
    else if (key === "pro" && proPkg) void buy(proPkg);
    else if (key !== "free") setError(t("ds.plans.purchaseError"));
    // free → nothing to buy (reference no-op).
  }

  return (
    <DockShell title={t("ds.plans.title")}>
      <Text style={s.headline}>{t("ds.plans.title")}</Text>

      {/* honesty note (tertiary-container) */}
      <MdCard variant="filled" style={s.honesty}>
        <View style={s.honestyRow}>
          <LockIcon color={m3.color.onTertiaryContainer} />
          <Text style={s.honestyText}>
            {t("ds.plans.honestyLead")}
            <Text style={s.honestyStrong}>{t("ds.plans.honestyStrong")}</Text>
            {t("ds.plans.honestyTail")}
          </Text>
        </View>
      </MdCard>

      {/* 민법 제5조 고지. Simon 결정 2026-08-16 (G1): disclose, do not block —
          a minor's purchase is cancellable whether or not we say so, so a gate
          would remove their access without removing our exposure. Placed above
          the tier cards so it is read BEFORE the contract, which is what
          "계약 체결 전 고지" means. isMinor === true only: null (unknown age)
          must not accuse an adult of being a minor. */}
      {isMinor === true ? (
        <MdCard variant="outlined" style={s.minorNotice}>
          <Text style={s.minorNoticeText}>{t("ds.plans.minorPurchaseNotice")}</Text>
        </MdCard>
      ) : null}

      {/* Billing period. Rendered only when a yearly price id exists, so the
          segment can never be a control that resolves to no price. The saving
          line states the same fact pricing.ts encodes (yearly = 10x monthly)
          instead of a percentage nobody can check. */}
      {yearlyOffered ? (
        <View style={s.cadence}>
          <SegBtn
            segments={[
              { key: "monthly", label: t("ds.plans.cadenceMonthly") },
              { key: "yearly", label: t("ds.plans.cadenceYearly") },
            ]}
            selected={[cadence]}
            onSelect={(k) => setCadence(k === "yearly" ? "yearly" : "monthly")}
          />
          <Text style={s.cadenceNote}>{t("ds.plans.cadenceSaving")}</Text>
        </View>
      ) : null}

      {/* tier cards */}
      <View style={s.tierList}>
        {tiers.map((tr) => {
          const cur = isCurrent[tr.key];
          return (
            <MdCard key={tr.key} variant={cur ? "elevated" : "outlined"} style={[s.tierCard, cur && s.tierCardCurrent]}>
              <View style={s.tierHead}>
                <View style={s.tierNameRow}>
                  <Text style={s.tierName}>{tr.name}</Text>
                  {cur ? (
                    <View style={s.currentPill}>
                      <Text style={s.currentPillText}>{t("ds.plans.active")}</Text>
                    </View>
                  ) : tr.key === "pro" && PRO_COMING_SOON ? (
                    <View style={s.currentPill}>
                      <Text style={s.currentPillText}>{t("ds.plans.comingSoon")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.tierPrice}>{tr.price}</Text>
              </View>
              <Text style={s.tierSub}>{tr.sub}</Text>
              <View style={s.featList}>
                {tr.feats.map((f) => (
                  <View key={f} style={s.featRow}>
                    <CheckIcon color={m3.color.primary} />
                    <Text style={s.featText}>{f}</Text>
                  </View>
                ))}
              </View>
              <MdButton
                variant={cur || !canPurchase(tr.key) ? "tonal" : "filled"}
                style={s.tierBtn}
                disabled={busy || cur || !canPurchase(tr.key)}
                label={
                  cur
                    ? t("ds.plans.currentPlan")
                    : tr.key === "free"
                      ? t("ds.plans.included")
                      : !canPurchase(tr.key)
                        ? t("ds.plans.comingSoon")
                        : busyAction === "buy"
                          ? t("ds.plans.purchasing")
                          : t("ds.plans.startTier", { name: tr.name })
                }
                // med#16: free is not purchasable — for paid users this button
                // was live but did nothing (reference no-op). It is a fact row
                // ("기본 포함"), not an action. Pro at launch is the same kind of
                // fact row ("준비 중") until the tier ships.
                //
                // canPurchase() now decides the same way for EVERY tier, so a
                // tier with no live rail on this surface reads as "준비 중" rather
                // than offering a purchase it cannot perform. Before this, `plus`
                // was always live and always failed off-web.
                onPress={cur || !canPurchase(tr.key) ? undefined : () => onStart(tr.key)}
              />
            </MdCard>
          );
        })}
      </View>

      {/* U6 price disclosure: auto-renewal cadence, VAT-included pricing, and
          the 30-day refund window must be stated AT the price surface (Korean
          e-commerce law + Paddle MoR checkout rules), with the documents that
          back them one tap away -- not buried behind /support. */}
      <View style={s.disclosure}>
        <Text style={s.disclosureText}>
          {cadence === "yearly" ? t("ds.plans.disclosureYearly") : t("ds.plans.disclosure")}
        </Text>
        <View style={s.legalLinks}>
          <Pressable onPress={() => router.push("/terms")} accessibilityRole="link" hitSlop={8} accessibilityLabel={t("ds.plans.legalTerms")}>
            <Text style={s.legalLink}>{t("ds.plans.legalTerms")}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/refund")} accessibilityRole="link" hitSlop={8} accessibilityLabel={t("ds.plans.legalRefund")}>
            <Text style={s.legalLink}>{t("ds.plans.legalRefund")}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={s.loadingRow}>
          <ActivityIndicator color={m3.color.primary} />
          <Text style={s.dim}>{t("ds.plans.loading")}</Text>
        </View>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}

      {/* free top-up via opt-in rewarded ad (COUNTS only, never quality).
          Entry requires the FULL rewarded gate (canShowRewardedAds): build
          flag + free tier + confirmed non-minor + explicit ads consent +
          rewarded route allow-list. With any of those missing there is no ad
          that can pay out — hide the lever entirely rather than fake it. */}
      {rewardedAllowed ? (
        <>
          <Text style={s.sectionLabel}>{t("ds.plans.growWithoutPaying")}</Text>
          <Pressable
            style={s.rewardRow}
            onPress={() => setRewardVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t("ds.plans.rewardTitle")}
          >
            <BoltIcon color={m3.color.tertiary} />
            <View style={s.rewardText}>
              <Text style={s.rewardTitle}>{t("ds.plans.rewardTitle")}</Text>
              <Text style={s.rewardSub}>
                {t("ds.plans.rewardSub", { n: REWARD_PER_WATCH, cap: REWARD_MONTHLY_CAP })}
              </Text>
            </View>
            <ChevronRight color={m3.color.onSurfaceVariant} />
          </Pressable>
        </>
      ) : null}

      {showStoreNotice ? (
        <MdCard variant="outlined" style={s.notice}>
          <Text style={s.noticeTitle}>{t("ds.plans.noticeTitle")}</Text>
          <Text style={s.noticeBody}>
            {t("ds.plans.noticeBody")}
          </Text>
          <Pressable onPress={() => router.push("/support")} accessibilityRole="button" hitSlop={12} accessibilityLabel={t("ds.plans.contactSupport")}>
            <Text style={s.supportLink}>{t("ds.plans.contactSupport")}</Text>
          </Pressable>
        </MdCard>
      ) : null}

      {available ? (
        <Pressable onPress={() => void restore()} disabled={busy} accessibilityRole="button" accessibilityLabel={t("ds.plans.restore")} style={busy ? s.dimPress : undefined}>
          <Text style={s.restore}>{busyAction === "restore" ? t("ds.plans.restoring") : t("ds.plans.restore")}</Text>
        </Pressable>
      ) : null}

      <RewardedSheet
        visible={rewardVisible && rewardedAllowed}
        onClose={() => setRewardVisible(false)}
        remaining={freeRemaining ?? 0}
        onEarned={async (credits) => {
          if (userId) {
            try {
              await addRewardCredits(userId, credits);
            } catch (e) {
              if (typeof console !== "undefined") console.warn("[plans] addRewardCredits failed", (e as Error).message);
            }
          }
          if (userId && currentTier === "free") {
            const usage = await getReasoningUsage(userId);
            setFreeRemaining(remainingReasoning("free", usage.used, usage.rewardCredits));
          }
          setRewardVisible(false);
        }}
        locale={ko ? "ko" : "en"}
      />
    </DockShell>
  );
}

const s = StyleSheet.create({
  scroll: { padding: m3.spacing.s4, paddingBottom: 40, gap: m3.spacing.s3 },
  headline: { fontSize: m3.type.headlineSmall.size, lineHeight: m3.type.headlineSmall.line, fontWeight: "500", color: m3.color.onSurface, marginTop: m3.spacing.s2, marginBottom: m3.spacing.s1 },
  honesty: { backgroundColor: m3.color.tertiaryContainer, padding: 14 },
  honestyRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  honestyText: { flex: 1, fontSize: m3.type.bodySmall.size, lineHeight: 18, color: m3.color.onTertiaryContainer },
  honestyStrong: { fontWeight: "700", color: m3.color.onTertiaryContainer },
  minorNotice: { padding: 14, borderWidth: 1, borderColor: m3.color.outline },
  cadence: { gap: m3.spacing.s2 },
  cadenceNote: { fontSize: m3.type.bodySmall.size, lineHeight: 18, color: m3.color.onSurfaceVariant, textAlign: "center" },
  minorNoticeText: { fontSize: m3.type.bodySmall.size, lineHeight: 18, color: m3.color.onSurfaceVariant },
  tierList: { gap: m3.spacing.s3 },
  tierCard: { padding: m3.spacing.s4, gap: 6, borderWidth: 1, borderColor: m3.color.outlineVariant, backgroundColor: m3.color.surfaceContainerLow },
  tierCardCurrent: { borderWidth: 2, borderColor: m3.color.primary, backgroundColor: m3.color.surfaceContainer },
  tierHead: { flexDirection: "row", alignItems: "baseline", gap: m3.spacing.s2 },
  tierNameRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  tierName: { fontSize: m3.type.titleLarge.size, lineHeight: m3.type.titleLarge.line, fontWeight: "500", color: m3.color.onSurface },
  currentPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: m3.color.primary },
  currentPillText: { fontSize: 11, fontWeight: "700", color: m3.color.onPrimary },
  tierPrice: { fontSize: m3.type.titleMedium.size, lineHeight: m3.type.titleMedium.line, fontWeight: "500", color: m3.color.primary },
  tierSub: { fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, color: m3.color.onSurfaceVariant, marginTop: 2 },
  featList: { gap: 6, marginVertical: m3.spacing.s3 },
  featRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  featText: { flex: 1, fontSize: m3.type.bodyMedium.size, lineHeight: m3.type.bodyMedium.line, color: m3.color.onSurface },
  tierBtn: { alignSelf: "stretch" },
  loadingRow: { alignItems: "center", gap: m3.spacing.s2, paddingVertical: m3.spacing.s4 },
  dim: { fontSize: m3.type.bodySmall.size, color: m3.color.onSurfaceVariant },
  dimPress: { opacity: 0.5 },
  error: { fontSize: m3.type.bodySmall.size, color: m3.color.error, textAlign: "center" },
  sectionLabel: { marginTop: m3.spacing.s3, fontSize: 12, fontWeight: "600", letterSpacing: 0.6, color: m3.color.onSurfaceVariant },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: 14,
    borderRadius: m3.shape.large,
    backgroundColor: m3.color.surfaceContainer,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
  },
  rewardText: { flex: 1 },
  rewardTitle: { fontSize: m3.type.titleSmall.size, lineHeight: m3.type.titleSmall.line, fontWeight: "600", color: m3.color.onSurface },
  rewardSub: { fontSize: m3.type.labelSmall.size, lineHeight: m3.type.labelSmall.line, color: m3.color.onSurfaceVariant, marginTop: 2 },
  disclosure: { marginTop: m3.spacing.s2, gap: m3.spacing.s2 },
  disclosureText: { fontSize: m3.type.bodySmall.size, lineHeight: 18, color: m3.color.onSurfaceVariant },
  legalLinks: { flexDirection: "row", gap: m3.spacing.s4 },
  legalLink: { fontSize: m3.type.bodySmall.size, color: m3.color.primary },
  notice: { padding: m3.spacing.s4, gap: m3.spacing.s2, borderColor: m3.color.outlineVariant, borderWidth: 1 },
  noticeTitle: { fontSize: m3.type.titleSmall.size, fontWeight: "600", color: m3.color.onSurface },
  noticeBody: { fontSize: m3.type.bodySmall.size, lineHeight: 18, color: m3.color.onSurfaceVariant },
  supportLink: { fontSize: m3.type.bodySmall.size, color: m3.color.primary, marginTop: m3.spacing.s1 },
  restore: { fontSize: m3.type.bodySmall.size, color: m3.color.onSurfaceVariant, textAlign: "center", paddingVertical: 11 },
});
