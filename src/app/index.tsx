// Landing — the post-loading "main view" per docs/DESIGN.md.
//
// After the LoadingScreen dolly-zoom resolves into this screen, the user
// sees:
//   • Dark sky-black backdrop with the giant logo (continuous with the
//     zoomed loader logo) and a slow sky-drift color overlay.
//   • A knowledge graph in the foreground.
//     - Empty state (no data): just the central "core" node — the
//       user's identity anchor. Top text invites the first tap.
//     - With data (authenticated + has wiki pages): the core surrounded
//       by source/entity/concept nodes connected by [[wikilink]] edges.
//
// Tap on the core:
//   • unauthenticated → /sign-up
//   • authenticated + no profile → /complete-profile  (C10)
//   • authenticated + profile → /journal

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, View, StyleSheet, Pressable, Text } from "react-native";
import { router, Redirect } from "expo-router";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { darkSky } from "@/lib/theme/tokens";
import { KnowledgeGraph, type GraphEdge, type GraphNode } from "@/components/graph/KnowledgeGraph";

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

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);

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
    // Picks up exactly where LoadingScreen's dolly-zoom landed
    // (scale 4 of the same 220×220 base) and settles to scale 2 as
    // ambient backdrop. Same base size + same centering math as
    // LoadingScreen so the handoff is pixel-aligned with the graph.
    outputRange: [4, 2],
  });
  const logoOpacity = entryProgress.interpolate({
    inputRange: [0, 0.55, 1],
    // 100% → 0% direction per user convention. Settles to 0.55 so the
    // logo stays present as ambient backdrop without competing with
    // the graph foreground.
    outputRange: [1, 0.75, 0.55],
  });
  const contentOpacity = entryProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  // Pull the user's wiki graph if signed in. Empty arrays for unauth
  // visitors — they see just the core.
  useEffect(() => {
    if (!userId) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const supabase = getSupabaseClient();
    let cancelled = false;
    Promise.all([
      supabase
        .from("wiki_pages")
        .select("id, kind, title")
        .eq("user_id", userId)
        .limit(120),
      supabase
        .from("wiki_links")
        .select("from_page, to_page")
        .eq("user_id", userId)
        .limit(400),
    ]).then(([pagesRes, linksRes]) => {
      if (cancelled) return;
      if (pagesRes.data) setNodes(pagesRes.data as GraphNode[]);
      if (linksRes.data) setEdges(linksRes.data as GraphEdge[]);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <InlineLoader />;

  // Unauthenticated visitors land on the dedicated dark sign-in screen
  // instead of seeing the empty-graph view. Per user directive: the
  // sign-in surface comes BEFORE the cell-loader; the loader is the
  // 'welcome' that plays once they've authenticated.
  if (!userId) return <Redirect href="/sign-in" />;
  // OAuth user with no public.users row → finish the C10 birth-date prompt.
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  function handleTapCore() {
    if (!userId) {
      router.push("/sign-up");
      return;
    }
    if (hasProfile === false) {
      router.push("/complete-profile");
      return;
    }
    router.push("/journal");
  }

  // Top message — only shown when the graph is empty (just the core).
  const isEmpty = nodes.length === 0;
  const topMessage = isEmpty
    ? locale === "ko"
      ? "가운데 점을 터치해서 두번째 뇌의 구성을 시작하세요."
      : "Tap the center dot to begin building your second brain."
    : undefined;

  // Locale toggle, top-right.
  function toggleLocale() {
    void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
  }

  return (
    <View style={styles.skyContainer}>
      {/* Logo picks up from LoadingScreen's dolly-zoom: starts large +
          opaque, settles into ambient background scale + 0.4 opacity. */}
      <Animated.Image
        source={logo}
        style={[styles.skyLogo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        resizeMode="contain"
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: skyOverlay }]}
      />
      {/* Graph + banner fade in after the settle so the eye registers the
          logo movement first, the content second. */}
      <Animated.View style={[styles.contentLayer, { opacity: contentOpacity }]} pointerEvents="box-none">
        <KnowledgeGraph nodes={nodes} edges={edges} onTapCore={handleTapCore} topMessage={topMessage} />
      </Animated.View>

      {/* Tiny locale toggle in the corner — preserves the EN/KO affordance
          without competing with the graph for attention. */}
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
  // Logo positioned with the SAME base size (220×220) and the SAME
  // centering math as LoadingScreen so the dolly-zoom handoff is
  // pixel-aligned. KnowledgeGraph centers on viewport via
  // useWindowDimensions, which equals this center exactly.
  skyLogo: {
    position: "absolute",
    width: 220,
    height: 220,
    top: "50%",
    left: "50%",
    marginLeft: -110,
    marginTop: -110,
    // scale + opacity driven by entryProgress (Animated.Value).
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
