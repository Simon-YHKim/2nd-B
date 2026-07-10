// Rewarded-ad bottom sheet (deep-space canon — handoff-pay design §②).
//
// Opt-in: the user taps to watch a rewarded video and earns USAGE COUNTS only
// (+REWARD_PER_WATCH reasoning runs) — never a quality bump. The earn is the
// caller's onEarned(REWARD_PER_WATCH); answer quality is untouched (entitlements
// SAME-QUALITY invariant).
//
// GATE — this component does NOT decide whether it may appear. The CALLER must
// only present it when ads are eligible: adult + ads consent + non-sensitive
// (ad-allowed) route + free tier, per canShowAds() in src/lib/ads/policy.ts.
// (Minors and sensitive surfaces never reach here.) The privacy line restates
// that contract to the user.
//
// Visual: a slide-up sheet (fade veil + rise from the bottom edge), NOT a
// centered modal box. All color via deepSpace.* tokens / withAlpha — zero hex.

import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { REWARD_PER_WATCH } from "@/lib/entitlements/tiers";
import { Text } from "@/components/ui/Text";
import { showRewardedAd } from "@/lib/ads/rewarded";

const HEAD_IMAGE = require("../../../assets/deepspace/secondb-head-front.png");

export interface RewardedSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Reasoning runs the user has left this period (before watching). */
  remaining: number;
  /** Called with the earned credit count once a rewarded watch completes. */
  onEarned: (credits: number) => void;
  /** Optional locale override; otherwise read from i18n.language. */
  locale?: string;
}

export function RewardedSheet({ visible, onClose, remaining, onEarned, locale }: RewardedSheetProps) {
  const { i18n } = useTranslation();
  const lang = locale ?? i18n.language ?? "ko";
  const ko = lang.toLowerCase().startsWith("ko");
  const { height } = useWindowDimensions();

  // Slide-up: fade veil + rise from the bottom edge. NO bounce/elastic.
  const rise = useRef(new Animated.Value(0)).current;
  // Fade-only bloom behind the "after" number (opacity loop, no layout/scale shift).
  const bloom = useRef(new Animated.Value(0)).current;
  const watchingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      rise.setValue(0);
      Animated.timing(rise, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      rise.setValue(0);
    }
  }, [visible, rise]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bloom, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bloom, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, bloom]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  // Fade-only: opacity breathes; the layout box never moves or scales.
  const bloomOpacity = bloom.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });

  const after = remaining + REWARD_PER_WATCH;

  const onWatch = async () => {
    if (watchingRef.current) return;
    watchingRef.current = true;
    try {
      const { completed } = await showRewardedAd();
      if (completed) onEarned(REWARD_PER_WATCH);
    } finally {
      watchingRef.current = false;
      onClose();
    }
  };

  const C = ko
    ? {
        titleA: "30초만 보면 리즈닝 ",
        titleB: `+${REWARD_PER_WATCH}회`,
        sub: "광고를 보고 이번 주 자기이해 횟수를 채워요.\n답의 질은 그대로예요.",
        remaining: "남은 횟수",
        afterLabel: `+${REWARD_PER_WATCH}회 후`,
        cta: `광고 보고 +${REWARD_PER_WATCH}회 받기`,
        later: "나중에",
        privacy: "성인·동의 시에만 · 민감한 화면에선 안 보여요",
      }
    : {
        titleA: "Watch 30s, get ",
        titleB: `+${REWARD_PER_WATCH}`,
        sub: "Watch an ad to top up this week's self-understanding count.\nThe quality of answers stays the same.",
        remaining: "left",
        afterLabel: `after +${REWARD_PER_WATCH}`,
        cta: `Watch and get +${REWARD_PER_WATCH}`,
        later: "Later",
        privacy: "Adults with consent only · never on sensitive screens",
      };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {/* faint dimmed deep-space backdrop */}
        <View style={styles.spaceWash} pointerEvents="none" />
        {/* dim veil (tap to dismiss) */}
        <Pressable style={styles.veil} onPress={onClose} accessibilityRole="button" />

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* grabber */}
          <View style={styles.grabber} />

          {/* character head, neutral-friendly */}
          <View style={styles.headWrap}>
            <Image source={HEAD_IMAGE} style={styles.head} contentFit="contain" />
          </View>

          <Text style={styles.title}>
            {C.titleA}
            <Text style={styles.titleAccent}>{C.titleB}</Text>
          </Text>
          <Text style={styles.sub}>{C.sub}</Text>

          {/* counter graphic: remaining -> arrow -> after (with fade-only bloom) */}
          <View style={styles.counterRow}>
            <View style={styles.counterCol}>
              <Text style={styles.numBefore}>{String(remaining)}</Text>
              <Text style={styles.numLabel}>{C.remaining}</Text>
            </View>

            <Svg width={34} height={16} viewBox="0 0 34 16" fill="none">
              <Path
                d="M2 8h26m0 0l-6-5m6 5l-6 5"
                stroke={withAlpha(deepSpace.accentSoft, 0.5)}
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>

            <View style={styles.counterCol}>
              <View style={styles.afterStack}>
                <Animated.View style={[styles.bloom, { opacity: bloomOpacity }]} pointerEvents="none" />
                <Text style={styles.numAfter}>{String(after)}</Text>
              </View>
              <Text style={styles.numLabelMint}>{C.afterLabel}</Text>
            </View>
          </View>

          {/* mint primary CTA */}
          <Pressable
            style={styles.ctaBtn}
            onPress={onWatch}
            accessibilityRole="button"
            accessibilityLabel={C.cta}
          >
            <Svg width={15} height={15} viewBox="0 0 16 16" fill="none">
              <Path d="M5 3.5v9l7-4.5z" fill={deepSpace.onMint} />
            </Svg>
            <Text style={styles.ctaText}>{C.cta}</Text>
          </Pressable>

          <Pressable style={styles.laterBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.laterText}>{C.later}</Text>
          </Pressable>

          <Text style={styles.privacy}>{C.privacy}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  // faint dimmed deep-space backdrop behind the veil
  spaceWash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: deepSpace.bgEdge },
  veil: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(deepSpace.bgEdge, 0.66) },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: deepSpaceRadii.phone,
    borderBottomRightRadius: deepSpaceRadii.phone,
    borderTopWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    backgroundColor: deepSpace.bgMid,
    paddingTop: 14,
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(deepSpace.accentSoft, 0.3),
    alignSelf: "center",
    marginBottom: 18,
  },
  headWrap: { alignItems: "center", marginBottom: 14 },
  head: {
    width: 64,
    height: 64,
    // soft cyan drop-shadow glow
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  title: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: deepSpace.textHi,
    lineHeight: 31,
  },
  titleAccent: { color: deepSpace.accentSoft, fontWeight: "800" },
  sub: {
    textAlign: "center",
    fontSize: 13,
    color: withAlpha(deepSpace.accentSoft, 0.66),
    marginTop: 10,
    lineHeight: 21,
    paddingHorizontal: 6,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 22,
    marginBottom: 6,
  },
  counterCol: { alignItems: "center" },
  afterStack: { alignItems: "center", justifyContent: "center" },
  bloom: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(deepSpace.mint, 0.3),
  },
  numBefore: { fontFamily: fontFamilies.pixelKo, fontSize: 30, color: deepSpace.accentBright },
  numAfter: { fontFamily: fontFamilies.pixelKo, fontSize: 34, color: deepSpace.mint },
  numLabel: {
    fontFamily: fontFamilies.pixelEn,
    fontSize: 7,
    letterSpacing: 0.7,
    color: withAlpha(deepSpace.accentSoft, 0.5),
    marginTop: 4,
  },
  numLabelMint: {
    fontFamily: fontFamilies.pixelEn,
    fontSize: 7,
    letterSpacing: 0.7,
    color: withAlpha(deepSpace.mint, 0.7),
    marginTop: 4,
  },
  ctaBtn: {
    minHeight: 52,
    marginTop: 18,
    paddingVertical: 16,
    borderRadius: 15,
    backgroundColor: deepSpace.mint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  ctaText: { fontFamily: fontFamilies.pixelKo, fontSize: 15, fontWeight: "700", color: deepSpace.onMint },
  laterBtn: { minHeight: 44, marginTop: 9, alignItems: "center", justifyContent: "center" },
  laterText: { fontSize: 13, color: withAlpha(deepSpace.accentSoft, 0.55) },
  privacy: {
    textAlign: "center",
    // Consent/privacy disclosure (ads only to consenting adults, never on
    // sensitive screens) — the trust-critical line, so it must be legible, not
    // de-emphasized fine print. Was fontSize 11 @ 0.4 alpha (below AA contrast);
    // raised to 12 @ 0.7 so it reads as reassurance rather than disclaimer.
    fontSize: 12,
    color: withAlpha(deepSpace.accentSoft, 0.7),
    marginTop: 14,
    lineHeight: 18,
  },
});
