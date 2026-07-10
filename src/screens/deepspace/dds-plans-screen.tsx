// Paywall (① 페이월) - rev2 M3 clone of the reference PlansScreen
// (sb-screens-extra.jsx). Structure matches the reference verbatim: an
// in-body 요금제 headline, a tertiary-container honesty card, three journey
// tier cards (별바라기 / 항해자 / 북극성) each carrying its OWN full-width M3
// button, then the "결제 없이 늘리기" reward-ad row. Tiers are NEVER labelled
// Free/Plus/Pro in the UI.
//
// Wiring preserved exactly: RevenueCat (getOfferings / purchasePackage /
// getProStatus / restorePurchases) drives the CTAs; prices come from the single
// pricing SoT (src/lib/progression/pricing.ts) - KRW for ko, USD for every other
// locale - so on-card copy can never drift from what enforcement charges (the
// 항해자=cortex / 북극성=brain mapping is fixed in reasoning-cap.ts). Per the
// entitlements HARD invariant, money buys MORE/LONGER memory + MORE features -
// never a better answer; this surface must never imply a pricier tier reasons better.
// revenue_events logging stays server-side via a RevenueCat webhook (C4 schema
// untouched). The rewarded row tops up COUNTS only, never quality.
// ──────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";

import { m3 } from "@/lib/theme/m3";
import { TIER_PRICING } from "@/lib/progression/pricing";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage, addRewardCredits } from "@/lib/entitlements/usage";
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

// Format a KRW integer as ₩9,900 without a hardcoded currency literal in copy.
function krw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

// Format a USD price as $9.99 (2 decimals) without a hardcoded currency literal.
function usd(n: number): string {
  return `$${n.toFixed(2)}`;
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
  const { i18n } = useTranslation("deepspace");
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
        if (alive) setError(ko ? "플랜을 불러오지 못했어요. 다시 시도해 주세요." : "Couldn't load plans. Try again.");
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
      setError(ko ? "결제가 완료되지 않았어요. 다시 시도해 주세요." : "The purchase didn't go through. Try again.");
    setBusyAction(null);
  }

  async function restore() {
    if (busy) return;
    setBusyAction("restore");
    setError(null);
    const outcome = await restorePurchases();
    if (outcome.status === "restored") {
      setIsPro(outcome.isPro);
      if (!outcome.isPro) setError(ko ? "복원할 이전 구매가 없어요." : "No previous purchase found to restore.");
    } else {
      setError(ko ? "구매를 복원하지 못했어요. 다시 시도해 주세요." : "Couldn't restore purchases. Try again.");
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

  // ── Tier copy (reference PlansScreen tiers[]). Prices from the pricing SoT
  // (progression/pricing.ts): plus = cortex, pro = brain; KRW for ko, USD else. ──
  const per = ko ? "/월" : "/mo";
  const tiers: TierCopy[] = ko
    ? [
        { key: "free", name: "별바라기", sub: "시작하는 사람", price: "무료", feats: ["7 도메인 별", "월 100별가루", "IDEN 1개"] },
        { key: "plus", name: "항해자", sub: "꾸준한 항해자", price: `${krw(TIER_PRICING.cortex.krwMonthly)}${per}`, feats: ["무제한 별가루", "심층 인터뷰", "데이터 연동 5종", "IDEN 버전 관리"] },
        { key: "pro", name: "북극성", sub: "깊이 파는 사람", price: `${krw(TIER_PRICING.brain.krwMonthly)}${per}`, feats: ["항해자 전체", "장기 보관 무제한", "가족 공유", "우선 분석"] },
      ]
    : [
        { key: "free", name: "Stargazer", sub: "Just starting out", price: "Free", feats: ["7 domain stars", "100 stardust a month", "1 IDEN"] },
        { key: "plus", name: "Voyager", sub: "A steady voyager", price: `${usd(TIER_PRICING.cortex.usdMonthly)}${per}`, feats: ["Unlimited stardust", "Deep interviews", "5 data integrations", "IDEN version history"] },
        { key: "pro", name: "North Star", sub: "For the deep divers", price: `${usd(TIER_PRICING.brain.usdMonthly)}${per}`, feats: ["Everything in Voyager", "Unlimited long-term storage", "Family sharing", "Priority analysis"] },
      ];

  function onStart(key: TierKey) {
    if (busy) return;
    if (key === "plus" && plusPkg) void buy(plusPkg);
    else if (key === "pro" && proPkg) void buy(proPkg);
    else if (key !== "free") setError(ko ? "결제가 완료되지 않았어요. 다시 시도해 주세요." : "The purchase didn't go through. Try again.");
    // free → nothing to buy (reference no-op).
  }

  return (
    <DockShell title={ko ? "요금제" : "Plans"}>
      <Text style={s.headline}>{ko ? "요금제" : "Plans"}</Text>

      {/* honesty note (tertiary-container) */}
      <MdCard variant="filled" style={s.honesty}>
        <View style={s.honestyRow}>
          <LockIcon color={m3.color.onTertiaryContainer} />
          <Text style={s.honestyText}>
            {ko ? "요금은 횟수·보관·내보내기 " : "Plans differ only "}
            <Text style={s.honestyStrong}>{ko ? "한도만" : "in limits"}</Text>
            {ko
              ? " 달라요. 더 비싸다고 더 ‘나은 나’를 주지 않아요."
              : ": how many, how long, how much you export. Paying more never gives you a ‘better you’."}
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
                      <Text style={s.currentPillText}>{ko ? "이용 중" : "Active"}</Text>
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
                    ? ko ? "현재 요금제" : "Current plan"
                    : busyAction === "buy"
                      ? ko ? "구매 중…" : "Purchasing…"
                      : ko ? `${tr.name} 시작` : `Start ${tr.name}`
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
          <Text style={s.dim}>{ko ? "플랜을 불러오는 중이에요…" : "Loading plans…"}</Text>
        </View>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}

      {/* free top-up via opt-in rewarded ad (COUNTS only, never quality) */}
      <Text style={s.sectionLabel}>{ko ? "결제 없이 늘리기" : "Grow without paying"}</Text>
      <Pressable
        style={s.rewardRow}
        onPress={() => setRewardVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={ko ? "광고로 담기 가속 충전" : "Speed up with an ad"}
      >
        <BoltIcon color={m3.color.tertiary} />
        <View style={s.rewardText}>
          <Text style={s.rewardTitle}>{ko ? "광고로 담기 가속 충전" : "Speed up with an ad"}</Text>
          <Text style={s.rewardSub}>{ko ? "30초 영상 = +5회 · 분석 품질은 그대로" : "30s video = +5 asks · quality unchanged"}</Text>
        </View>
        <ChevronRight color={m3.color.onSurfaceVariant} />
      </Pressable>

      {showStoreNotice ? (
        <MdCard variant="outlined" style={s.notice}>
          <Text style={s.noticeTitle}>{ko ? "모바일 앱에서 업그레이드" : "Upgrade in the mobile app"}</Text>
          <Text style={s.noticeBody}>
            {ko
              ? "유료 플랜은 iOS와 Android 앱스토어에서 결제해요. 휴대폰에서 두번째 뇌 앱을 열어 업그레이드해 주세요."
              : "Paid plans are purchased through the app stores on iOS and Android. Open 2nd-Brain on your phone to upgrade."}
          </Text>
          <Pressable onPress={() => router.push("/support")} accessibilityRole="button" accessibilityLabel={ko ? "문의하기" : "Contact support"}>
            <Text style={s.supportLink}>{ko ? "문의하기" : "Contact support"}</Text>
          </Pressable>
        </MdCard>
      ) : null}

      {available ? (
        <Pressable onPress={() => void restore()} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "구매 복원" : "Restore purchase"} style={busy ? s.dimPress : undefined}>
          <Text style={s.restore}>{busyAction === "restore" ? (ko ? "복원 중…" : "Restoring…") : ko ? "구매 복원" : "Restore purchase"}</Text>
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
