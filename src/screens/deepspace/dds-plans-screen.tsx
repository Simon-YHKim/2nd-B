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
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";

import { m3 } from "@/lib/theme/m3";
import { TIER_PRICE_KRW, REWARD_PER_WATCH } from "@/lib/entitlements/tiers";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage, addRewardCredits } from "@/lib/entitlements/usage";
import { adsConfigured } from "@/lib/ads/policy";
import { Text } from "@/components/ui/Text";
import { MdButton, MdCard } from "@/components/m3";
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

  const { userId } = useAuth();
  const { tier: currentTier } = useProgression();
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);

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
    if (outcome.status === "purchased") setIsPro(outcome.isPro);
    else if (outcome.status === "error" || outcome.status === "unavailable")
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
      if (!outcome.isPro) setError(t("ds.plans.restoredNone"));
    } else {
      setError(t("ds.plans.restoreError"));
    }
    setBusyAction(null);
  }

  // Which tier the user is currently on (RevenueCat isPro promotes a free row).
  const onNorthStar = currentTier === "brain";
  const onVoyager = !onNorthStar && (currentTier === "cortex" || currentTier === "soma" || isPro);
  const onStargazer = !onNorthStar && !onVoyager;
  const isCurrent: Record<TierKey, boolean> = { free: onStargazer, plus: onVoyager, pro: onNorthStar };

  // Store not reachable OR no Offering configured yet: honest notice, never a
  // dead checkout. Kept below the cards so it never disturbs the tier layout.
  const showStoreNotice = !available || (!loading && packages.length === 0);

  // ── Tier copy (reference PlansScreen tiers[]). Prices from TIER_PRICE_KRW so
  // display can never drift from the entitlement SoT. ──
  const per = t("ds.plans.per");
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
      price: `${krw(TIER_PRICE_KRW.plus)}${per}`,
      feats: [t("ds.plans.plusFeat1"), t("ds.plans.plusFeat2"), t("ds.plans.plusFeat3"), t("ds.plans.plusFeat4")],
    },
    {
      key: "pro",
      name: t("ds.plans.proName"),
      sub: t("ds.plans.proSub"),
      price: `${krw(TIER_PRICE_KRW.pro)}${per}`,
      feats: [t("ds.plans.proFeat1"), t("ds.plans.proFeat2"), t("ds.plans.proFeat3"), t("ds.plans.proFeat4")],
    },
  ];

  function onStart(key: TierKey) {
    if (busy) return;
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
                variant={cur ? "tonal" : "filled"}
                style={s.tierBtn}
                disabled={busy}
                label={
                  cur
                    ? t("ds.plans.currentPlan")
                    : busyAction === "buy"
                      ? t("ds.plans.purchasing")
                      : t("ds.plans.startTier", { name: tr.name })
                }
                onPress={cur ? undefined : () => onStart(tr.key)}
              />
            </MdCard>
          );
        })}
      </View>

      {loading ? (
        <View style={s.loadingRow}>
          <ActivityIndicator color={m3.color.primary} />
          <Text style={s.dim}>{t("ds.plans.loading")}</Text>
        </View>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}

      {/* free top-up via opt-in rewarded ad (COUNTS only, never quality).
          Guarded by adsConfigured(): with ads OFF (the shipping default) there
          is no ad to watch, so showing "watch an ad for +N" is a lever that
          can never pay out — hide it entirely rather than fake a completion. */}
      {adsConfigured() ? (
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
              <Text style={s.rewardSub}>{t("ds.plans.rewardSub", { n: REWARD_PER_WATCH })}</Text>
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
        visible={rewardVisible}
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
  notice: { padding: m3.spacing.s4, gap: m3.spacing.s2, borderColor: m3.color.outlineVariant, borderWidth: 1 },
  noticeTitle: { fontSize: m3.type.titleSmall.size, fontWeight: "600", color: m3.color.onSurface },
  noticeBody: { fontSize: m3.type.bodySmall.size, lineHeight: 18, color: m3.color.onSurfaceVariant },
  supportLink: { fontSize: m3.type.bodySmall.size, color: m3.color.primary, marginTop: m3.spacing.s1 },
  restore: { fontSize: m3.type.bodySmall.size, color: m3.color.onSurfaceVariant, textAlign: "center", paddingVertical: 11 },
});
