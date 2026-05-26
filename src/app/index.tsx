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
import { Animated, Easing, View, StyleSheet, Image, Pressable, Text } from "react-native";
import { router } from "expo-router";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
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
      {/* Dolly-zoomed logo continues here, full-bleed, behind everything. */}
      <Image source={logo} style={styles.skyLogo} resizeMode="contain" />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: skyOverlay }]}
      />
      <KnowledgeGraph nodes={nodes} edges={edges} onTapCore={handleTapCore} topMessage={topMessage} />

      {/* Tiny locale toggle in the corner — preserves the EN/KO affordance
          without competing with the graph for attention. */}
      <Pressable style={styles.localeToggle} onPress={toggleLocale} hitSlop={8}>
        <Text style={styles.localeToggleText}>{locale === "ko" ? "EN" : "한국어"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  skyContainer: { flex: 1, backgroundColor: "#02040A" },
  skyLogo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: undefined,
    height: undefined,
    transform: [{ scale: 1.6 }],
    opacity: 0.4,
  },
  localeToggle: {
    position: "absolute",
    top: 16,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  localeToggleText: {
    color: "#7FB3F4",
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
});
