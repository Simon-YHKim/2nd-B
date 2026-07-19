// THE reasoning limit sheet (스펙 docs/reasoning-ux-spec_260718.html 화면 F +
// 인계 계약 14, PR-B) — the ONE bottom sheet every reasoning surface opens on
// 한도 도달. Before this component the home bubble and /reasoning pushed
// "/records", where no rewarded flow exists (a dead promise); now this sheet
// OWNS the real reward path: it plays the rewarded ad, grants the credits, and
// returns the user to the surface they came from with their selection intact
// (it is an overlay — the caller's state is never torn down).
//
// Eligibility for the ad CTA: the FULL rewarded gate (#1076
// canShowRewardedAds — build flag + free tier + confirmed non-minor +
// explicit ads consent from users.privacy_prefs.ads + the rewarded route
// allow-list, where "/" home and "/reasoning" are listed for this sheet) plus
// the monthly earn cap. Every unresolved input fails closed, so minors and
// age-unknown users never see the ad region at all (spec F 상태 전수). Real
// SDK readiness + SSV verification remain rewarded.ts's own seam (#1068
// fail-closed until AdMob lands).
//
// SAME-QUALITY invariant: the reward adds RUNS only; copy restates it.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text as RNText, View, useWindowDimensions } from "react-native";
import { router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";

import { MdButton } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { canShowRewardedAds } from "@/lib/ads/policy";
import { showRewardedAd } from "@/lib/ads/rewarded";
import { fetchPrivacyPrefs } from "@/lib/supabase/privacy";
import { reasoningCapForTier } from "@/lib/entitlements/reasoning-cap";
import { REWARD_MONTHLY_CAP, REWARD_PER_WATCH } from "@/lib/entitlements/tiers";
import { addRewardCredits, getReasoningUsage, type ReasoningUsage } from "@/lib/entitlements/usage";
import { monthLabelFor } from "@/lib/reasoning/remaining-copy";
import { useProgression } from "@/lib/progression/useProgression";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export interface ReasoningLimitSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fired after a successful earn so the opening surface refetches its usage. */
  onChanged?: () => void;
}

export function ReasoningLimitSheet({ visible, onClose, onChanged }: ReasoningLimitSheetProps) {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, isMinor } = useAuth();
  const progression = useProgression();
  const pathname = usePathname();
  const { height } = useWindowDimensions();

  const [usage, setUsage] = useState<ReasoningUsage | null>(null);
  const [watching, setWatching] = useState(false);
  // users.privacy_prefs.ads — null until resolved; the rewarded gate fails closed.
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);
  const mountedRef = useRef(true);
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshUsage = useCallback(async () => {
    if (!userId) return;
    const next = await getReasoningUsage(userId);
    if (mountedRef.current) setUsage(next);
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    void refreshUsage();
  }, [visible, rise, refreshUsage]);

  useEffect(() => {
    if (!visible || !userId) return;
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
  }, [visible, userId]);

  const cap = reasoningCapForTier(progression.tier);
  const used = usage?.used ?? 0;
  const baseLeft = cap === null ? null : Math.max(0, cap - used);
  const rewardCredits = usage?.rewardCredits ?? 0;
  const rewardEarned = usage?.rewardEarned ?? 0;
  const earnCapReached = rewardEarned >= REWARD_MONTHLY_CAP;
  const month = monthLabelFor(i18n.language ?? "en", usage?.monthBucket ?? "");

  // Fail-closed ad region: the FULL #1076 rewarded gate (build flag + free
  // tier + confirmed non-minor + explicit ads consent + rewarded route
  // allow-list — "/" home and "/reasoning" are listed for this sheet) plus the
  // monthly earn cap. Any unresolved input hides the region entirely (spec F).
  const adEligible =
    canShowRewardedAds({
      tier: progression.loading ? null : progression.tier,
      isMinor,
      adsConsent,
      route: pathname ?? "/",
    }) && !earnCapReached;

  const onWatch = useCallback(async () => {
    if (!userId || watching) return;
    setWatching(true);
    try {
      // SSV customData (0091 contract): bare userId = the reasoning reward
      // path. When AdMob SSV becomes the grant authority
      // (EXPO_PUBLIC_REWARD_SSV=true + edge REWARD_SSV_ENABLED=1), the
      // verified callback credits THIS user server-side; addRewardCredits
      // below already no-ops in that mode (D2 guard in entitlements/usage.ts),
      // so one watch never double-grants.
      const { completed } = await showRewardedAd({ ssvCustomData: userId });
      if (completed) {
        await addRewardCredits(userId, REWARD_PER_WATCH);
        await refreshUsage();
        onChanged?.();
      }
    } catch (e) {
      if (typeof console !== "undefined") {
        console.warn("[reasoning-limit] rewarded watch failed", (e as Error).message);
      }
    } finally {
      if (mountedRef.current) setWatching(false);
    }
  }, [userId, watching, refreshUsage, onChanged]);

  const goPlans = useCallback(() => {
    onClose();
    router.push("/plans?from=reasoning_limit");
  }, [onClose]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.veil}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("ds.reasoningLimit.close")}
        />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />

          <RNText style={styles.title}>{t("ds.reasoningLimit.title")}</RNText>

          {/* ONE graphic: the weekly meter (2 or 7 cells), spent cells dimmed. */}
          {cap !== null ? (
            <View
              style={styles.meterRow}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: cap, now: baseLeft ?? 0 }}
            >
              {Array.from({ length: cap }, (_, index) => {
                const lit = index < (baseLeft ?? 0);
                return <View key={index} style={[styles.meterCell, !lit && styles.meterCellSpent]} />;
              })}
            </View>
          ) : null}
          {cap !== null ? (
            <RNText style={styles.resetLine}>{t("ds.reasoningLimit.resetLine", { cap })}</RNText>
          ) : null}

          <RNText style={styles.rewardLine}>
            {earnCapReached
              ? t("ds.reasoningLimit.rewardCapReached", { cap: REWARD_MONTHLY_CAP })
              : t("ds.reasoningLimit.rewardLeft", { n: rewardCredits, month })}
          </RNText>

          <View style={styles.actions}>
            {adEligible ? (
              <>
                <MdButton
                  label={t("ds.reasoningLimit.adCta", { n: REWARD_PER_WATCH })}
                  variant="filled"
                  disabled={watching}
                  onPress={() => void onWatch()}
                  style={styles.actionButton}
                />
                <MdButton
                  label={t("ds.reasoningLimit.plansCta")}
                  variant="tonal"
                  onPress={goPlans}
                  style={styles.actionButton}
                />
              </>
            ) : (
              <>
                <MdButton
                  label={t("ds.reasoningLimit.plansCta")}
                  variant="filled"
                  onPress={goPlans}
                  style={styles.actionButton}
                />
                <MdButton
                  label={t("ds.reasoningLimit.close")}
                  variant="text"
                  onPress={onClose}
                  style={styles.actionButton}
                />
              </>
            )}
          </View>

          <RNText style={styles.sameQuality}>{t("ds.reasoningLimit.sameQuality")}</RNText>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  veil: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(m3.color.scrim, 0.6) },
  sheet: {
    borderTopLeftRadius: m3.shape.extraLarge,
    borderTopRightRadius: m3.shape.extraLarge,
    borderTopWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: m3.color.surfaceContainerHigh,
    paddingTop: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s5,
    paddingBottom: m3.spacing.s6,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(m3.color.onSurfaceVariant, 0.4),
    alignSelf: "center",
    marginBottom: m3.spacing.s4,
  },
  title: {
    color: m3.color.onSurface,
    fontFamily: fontFamilies.readable,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  meterRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: m3.spacing.s4,
  },
  meterCell: { width: 26, height: 8, borderRadius: m3.shape.small, backgroundColor: m3.color.primary },
  meterCellSpent: { backgroundColor: m3.color.outlineVariant },
  resetLine: {
    color: m3.color.onSurfaceVariant,
    fontFamily: fontFamilies.readable,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: m3.spacing.s3,
  },
  rewardLine: {
    color: m3.color.onSurfaceVariant,
    fontFamily: fontFamilies.readable,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: m3.spacing.s2,
  },
  actions: { gap: m3.spacing.s2, marginTop: m3.spacing.s5 },
  actionButton: { width: "100%" },
  sameQuality: {
    color: withAlpha(m3.color.onSurfaceVariant, 0.8),
    fontFamily: fontFamilies.readable,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: m3.spacing.s4,
  },
});
