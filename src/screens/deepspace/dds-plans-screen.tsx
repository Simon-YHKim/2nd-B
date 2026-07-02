import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path } from "react-native-svg";

import { ddsStyles as styles } from "./dds-styles";
import { deepSpace } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { TIERS, TIER_PRICE_KRW } from "@/lib/entitlements/tiers";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage } from "@/lib/entitlements/usage";
import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
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

function DockShell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title ?? ""} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

// Paywall (① 페이월) - re-skinned to the deep-space design canon. Three
// journey-stage tiers (별바라기 / 항해자 / 북극성) NEVER labelled Free/Plus/Pro
// in the UI. Counts + feature gates are pulled from the single source of truth
// (src/lib/entitlements/tiers.ts) so the human phrasing below can never drift
// from what the entitlement engine actually grants. Per that file's HARD
// invariant, money buys MORE/LONGER memory + MORE features - never a better
// answer; this surface must never imply a pricier tier reasons better.
// RevenueCat wiring (getOfferings/purchasePackage/getProStatus/restore) is
// preserved exactly; only the visuals change.
// ──────────────────────────────────────────────────────────────────────────

// Format a KRW integer as ₩6,900 without a hardcoded currency literal in copy.
function krw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

// Outline-circle bullet (별바라기 tier) - cyan stroke, recedes vs the mint checks.
function CircleBullet() {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={6.2} stroke={deepSpace.accentSoft} strokeWidth={1.3} fill="none" />
    </Svg>
  );
}

// Mint check bullet (항해자 / promoted tier) - the only "filled/positive" mark.
function CheckBullet() {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16">
      <Path d="M3.5 8.5l3 3 6-7" stroke={deepSpace.mint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// Violet diamond bullet (북극성 tier) - soul/북극성 color, sits apart from cyan.
function SoulBullet() {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16">
      <Path d="M8 2l4 6-4 6-4-6z" stroke={deepSpace.soul} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// Small trust star (mint) for the "무료도 같은 AI 품질" line.
function TrustStar() {
  return (
    <Svg width={12} height={12} viewBox="0 0 16 16">
      <Path d="M8 1.5l1.8 3.8 4.2.5-3 2.9.8 4.1L8 10.9 4.2 12.8l.8-4.1-3-2.9 4.2-.5z" stroke={deepSpace.mint} strokeWidth={1.1} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

type Bullet = "circle" | "check" | "soul";
function FeatureRow({ kind, label, textStyle }: { kind: Bullet; label: string; textStyle: object }) {
  return (
    <View style={styles.payFeatRow}>
      {kind === "circle" ? <CircleBullet /> : kind === "check" ? <CheckBullet /> : <SoulBullet />}
      <Text variant="body" style={textStyle}>{label}</Text>
    </View>
  );
}

export function DeepSpacePlansScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language === "ko";

  // Current pricing tier - so the paywall shows where the user already is, not a
  // generic upsell. progression.tier is the source of truth (free|soma|cortex|
  // brain); RevenueCat isPro is folded in below so a just-completed purchase
  // reflects immediately even before the users row syncs.
  const { userId } = useAuth();
  const { tier: currentTier } = useProgression();
  // This month's free-tier remaining deep asks, for the 별바라기 caption.
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);

  // Real native IAP scaffold. RevenueCat routes the Offering to Google Play
  // Billing (Android) / Apple IAP (iOS). On web, or with no public key, or with
  // no configured Offering, purchasesAvailable() is false / packages is empty,
  // so we show an honest "upgrade in the mobile app" notice instead of a dead
  // button. No charging happens until Simon configures store products (see
  // src/lib/payments/purchases.ts header). revenue_events logging is server-side
  // via a RevenueCat webhook (out of scope; C4 schema untouched).
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isPro, setIsPro] = useState(false);
  // Which action is in-flight, so the paywall can show distinct "구매 중" /
  // "복원 중" states on the right control (the 4th state, "restoring").
  const [busyAction, setBusyAction] = useState<"buy" | "restore" | null>(null);
  const busy = busyAction !== null;
  const [error, setError] = useState<string | null>(null);
  const available = arePurchasesAvailable();

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
        if (alive) setError(t("plans.loadError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  // This month's remaining free deep-asks, shown as a caption on the 별바라기
  // card. Only loaded when the user is actually on the free tier (별바라기); for
  // paid tiers the number is irrelevant. Fails open: on any miss it stays null
  // and the caption is simply omitted.
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

  async function buy(pkg: PurchasesPackage) {
    if (busy) return;
    setBusyAction("buy");
    setError(null);
    const outcome = await purchasePackage(pkg);
    if (outcome.status === "purchased") setIsPro(outcome.isPro);
    else if (outcome.status === "error" || outcome.status === "unavailable") setError(t("plans.purchaseError"));
    // "cancelled" -> stay quiet.
    setBusyAction(null);
  }

  async function restore() {
    if (busy) return;
    setBusyAction("restore");
    setError(null);
    const outcome = await restorePurchases();
    if (outcome.status === "restored") {
      setIsPro(outcome.isPro);
      if (!outcome.isPro) setError(t("plans.restoredNone"));
    } else {
      setError(t("plans.restoreError"));
    }
    setBusyAction(null);
  }

  // No native store available (web / no key) OR no Offering configured yet:
  // honest notice, keep a /support fallback link. Never a dead checkout button.
  const showStoreNotice = !available || (!loading && packages.length === 0);

  // The "항해자" CTA buys the plus offering. RevenueCat hands us the current
  // Offering's packages; pick the one whose product reads as the monthly plus
  // tier (id/price hint), else the first available package. The on-card price
  // still shows TIER_PRICE_KRW so copy never drifts; the store charges the real
  // localized priceString.
  const plusPkg = useMemo(() => {
    if (packages.length === 0) return undefined;
    const hint = packages.find((p) => {
      const id = `${p.identifier} ${p.product.identifier}`.toLowerCase();
      return id.includes("plus") || id.includes("voyager") || id.includes("monthly") || id.includes("month");
    });
    return hint ?? packages[0];
  }, [packages]);

  // ── Tier copy - counts/features pulled from TIERS so it can't drift. ──
  const free = TIERS.free;
  const plus = TIERS.plus;
  const pro = TIERS.pro;
  const freeFeatures: string[] = ko
    ? [
        `한 달에 ${free.reasoningPerMonth}번 깊이 묻기`,
        `렌즈 ${free.lenses}개로 시작`,
        `기억이 ${free.historyDays}일 머무름`,
      ]
    : [
        `${free.reasoningPerMonth} deep asks a month`,
        `Start with ${free.lenses} lenses`,
        `Memory stays ${free.historyDays} days`,
      ];
  const plusFeatures: string[] = ko
    ? [
        `한 달에 ${plus.reasoningPerMonth}번 깊이 묻기`,
        `7개 렌즈 모두 열기`,
        `기억이 영원히 머무름`,
        `내보내기와 다른 앱 연동`,
      ]
    : [
        `${plus.reasoningPerMonth} deep asks a month`,
        `Open all 7 lenses`,
        `Memory stays forever`,
        `Export and connect other apps`,
      ];
  const proFeatures: string[] = ko
    ? ["모든 길 끝까지 열기", "가족과 함께 떠나기", "더 깊은 내보내기"]
    : ["Open every path to the end", "Journey together with family", "Deeper export"];

  // Pro tier is the 북극성 stage; tap routes through the same buy() so the
  // existing RevenueCat flow handles it (store charges the right product).
  const proPkg = useMemo(() => {
    if (packages.length === 0) return undefined;
    const hint = packages.find((p) => {
      const id = `${p.identifier} ${p.product.identifier}`.toLowerCase();
      return id.includes("pro") || id.includes("northstar") || id.includes("north") || id.includes("year") || id.includes("annual");
    });
    return hint && hint !== plusPkg ? hint : undefined;
  }, [packages, plusPkg]);

  // Resolve which pricing card the user is currently on. brain = 북극성,
  // cortex/soma = 항해자 (soma is the lifetime variant of the voyager journey),
  // free = 별바라기. RevenueCat isPro promotes a free-looking row to at-least
  // 항해자 so a just-purchased user never sees themselves as 별바라기.
  const onNorthStar = currentTier === "brain";
  const onVoyager = !onNorthStar && (currentTier === "cortex" || currentTier === "soma" || isPro);
  const onStargazer = !onNorthStar && !onVoyager;
  // The "현재 플랜" marker - subtle accent text, never a pill.
  const currentMarker = ko ? "현재 플랜" : "Current";

  return (
    <DockShell title={t("plans.title")}>
      {/* rev2 windowed sub-screen: no companion here (sb-app §4) and no legacy
          soul-glow disc - the shared sky outside the window carries the mood.
          Status line stays as honest body copy. */}
      <Text variant="caption" color="textMuted">
        {isPro ? t("plans.proActive") : t("plans.status")}
      </Text>

      {/* HERO - dominant, no transactional words. */}
      <View style={styles.payHero}>
        <Text style={[styles.payEyebrow, { fontFamily: m3.font.mono }]}>JOURNEY TO YOUR NORTH STAR</Text>
        <Text style={styles.payTitle}>
          {ko ? "나에 대해 더\n이해하고 싶나요?" : "Want to understand\nyourself more?"}
        </Text>
        <Text style={styles.paySub}>
          {ko
            ? "더 오래, 더 깊이 기억할수록\n당신의 북극성이 또렷해져요."
            : "The longer and deeper you remember,\nthe clearer your north star becomes."}
        </Text>
      </View>

      {onNorthStar ? (
        // 북극성 - every path is open. No purchase CTA; reuse the isPro
        // confirmation path with the north-star copy.
        <View style={[styles.payCard, styles.payCardPro]}>
          <View style={styles.payCardHead}>
            <Text style={styles.payTierNamePro}>{ko ? "북극성" : "North Star"}</Text>
            <Text variant="caption" style={styles.payCurrentMarker}>{currentMarker}</Text>
          </View>
          {proFeatures.map((x) => (
            <FeatureRow key={x} kind="soul" label={x} textStyle={styles.payFeatPro} />
          ))}
          <Text variant="subtle" style={styles.footer}>
            {ko ? "북극성 이용 중 · 모든 길이 열려 있어요" : "On North Star · every path is open"}
          </Text>
        </View>
      ) : onVoyager ? (
        // 항해자 - confirm current journey, offer the 북극성 upgrade if a
        // distinct pro package exists; otherwise just confirm, no checkout.
        <View style={[styles.payCard, styles.payCardPlus]}>
          <View style={styles.payCardHead}>
            <Text style={styles.payTierNamePlus}>{ko ? "항해자" : "Voyager"}</Text>
            <Text variant="caption" style={styles.payCurrentMarker}>{currentMarker}</Text>
          </View>
          {plusFeatures.map((x) => (
            <FeatureRow key={x} kind="check" label={x} textStyle={styles.payFeatPlus} />
          ))}
          <Text variant="subtle" style={styles.footer}>
            {proPkg
              ? t("plans.nowPro")
              : ko ? "현재 항해자 이용 중" : "Currently on Voyager"}
          </Text>
        </View>
      ) : (
        <>
          {/* 별바라기 - ₩0, cyan outline bullets. */}
          <View style={[styles.payCard, styles.payCardFree]}>
            <View style={styles.payCardHead}>
              <View style={styles.payNameRow}>
                <Text style={styles.payTierNameFree}>{ko ? "별바라기" : "Stargazer"}</Text>
                {onStargazer ? (
                  <Text variant="caption" style={styles.payCurrentMarker}>{currentMarker}</Text>
                ) : null}
              </View>
              <Text style={styles.payPriceFree}>{krw(TIER_PRICE_KRW.free)}</Text>
            </View>
            <View style={styles.payFeatList}>
              {freeFeatures.map((x) => (
                <FeatureRow key={x} kind="circle" label={x} textStyle={styles.payFeatFree} />
              ))}
            </View>
            {onStargazer && freeRemaining !== null ? (
              <Text variant="caption" style={styles.payFreeCaption}>
                {ko
                  ? `이번 달 ${freeRemaining}/${free.reasoningPerMonth}회 깊이 묻기 남음`
                  : `${freeRemaining}/${free.reasoningPerMonth} deep asks left this month`}
              </Text>
            ) : null}
          </View>

          {/* 항해자 - promoted: thicker cyan border + glow + "추천" rect tag. */}
          <View style={[styles.payCard, styles.payCardPlus]}>
            <Text pixelEn style={styles.payRecTag}>{ko ? "추천" : "PICK"}</Text>
            <View style={[styles.payCardHead, styles.payCardHeadPlus]}>
              <Text style={styles.payTierNamePlus}>{ko ? "항해자" : "Voyager"}</Text>
              <Text style={styles.payPricePlus}>
                <Text style={styles.payPriceStrong}>{krw(TIER_PRICE_KRW.plus)}</Text>
                {ko ? " /월" : " /mo"}
              </Text>
            </View>
            <View style={styles.payFeatList}>
              {plusFeatures.map((x) => (
                <FeatureRow key={x} kind="check" label={x} textStyle={styles.payFeatPlus} />
              ))}
            </View>
          </View>

          {/* 북극성 - violet border + violet bullets. */}
          <Pressable
            style={[styles.payCard, styles.payCardPro]}
            onPress={proPkg ? () => void buy(proPkg) : undefined}
            disabled={!proPkg || busy}
            accessibilityRole={proPkg ? "button" : undefined}
            accessibilityLabel={ko ? "북극성으로 떠나기" : "Set out as North Star"}
          >
            <View style={styles.payCardHead}>
              <Text style={styles.payTierNamePro}>{ko ? "북극성" : "North Star"}</Text>
              <Text style={styles.payPricePro}>
                <Text style={styles.payPriceStrongPro}>{krw(TIER_PRICE_KRW.pro)}</Text>
                {ko ? " /월" : " /mo"}
              </Text>
            </View>
            <View style={styles.payFeatList}>
              {proFeatures.map((x) => (
                <FeatureRow key={x} kind="soul" label={x} textStyle={styles.payFeatPro} />
              ))}
            </View>
          </Pressable>

          {showStoreNotice ? (
            <View style={styles.payCard}>
              <Text variant="heading" style={styles.section}>{t("plans.notAvailableTitle")}</Text>
              <Text variant="body" style={styles.planFeatDim}>{t("plans.notAvailableBody")}</Text>
              <Pressable
                onPress={() => router.push("/support")}
                accessibilityRole="button"
                accessibilityLabel={t("plans.support")}
              >
                <Text variant="caption" style={styles.planSupportLink}>{t("plans.support")}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {/* Loading state (가격 조회) - sits where the CTA will be, never overlaps. */}
      {loading ? (
        <View style={styles.plansLoading}>
          <ActivityIndicator color={deepSpace.accent} />
          <Text variant="subtle" style={styles.footer}>{ko ? "가격 조회 중…" : "Loading prices…"}</Text>
        </View>
      ) : null}

      {/* Inline error (결제 실패) - calm, functional, above the CTA. */}
      {error ? <Text variant="subtle" style={styles.planError}>{error}</Text> : null}

      {/* CTA BLOCK - below the cards in normal flow (marginTop:'auto' so it sinks
          to the bottom when the body is short, but never overlaps long copy).
          By current tier: 별바라기 → buy 항해자; 항해자 → upgrade to 북극성 (only
          when a distinct pro package exists); 북극성 → no CTA. */}
      {!loading && (onStargazer || (onVoyager && proPkg)) ? (
        // Stargazer buys 항해자 (plusPkg); Voyager upgrades to 북극성 (proPkg).
        (() => {
          const ctaPkg = onVoyager ? proPkg : plusPkg;
          const ctaIdle = onVoyager
            ? (ko ? "북극성으로 (Pro 업그레이드)" : "Go North Star (Pro upgrade)")
            : (ko ? "항해자로 떠나기" : "Set out as Voyager");
          return (
        <View style={styles.payCtaBlock}>
          <View style={styles.payTrustRow}>
            <TrustStar />
            <Text style={styles.payTrust}>{ko ? "무료도 같은 AI 품질" : "Same AI quality, even free"}</Text>
          </View>
          <Pressable
            style={[styles.payPrimary, busy ? styles.planBtnBusy : null, !ctaPkg ? styles.payPrimaryDisabled : null]}
            onPress={ctaPkg ? () => void buy(ctaPkg) : undefined}
            disabled={busy || !ctaPkg}
            accessibilityRole="button"
            accessibilityLabel={ctaIdle}
          >
            <Text style={styles.payPrimaryText}>
              {busyAction === "buy" ? (ko ? "구매 중…" : "Purchasing…") : ctaIdle}
            </Text>
          </Pressable>
          {available ? (
            <Pressable
              style={busy ? styles.planBtnBusy : null}
              onPress={() => void restore()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t("plans.restore")}
            >
              <Text style={styles.paySecondaryText}>
                {busyAction === "restore" ? (ko ? "복원 중…" : "Restoring…") : t("plans.restore")}
              </Text>
            </Pressable>
          ) : null}
        </View>
          );
        })()
      ) : null}
    </DockShell>
  );
}

