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
  AppState,
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
import { cosmic, semantic, typography, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { NavGraph, type DataNode } from "@/components/graph/NavGraph";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { useEmptyGraphDismissed } from "@/lib/onboarding/empty-card";
import { domainForTags, VILLAGE_LABEL, type VillageId } from "@/lib/graph/relatedness";
import { VILLAGE_UI } from "@/lib/village-ui";
import { overviewCardSignals } from "@/lib/graph/card-insights";
import { secondbPresence, SLEEP_AFTER_MS } from "@/lib/companion/fab-state";
import { StarNoiseLayer } from "@/components/premium";
import { prefersReducedMotion } from "@/lib/motion/signature";

const logo = require("../../public/assets/2ndb-production-premium-v1/graph/islands/core_center_premium_hq.png");

// Sky drift — slow atmospheric color shift behind the logo.
function useSkyDrift() {
  const tide = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      tide.setValue(0.5);
      return;
    }
    loopRef.current = Animated.loop(
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
    );
    if (AppState.currentState === "active") {
      loopRef.current.start();
    }

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (prefersReducedMotion()) {
        loopRef.current?.stop();
        tide.setValue(0.5);
        return;
      }
      if (nextAppState === "active") {
        loopRef.current?.start();
      } else {
        loopRef.current?.stop();
      }
    });

    return () => {
      loopRef.current?.stop();
      subscription.remove();
    };
  }, [tide]);
  return tide.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [
      withAlpha(cosmic.skyDriftBlue, 0.05),
      withAlpha(cosmic.skyDriftViolet, 0.05),
      withAlpha(cosmic.skyDriftCyan, 0.05),
    ],
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
    "In the age of AI, the most valuable asset is you.",
    "We noticed something this past month.",
    "Your past me and present me are lining up.",
    "There's fresh material in Wiki worth a sort.",
    "Your patterns are showing up brighter where you look most.",
    "Today leans a little more 'present me'.",
  ],
  ko: [
    "AI 시대, 가장 가치있는 것은 나 자신.",
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

function isVillageId(value: string | undefined): value is VillageId {
  return value === "work" || value === "relation" || value === "knowledge" || value === "records" || value === "taste";
}

function featuredVillageForCards(dataNodes: readonly DataNode[]): VillageId {
  const parentId = dataNodes[0]?.parentId;
  return isVillageId(parentId) ? parentId : "knowledge";
}

// Honest cold-start line: until there is at least one piece, the ribbon must NOT
// claim "we noticed" patterns (there is no data to notice). Show an invitation
// instead, so the ribbon never contradicts the empty-graph card.
const FIRST_PIECE_INSIGHT: Record<"en" | "ko", string> = {
  en: "Leave your first piece; patterns will show up here.",
  ko: "첫 조각을 남기면 여기에서 패턴이 보이기 시작해요.",
};

// The logo→village entry flourish plays once per JS session. A module-level
// flag survives the Stack pop's remount, so returning to "/" (e.g. BACK from a
// village detail) snaps to the settled state instead of replaying the logo +
// center-island ("소울 코어") fade — the old back-transition flash.
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
    // PERF P2: entryProgress only drives transform (logoScale) and opacity
    // (logoOpacity, contentOpacity) — no layout or color — so it runs on the
    // native (UI) thread instead of the JS thread, removing startup jank on
    // low-end devices. The animation plays once per session and naturally
    // settles at toValue 1, so there is no loop to stop and nothing to clean
    // up on unmount.
    const flourish = Animated.timing(entryProgress, {
      toValue: 1,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    flourish.start();
    return () => {
      flourish.stop();
    };
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

  // Insight chosen once per Landing mount. Data-style "we noticed" lines only
  // appear once the user actually has a piece; before that (or while the check
  // is still resolving) show the honest invitation so the ribbon never claims
  // patterns it cannot have.
  const insight = useMemo(
    () => (hasAnyPiece === true ? pickInsight(locale, Date.now() % 1000) : FIRST_PIECE_INSIGHT[locale]),
    [locale, hasAnyPiece],
  );
  const featuredVillage = useMemo(() => featuredVillageForCards(dataNodes), [dataNodes]);

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
  const mascotLabel =
    locale === "ko"
      ? presence.mascot === "sleep"
        ? "쉬고 있는 세컨비"
        : "세컨비"
      : presence.mascot === "sleep"
        ? "SecondB resting"
        : "SecondB";
  const featuredPiece = dataNodes.find((node) => node.parentId === featuredVillage) ?? dataNodes[0] ?? null;
  const soulCoreName = locale === "ko" ? "소울 코어" : "Soul Core";

  // P9: overview insight cards = a conversational "what changed / what to
  // reinforce" report (card 1 = SecondB) + a Pattern Core spotlight (card 2),
  // driven by real graph signals (card-insights.overviewCardSignals). Core-named
  // copy (always ends in "코어", a vowel) is josa-safe, fixing the old persona
  // particle bug ("아콘가/루멘가").
  const cardSignals = overviewCardSignals(dataNodes);
  const spotlightCore = cardSignals.recentCore ?? featuredVillage;
  const spotlightCoreName = VILLAGE_LABEL[spotlightCore][locale];
  const spotlightIsland = VILLAGE_UI[spotlightCore].island;
  const spotlightWorker = VILLAGE_UI[spotlightCore].worker;
  const sparseCoreName = cardSignals.sparseCore ? VILLAGE_LABEL[cardSignals.sparseCore][locale] : null;
  const recentPieceTitle = cardSignals.recentPiece?.title ?? featuredPiece?.title ?? null;

  const secondBCardBody =
    locale === "ko"
      ? featuredPiece
        ? `최근 ${spotlightCoreName}에 새 조각을 더했어요.${sparseCoreName ? ` ${sparseCoreName}는 아직 비어 있어요.` : ""}`
        : `${soulCoreName}가 첫 조각이 들어올 자리를 비워 두었어요.`
      : featuredPiece
        ? `Added a fresh piece to ${spotlightCoreName}.${sparseCoreName ? ` ${sparseCoreName} is still sparse.` : ""}`
        : `The ${soulCoreName} is ready for the first piece you leave.`;
  const coreCardBody =
    locale === "ko"
      ? recentPieceTitle
        ? `'${recentPieceTitle}' 조각이 최근 추가됐어요. 더 자세히 확인해보시겠어요?`
        : `${spotlightCoreName}에 조각들이 모여 있어요. 더 자세히 확인해보시겠어요?`
      : recentPieceTitle
        ? `Your latest piece is about "${recentPieceTitle}". Want a closer look?`
        : `Pieces are gathering in ${spotlightCoreName}. Want a closer look?`;
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
        // dismisses via the card's "먼저 둘러볼게요".
        <Animated.View
          // Android: pad past the system nav bar so the card's primary button is
          // never hidden behind soft keys. Falls back to the base 88 on iOS/web.
          style={[styles.emptyGraphBackdrop, { opacity: contentOpacity, paddingBottom: Math.max(88, insets.bottom + 64) }]}
          pointerEvents="auto"
        >
          <View style={styles.emptyGraphCard}>
            <View style={styles.emptyGraphIntro}>
              <View
                style={styles.emptyGraphArt}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <IslandArt id="core" size={88} />
              </View>
              <View style={styles.emptyGraphCopy}>
                <Text style={styles.emptyGraphTitle}>
                  {locale === "ko" ? "아직 마을이 조용해요" : "The village is quiet"}
                </Text>
                <Text style={styles.emptyGraphBody}>
                  {locale === "ko"
                    ? "첫 조각을 남기면 길이 조금씩 켜져요."
                    : "Leave a first piece and the roads light up."}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => router.push({ pathname: "/capture", params: { entry: "firstRun" } })}
              style={styles.emptyGraphCta}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? "첫 조각 남기기" : "Leave a first piece"}
              accessibilityHint={
                locale === "ko" ? "캡처 화면으로 이동합니다" : "Opens capture to save your first piece"
              }
            >
              <Text style={styles.emptyGraphCtaText}>
                {locale === "ko" ? "첫 조각 남기기" : "Leave a first piece"}
              </Text>
            </Pressable>
            <Pressable
              onPress={dismissEmptyCard}
              hitSlop={8}
              style={styles.emptyGraphSkip}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? "먼저 둘러보기" : "Look around first"}
              accessibilityHint={
                locale === "ko" ? "첫 화면 카드를 닫고 마을을 둘러봅니다" : "Dismisses the first-run card"
              }
            >
              <Text style={styles.emptyGraphSkipText}>
                {locale === "ko" ? "먼저 둘러볼게요" : "I'll look around first"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {!showingEmptyGraphCard ? (
        <Animated.View
          style={[
            styles.insightCardStack,
            { opacity: contentOpacity, bottom: Math.max(insets.bottom + 92, 104) },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => {
              wake();
              setCenterSeen(true);
              router.push({ pathname: "/secondb", params: { fromNode: soulCoreName } });
            }}
            style={styles.insightCard}
            accessibilityRole="button"
            accessibilityLabel={locale === "ko" ? "세컨비 Touch" : "SecondB Touch"}
            accessibilityHint={locale === "ko" ? "세컨비 대화를 엽니다" : "Opens SecondB chat"}
          >
            <View style={styles.insightCardAvatar}>
              <SecondBSprite state={presence.mascot === "sleep" ? "sleep" : "idle"} size={48} float={presence.mascot !== "sleep"} label={mascotLabel} />
            </View>
            <View style={styles.insightCardCopy}>
              <Text style={styles.insightCardTitle}>{locale === "ko" ? "세컨비" : "SecondB"}</Text>
              <Text style={styles.insightCardBody} numberOfLines={2}>{secondBCardBody}</Text>
            </View>
            <Text style={styles.insightCardCta}>Touch!</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              wake();
              router.push({ pathname: "/secondb", params: { fromNode: spotlightCoreName, character: spotlightWorker } });
            }}
            style={styles.insightCard}
            accessibilityRole="button"
            accessibilityLabel={`${spotlightCoreName} Touch`}
            accessibilityHint={locale === "ko" ? "이 패턴 코어를 자세히 봅니다" : "Opens this Pattern Core in detail"}
          >
            <View style={styles.insightCardAvatar}>
              <IslandArt id={spotlightIsland} size={46} />
            </View>
            <View style={styles.insightCardCopy}>
              <Text style={styles.insightCardTitle}>{spotlightCoreName}</Text>
              <Text style={styles.insightCardBody} numberOfLines={3}>{coreCardBody}</Text>
            </View>
            <Text style={styles.insightCardCta}>Touch!</Text>
          </Pressable>
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
        <View style={styles.mascotSlot}>
          <SecondBSprite
            state={presence.mascot === "sleep" ? "sleep" : "idle"}
            size={46}
            float={presence.mascot !== "sleep"}
            label={mascotLabel}
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
          accessibilityRole="button"
          accessibilityLabel={locale === "ko" ? "오늘의 중심 보기" : "Open today's center"}
          accessibilityHint={locale === "ko" ? "소울 코어 화면으로 이동합니다" : "Opens Soul Core"}
        >
          {/* KO "오늘의 중심" reads worse when tracked + uppercased, so KO drops
              tracking to 0 and stays sentence-case; EN keeps the stylized
              uppercase eyebrow. */}
          <Text style={[styles.insightEyebrow, locale === "ko" ? styles.insightEyebrowKo : styles.insightEyebrowEn]}>
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
    backgroundColor: semantic.backdrop,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 88,
    paddingHorizontal: 16,
  },
  emptyGraphCard: {
    alignItems: "stretch",
    backgroundColor: withAlpha(cosmic.space950, 0.92),
    borderColor: withAlpha(cosmic.soulViolet, 0.38),
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    maxWidth: 380,
    width: "100%",
  },
  emptyGraphIntro: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyGraphArt: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyGraphCopy: { flex: 1, gap: 4 },
  emptyGraphSkip: { minHeight: 44, marginTop: 6, justifyContent: "center", alignItems: "center" },
  emptyGraphSkipText: { color: cosmic.mistGray, fontSize: typography.sizes.sm, fontFamily: fontFamilies.sans },
  emptyGraphTitle: {
    color: cosmic.moonWhite,
    fontSize: typography.sizes.md,
    fontWeight: "700",
    fontFamily: fontFamilies.sans,
  },
  emptyGraphBody: {
    color: cosmic.mistGray,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fontFamilies.sans,
  },
  emptyGraphCta: {
    marginTop: 8,
    backgroundColor: cosmic.signalMint,
    borderRadius: 8,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  emptyGraphCtaText: {
    color: cosmic.space950,
    fontWeight: "700",
    fontSize: 14,
    fontFamily: fontFamilies.sans,
    textAlign: "center",
  },
  insightCardStack: {
    position: "absolute",
    left: 10,
    right: 10,
    gap: 10,
    zIndex: 24,
  },
  insightCard: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.signalMint, 0.82),
    backgroundColor: withAlpha(cosmic.insightSurface, 0.94),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  insightCardAvatar: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  insightCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  insightCardTitle: {
    color: cosmic.signalMint,
    fontSize: typography.sizes.md,
    lineHeight: 19,
    fontFamily: fontFamilies.pixel,
    letterSpacing: 0,
    marginBottom: 4,
  },
  insightCardBody: {
    color: cosmic.moonWhite,
    fontSize: typography.sizes.sm,
    lineHeight: 18,
    fontFamily: fontFamilies.readable,
    letterSpacing: 0,
  },
  insightCardCta: {
    alignSelf: "flex-end",
    color: cosmic.signalMint,
    fontSize: typography.sizes.sm,
    lineHeight: 18,
    fontFamily: fontFamilies.sans,
    fontWeight: "700",
    letterSpacing: 0,
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
    borderColor: withAlpha(cosmic.signalMint, 0.26),
    backgroundColor: withAlpha(cosmic.space950, 0.62),
  },
  // SecondB sprite frame. Same 52px footprint across idle/sleep states.
  mascotSlot: {
    width: 52,
    height: 52,
    borderRadius: 8, // square-ish, pixel-block feel rather than round avatar
    borderWidth: 1,
    borderColor: cosmic.coreGlow,
    backgroundColor: withAlpha(cosmic.soulViolet, 0.16),
    alignItems: "center",
    justifyContent: "center",
  },
  insightEyebrow: {
    color: cosmic.signalMint,
    // KO "오늘의 중심" must stay legible: keep >=12px. Tracking + uppercase are
    // applied per-locale below so the Korean label is not over-spaced.
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: fontFamilies.sans,
  },
  // KO: no tracking, no uppercase — keeps Hangul legible.
  insightEyebrowKo: {
    letterSpacing: 0,
  },
  // EN: stylized uppercase eyebrow with light tracking.
  insightEyebrowEn: {
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  insightText: {
    color: cosmic.moonWhite,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
    fontFamily: fontFamilies.sans,
  },
});
