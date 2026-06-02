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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cosmic } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { NavGraph, type DataNode } from "@/components/graph/NavGraph";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { useEmptyGraphDismissed } from "@/lib/onboarding/empty-card";
import { domainForTags } from "@/lib/graph/relatedness";
import { secondbPresence, SLEEP_AFTER_MS } from "@/lib/companion/fab-state";
import { StarNoiseLayer } from "@/components/premium";

const logo = require("../../public/assets/2ndb-production-premium-v1/graph/islands/core_center_premium_hq.png");

// Sky drift — slow atmospheric color shift behind the logo.
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

// The logo→village entry flourish plays once per JS session. A module-level
// flag survives the Stack pop's remount, so returning to "/" (e.g. BACK from a
// village detail) snaps to the settled state instead of replaying the logo +
// center-island ("나의 중심") fade — the old back-transition flash.
let entryFlourishPlayed = false;

export default function Landing() {
  const { i18n } = useTranslation();
  const { userId, hasProfile, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const insets = useSafeAreaInsets();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const skyOverlay = useSkyDrift();

  const [dataNodes, setDataNodes] = useState<DataNode[]>([]);
  // Whether the user has left ANY piece yet, across BOTH stores: classified
  // clipper captures (`sources`, which also become graph nodes) and journal /
  // note pieces (`records`, which don't surface as nodes yet). `null` until the
  // first read resolves. Drives the empty-graph card so a journal-only user is
  // never nagged to "leave a first piece" (prev bug: the card keyed off
  // `sources` only, so any journal save left it showing forever).
  const [hasAnyPiece, setHasAnyPiece] = useState<boolean | null>(null);

  // Highlight-on-return (queue B): a record / wiki detail can deep-link back
  // to the graph and ask it to focus a specific node.
  const params = useLocalSearchParams<{
    highlight?: string;
    highlightWikiPageId?: string;
    highlightRecordId?: string;
  }>();
  const highlightId =
    (typeof params.highlightWikiPageId === "string" && params.highlightWikiPageId) ||
    (typeof params.highlight === "string" && params.highlight) ||
    (typeof params.highlightRecordId === "string" && params.highlightRecordId) ||
    null;

  // SecondB presence: dozes off after a stretch of no interaction, and shows
  // a soft notification glyph while there are pieces the user hasn't opened
  // the center for yet. `wake()` resets the idle timer on any interaction.
  const [sleeping, setSleeping] = useState(false);
  const [centerSeen, setCenterSeen] = useState(false);
  // First-run empty-graph card is dismissible so the user can just browse.
  // Dismissal persists (web localStorage / native AsyncStorage) so the card
  // doesn't re-appear on every return to the graph (it used to be mount-local
  // useState, which reset each visit).
  const { dismissed: emptyDismissed, dismiss: dismissEmptyCard } =
    useEmptyGraphDismissed();
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setSleeping(false);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setSleeping(true), SLEEP_AFTER_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => {
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
    };
  }, [wake]);

  const entryProgress = useRef(new Animated.Value(entryFlourishPlayed ? 1 : 0)).current;
  useEffect(() => {
    // Subsequent mounts (BACK to "/") snap to the settled state; only the first
    // mount of the session plays the flourish. See entryFlourishPlayed above.
    if (entryFlourishPlayed) {
      entryProgress.setValue(1);
      return;
    }
    entryFlourishPlayed = true;
    Animated.timing(entryProgress, {
      toValue: 1,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [entryProgress]);

  const logoScale = entryProgress.interpolate({ inputRange: [0, 1], outputRange: [4, 2] });
  // Entry flourish only (refine-v2 #7): the logo fades fully OUT as the
  // village fades in, instead of staying as a fixed centered watermark that
  // didn't track zoom/village scale. The premium islands carry the screen.
  const logoOpacity = entryProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.5, 0],
  });
  const contentOpacity = entryProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  // Insight chosen once per Landing mount — different on each visit.
  const insight = useMemo(() => pickInsight(locale, Date.now() % 1000), [locale]);

  // Fetch the user's classified pieces (clipper captures → `sources`) as the
  // tier-4 data dots. Each is placed in the village its tags point to
  // (domainForTags), so uploading + classifying a piece grows the right
  // district, and carries the AI summary + tags so the graph popup can show
  // them on tap. relatedness edges are computed inside NavGraph.
  useEffect(() => {
    if (!userId) {
      setDataNodes([]);
      setHasAnyPiece(null);
      return;
    }
    const supabase = getSupabaseClient();
    let cancelled = false;
    // Two reads settle together: `sources` → the tier-4 graph dots (classified
    // clipper captures); `records` (journal + note, head-only count) → the
    // user's authored pieces. The empty-graph card's emptiness check considers
    // both, so leaving a journal "조각" clears it. audit_response is excluded —
    // it's onboarding-guided Q&A, not a free-form piece.
    Promise.all([
      supabase
        .from("sources")
        .select("id, title, tags, frontmatter")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("records")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("kind", ["journal", "note"]),
    ]).then(([sourcesRes, recordsRes]) => {
      if (cancelled) return;
      const sources = sourcesRes.data ?? [];
      setDataNodes(
        sources.map((p) => {
          const tags = (p.tags ?? []) as string[];
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          const summary = typeof fm.summary === "string" ? fm.summary : "";
          return {
            id: p.id,
            title: p.title,
            parentId: domainForTags(tags, p.title),
            tags,
            summary,
          };
        }),
      );
      setHasAnyPiece(sources.length > 0 || (recordsRes.count ?? 0) > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  // First run: wait for native persistence before deciding whether to gate.
  if (onboardingComplete === null) return <InlineLoader />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;

  // SecondB nudges toward the center when there are pieces the user hasn't
  // looked at yet this session; it dozes once idle and nothing is pending.
  const presence = secondbPresence({
    idleMs: sleeping ? SLEEP_AFTER_MS : 0,
    sleepAfterMs: SLEEP_AFTER_MS,
    hasNotification: dataNodes.length > 0 && !centerSeen,
  });
  // Show only once the piece check has resolved to "none" (hasAnyPiece === false,
  // not null) AND the user hasn't dismissed (emptyDismissed hydrated to false,
  // not null). Both gates avoid a first-paint flash for users who do have pieces
  // or who previously dismissed.
  const showingEmptyGraphCard = hasAnyPiece === false && emptyDismissed === false;

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

      <Animated.View
        style={[styles.contentLayer, { opacity: contentOpacity }]}
        pointerEvents="box-none"
      >
        {/* Subtle cosmic star grain behind the village (premium pass). */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GraphStarHost />
        </View>
        <NavGraph
          locale={locale}
          dataNodes={dataNodes}
          highlightId={highlightId}
          glowNodeId={dataNodes.length > 0 && !centerSeen ? "records" : null}
        />
      </Animated.View>

      {/* Empty graph state (onboarding pack §6) — no saved pieces yet.
          Dismissible so the user can just look around the village. */}
      {showingEmptyGraphCard ? (
        // Full-screen modal backdrop (2026-06-01 directive): while the first-run
        // card is up, NOTHING behind it is interactive. pointerEvents="auto" on
        // the absolute-fill view captures every touch (graph, 오늘의 중심 ribbon,
        // FAB), and the high zIndex keeps it above all siblings. The dim focuses
        // attention on the card; tapping the backdrop does nothing — the user
        // dismisses via the card's "먼저 둘러볼게요" / ✕.
        <Animated.View
          style={[styles.emptyGraphBackdrop, { opacity: contentOpacity }]}
          pointerEvents="auto"
        >
          <View style={styles.emptyGraphCard}>
            {/* Close — lets the user dismiss and browse the empty village. */}
            <Pressable
              onPress={dismissEmptyCard}
              hitSlop={12}
              style={styles.emptyGraphClose}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? "닫고 둘러보기" : "Dismiss and look around"}
            >
              <Text style={styles.emptyGraphCloseText}>✕</Text>
            </Pressable>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <IslandArt id="core" size={150} />
            </View>
            <Text style={styles.emptyGraphTitle}>
              {locale === "ko" ? "아직 마을이 조용해요" : "The village is quiet"}
            </Text>
            <Text style={styles.emptyGraphBody}>
              {locale === "ko"
                ? "첫 조각을 남기면 길이 조금씩 켜져요."
                : "Leave a first piece and the roads light up."}
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: "/journal", params: { entry: "firstRun" } })}
              style={styles.emptyGraphCta}
            >
              <Text style={styles.emptyGraphCtaText}>
                {locale === "ko" ? "첫 조각 남기기" : "Leave a first piece"}
              </Text>
            </Pressable>
            <Pressable
              onPress={dismissEmptyCard}
              hitSlop={8}
              style={styles.emptyGraphSkip}
            >
              <Text style={styles.emptyGraphSkipText}>
                {locale === "ko" ? "먼저 둘러볼게요" : "I'll look around first"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Top insight ribbon — Core Brain talks. The left slot carries
          the live SecondB sprite as a stable visual anchor. */}
      <Animated.View
        style={[
          styles.insightRibbon,
          { opacity: contentOpacity, top: Math.max(insets.top + 8, 18) },
        ]}
        pointerEvents="box-none"
      >
        {/* SecondB sprite slot. Same 52px footprint across idle/sleep states. */}
        <View style={styles.mascotSlot} accessibilityLabel="SecondB">
          <SecondBSprite
            state={presence.mascot === "sleep" ? "sleep" : "idle"}
            size={46}
            float={presence.mascot !== "sleep"}
          />
        </View>
        <Pressable
          onPress={() => {
            wake();
            setCenterSeen(true);
            router.push("/core-brain");
          }}
          hitSlop={8}
          style={{ flex: 1 }}
        >
          <Text style={styles.insightEyebrow}>
            {locale === "ko" ? "오늘의 중심" : "Today's center"}
          </Text>
          <Text style={styles.insightText} numberOfLines={2}>
            {insight}
          </Text>
        </Pressable>
      </Animated.View>

      {/* Top-right cluster removed (graph-ux #2/#4): language is auto-detected
          and lives in Settings; Settings is reachable from the Profile tab.
          The main graph keeps a clean top so 오늘의 중심 sits at the very top. */}
    </View>
  );
}

// Star grain sized to the viewport, sitting behind the graph village.
function GraphStarHost() {
  const { width, height } = useWindowDimensions();
  return <StarNoiseLayer width={width} height={height} count={90} />;
}

const styles = StyleSheet.create({
  skyContainer: { flex: 1, backgroundColor: cosmic.space950 },
  skyLogo: {
    position: "absolute",
    width: 220,
    height: 220,
    top: "50%",
    left: "50%",
    marginLeft: -110,
    marginTop: -110,
  },
  contentLayer: { ...(StyleSheet.absoluteFill as object) },
  emptyGraphBackdrop: {
    ...(StyleSheet.absoluteFill as object),
    zIndex: 100,
    backgroundColor: "rgba(5,7,15,0.55)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 96,
    paddingHorizontal: 24,
  },
  emptyGraphCard: {
    alignItems: "center",
    backgroundColor: "rgba(7,10,24,0.92)",
    borderColor: "rgba(167,139,250,0.38)",
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    maxWidth: 360,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  emptyGraphClose: {
    position: "absolute",
    top: 4,
    right: 6,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  emptyGraphCloseText: { color: cosmic.mistGray, fontSize: 16, fontFamily: fontFamilies.sans },
  emptyGraphSkip: { minHeight: 44, marginTop: 10, justifyContent: "center" },
  emptyGraphSkipText: { color: cosmic.mistGray, fontSize: 14, fontFamily: fontFamilies.sans },
  emptyGraphTitle: {
    color: cosmic.moonWhite,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
    fontFamily: fontFamilies.sans,
  },
  emptyGraphBody: {
    color: cosmic.mistGray,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 4,
    fontFamily: fontFamilies.sans,
  },
  emptyGraphCta: {
    marginTop: 14,
    backgroundColor: cosmic.signalMint,
    borderRadius: 8,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  emptyGraphCtaText: {
    color: cosmic.space950,
    fontWeight: "700",
    fontSize: 15,
    fontFamily: fontFamilies.sans,
  },
  insightRibbon: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    maxWidth: 600,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.26)",
    backgroundColor: "rgba(7,10,24,0.62)",
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  // SecondB sprite frame. Same 52px footprint across idle/sleep states.
  mascotSlot: {
    width: 52,
    height: 52,
    borderRadius: 8, // square-ish, pixel-block feel rather than round avatar
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.42)",
    backgroundColor: "rgba(167,139,250,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  mascotPixelCore: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: cosmic.signalMint,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  insightEyebrow: {
    color: cosmic.signalMint,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
    fontFamily: fontFamilies.sans,
  },
  insightText: {
    color: cosmic.moonWhite,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
    fontFamily: fontFamilies.sans,
  },
  topRightCluster: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  localeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  localeToggleText: {
    color: cosmic.mistGray,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: "700",
    fontFamily: fontFamilies.sans,
  },
  settingsCog: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: cosmic.lineDim,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(167,139,250,0.06)",
  },
  settingsCogIcon: {
    color: cosmic.moonWhite,
    fontSize: 18,
    lineHeight: 18,
    marginTop: -1,
  },
});
