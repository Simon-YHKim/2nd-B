// Landing / Navigator — the post-loading "main view".
//
// Per user directive (2026-05-27): the main screen is the navigator.
// A constellation of dots drifts on the dark-sky backdrop:
//   - Center, biggest + brightest = 2nd Brain (the user's profile)
//   - Surrounding, mid-size = each feature screen
//   - Outer ring, small + faint = the user's wiki/RAG data
// All dots pulse subtly and drift like motes; tapping a dot surfaces a
// bubble asking "go here?" with yes/no. The bubble follows the dot.
//
// Tap routes:
//   • unauthenticated → /sign-in (Redirect)
//   • authenticated + no profile → /complete-profile (C10)
//   • signed-in → the dot's `href` (via NavGraph confirm)

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, View, StyleSheet, Pressable, Text } from "react-native";
import { Redirect } from "expo-router";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { darkSky } from "@/lib/theme/tokens";
import { NavGraph, type DataNode } from "@/components/graph/NavGraph";

// Logo with glow — resolves to the root assets/ dir.
const logo = require("../../assets/images/logo-glow.png");

// Sky drift — slow atmospheric color shift behind the logo. Three-stop
// interpolation cycling every 20s — barely visible alpha 0.05.
function useSkyDrift() {
  const tide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(tide, {
          toValue: 1,
          duration: 10000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(tide, {
          toValue: 0,
          duration: 10000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [tide]);
  return tide.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["rgba(30,136,238,0.05)", "rgba(143,112,240,0.05)", "rgba(0,255,255,0.05)"],
  });
}

export default function Landing() {
  const { i18n } = useTranslation();
  const { userId, hasProfile, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const skyOverlay = useSkyDrift();

  const [dataNodes, setDataNodes] = useState<DataNode[]>([]);

  // Entry animation — picks up where LoadingScreen's dolly-zoom ended,
  // settling the logo into its resting position while the graph/banner
  // fades in. This makes the loading→main hand-off feel continuous
  // instead of a hard cut.
  const entryProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entryProgress, {
      toValue: 1,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [entryProgress]);

  const logoScale = entryProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 2],
  });
  const logoOpacity = entryProgress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 0.75, 0.55],
  });
  const contentOpacity = entryProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  // Pull the user's wiki pages as outer-ring data dots. Capped at 40 in
  // NavGraph itself; we still fetch up to 120 so the cap can stay random.
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
        if (res.data) setDataNodes(res.data as DataNode[]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: skyOverlay }]}
      />

      {/* Navigator graph — fades in after the logo settles. */}
      <Animated.View style={[styles.contentLayer, { opacity: contentOpacity }]} pointerEvents="box-none">
        <NavGraph locale={locale} dataNodes={dataNodes} />
      </Animated.View>

      {/* Locale toggle, top-right. */}
      <Animated.View style={[styles.localeToggle, { opacity: contentOpacity }]}>
        <Pressable onPress={toggleLocale} hitSlop={8}>
          <Text style={styles.localeToggleText}>{locale === "ko" ? "EN" : "한국어"}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  skyContainer: { flex: 1, backgroundColor: darkSky.bg },
  skyLogo: {
    position: "absolute",
    width: 220,
    height: 220,
    top: "50%",
    left: "50%",
    marginLeft: -110,
    marginTop: -110,
  },
  contentLayer: { ...StyleSheet.absoluteFill as object },
  localeToggle: {
    position: "absolute",
    top: 16,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  localeToggleText: {
    color: darkSky.textSubtle,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
});
