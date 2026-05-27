// Landing / Navigator — the post-loading "main view".
//
// 2026-05-27 v2: tiered constellation per user directive. Adds the
// off-graph UI elements:
//   - Top insights ribbon: one rotating line of "patterns from your
//     last month". Different on each visit.
//   - Bottom settings handle: faint horizontal gradient. Swipe up to
//     open /settings.
//
// Tap routes:
//   • unauthenticated → /sign-in (Redirect)
//   • authenticated + no profile → /complete-profile (C10)
//   • signed-in → tier dot opens bubble → confirm → router.push

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { darkSky } from "@/lib/theme/tokens";
import { NavGraph, type DataNode } from "@/components/graph/NavGraph";

const logo = require("../../assets/images/logo-glow.png");

// Sky drift — slow atmospheric color shift behind the logo.
function useSkyDrift() {
  const tide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(tide, { toValue: 1, duration: 10000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(tide, { toValue: 0, duration: 10000, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    ).start();
  }, [tide]);
  return tide.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["rgba(30,136,238,0.05)", "rgba(143,112,240,0.05)", "rgba(0,255,255,0.05)"],
  });
}

// Insight bank — randomly picks one to surface at the top of the
// navigator on each visit. Will eventually be derived from actual
// 30-day records via /insights aggregation; until that pipeline is
// wired, we surface a curated set of pattern-style observations that
// fit the cell-team / drill voice.
// Core Brain — first-person plural voice from the cell team. Short,
// nothing to action; just a "we noticed" hint.
const INSIGHTS: Record<"en" | "ko", readonly string[]> = {
  en: [
    "We noticed something this past month.",
    "Your past me and present me are lining up.",
    "There's fresh material in Wiki worth a sort.",
    "Your patterns are showing up brighter where you look most.",
    "Today leans a little more 'present me'.",
  ],
  ko: [
    "이번 한 달, 우리가 뭘 좀 알아챘어요.",
    "과거의 당신과 현재의 당신이 정렬되는 중이에요.",
    "Wiki에 새 재료가 좀 들어와 있어요. 정리해 볼까요?",
    "자주 보는 곳일수록 별이 더 밝게 맥동해요.",
    "오늘은 '현재의 나' 쪽으로 살짝 기울어요.",
  ],
};

function pickInsight(locale: "en" | "ko", salt: number): string {
  const bank = INSIGHTS[locale];
  return bank[salt % bank.length];
}

export default function Landing() {
  const { i18n } = useTranslation();
  const { userId, hasProfile, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const skyOverlay = useSkyDrift();

  const [dataNodes, setDataNodes] = useState<DataNode[]>([]);

  const entryProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entryProgress, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [entryProgress]);

  const logoScale = entryProgress.interpolate({ inputRange: [0, 1], outputRange: [4, 2] });
  const logoOpacity = entryProgress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.75, 0.55] });
  const contentOpacity = entryProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  // Insight chosen once per Landing mount — different on each visit.
  const insight = useMemo(() => pickInsight(locale, Date.now() % 1000), [locale]);

  // Fetch wiki entries as Tier 4 data dots. Each carries a parentId so
  // NavGraph can cluster them near the right tier-3 wiki node. Until
  // there's a way to classify daily vs pro server-side we default to
  // wiki-daily; a follow-up classifier will split.
  useEffect(() => {
    if (!userId) {
      setDataNodes([]);
      return;
    }
    const supabase = getSupabaseClient();
    let cancelled = false;
    supabase
      .from("wiki_pages")
      .select("id, title")
      .eq("user_id", userId)
      .limit(120)
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          setDataNodes(
            res.data.map((p) => ({
              id: p.id,
              title: p.title,
              parentId: "wiki-daily" as const,
            })),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Bottom-handle swipe-up → /settings. PanResponder is the lightest
  // way to wire a custom gesture without pulling in react-native-gesture-handler
  // surface (already loaded at root, but PanResponder is enough here).
  const handlePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -10 && Math.abs(g.dx) < 40,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -40) router.push("/settings");
      },
    }),
  ).current;

  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  function toggleLocale() {
    void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
  }

  return (
    <View style={styles.skyContainer}>
      <Animated.Image
        source={logo}
        style={[styles.skyLogo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        resizeMode="contain"
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: skyOverlay }]} />

      <Animated.View style={[styles.contentLayer, { opacity: contentOpacity }]} pointerEvents="box-none">
        <NavGraph locale={locale} dataNodes={dataNodes} />
      </Animated.View>

      {/* Top insight ribbon — Core Brain talks. The slot on the left
          is reserved for a future mascot avatar; for now it shows a
          subtle initial circle so the layout doesn't reflow when the
          asset lands. */}
      <Animated.View style={[styles.insightRibbon, { opacity: contentOpacity }]} pointerEvents="box-none">
        <View style={styles.mascotSlot} accessibilityLabel="Core Brain">
          <Text style={styles.mascotInitial}>C</Text>
        </View>
        <Pressable onPress={() => router.push("/insights")} hitSlop={8} style={{ flex: 1 }}>
          <Text style={styles.insightEyebrow}>{locale === "ko" ? "코어 브레인" : "Core Brain"}</Text>
          <Text style={styles.insightText} numberOfLines={2}>{insight}</Text>
        </Pressable>
      </Animated.View>

      {/* Locale toggle, top-right. */}
      <Animated.View style={[styles.localeToggle, { opacity: contentOpacity }]}>
        <Pressable onPress={toggleLocale} hitSlop={8}>
          <Text style={styles.localeToggleText}>{locale === "ko" ? "EN" : "한국어"}</Text>
        </Pressable>
      </Animated.View>

      {/* Bottom settings handle — faint horizontal gradient, swipe up. */}
      <Animated.View
        style={[styles.settingsHandle, { opacity: contentOpacity }]}
        {...handlePan.panHandlers}
      >
        <View style={styles.handleStripe} />
        <Text style={styles.handleLabel}>
          {locale === "ko" ? "위로 스와이프 → 설정" : "Swipe up · Settings"}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  skyContainer: { flex: 1, backgroundColor: darkSky.bg },
  skyLogo: {
    position: "absolute",
    width: 220, height: 220,
    top: "50%", left: "50%",
    marginLeft: -110, marginTop: -110,
  },
  contentLayer: { ...StyleSheet.absoluteFill as object },
  insightRibbon: {
    position: "absolute",
    top: 56, left: 16, right: 80,
    maxWidth: 600,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  // Slot reserved for the upcoming Core Brain mascot. Same footprint
  // (52px circle) the eventual <Image> will occupy.
  mascotSlot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(127,179,244,0.35)",
    backgroundColor: "rgba(127,179,244,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  mascotInitial: {
    color: "rgba(127,179,244,0.7)",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  insightEyebrow: {
    color: darkSky.textSubtle,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  insightText: {
    color: darkSky.text,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  localeToggle: {
    position: "absolute",
    top: 16, right: 16,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  localeToggleText: {
    color: darkSky.textSubtle,
    fontSize: 12, letterSpacing: 1.5, fontWeight: "700",
  },
  settingsHandle: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    paddingTop: 14, paddingBottom: 22,
    alignItems: "center",
    // Faint grey-tinted gradient feel via overlay strip.
    backgroundColor: "rgba(127,179,244,0.04)",
  },
  handleStripe: {
    width: 64,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(127,179,244,0.35)",
    marginBottom: 8,
  },
  handleLabel: {
    color: darkSky.textSubtle,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "600",
  },
});
