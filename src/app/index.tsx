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

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  AppState,
  Easing,
  Pressable,
  type PressableProps,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, semantic, spacing, typography, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { useImportPendingCaptures } from "@/lib/capture/use-import-pending";
import { DeepSpaceShell } from "@/components/deep-space/DeepSpaceShell";
import { DeepSpaceLinks } from "@/components/deep-space/DeepSpaceLinks";
import { NavGraph, type DataNode } from "@/components/graph/NavGraph";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { useCoreHintDismissed } from "@/lib/onboarding/core-hint";
import { useComfortOfferDismissed } from "@/lib/onboarding/comfort-offer";
import { useFontStyle } from "@/lib/settings/readable-font";
import { useEmptyGraphDismissed } from "@/lib/onboarding/empty-card";
import { useAutoTriggerTTFV } from "@/lib/onboarding/ttfv-gate";
import { VILLAGE_LABEL, type VillageId } from "@/lib/graph/relatedness";
import { retainStableDataNodes, sourceRowsToDataNodes } from "@/lib/graph/data-nodes";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { VILLAGE_UI } from "@/lib/village-ui";
import { overviewCardSignals } from "@/lib/graph/card-insights";
import { secondbPresence, SLEEP_AFTER_MS } from "@/lib/companion/fab-state";
import { PowerOnOverlay, PremiumButton, StarNoiseLayer, TAB_BAR_HEIGHT } from "@/components/premium";
import { prefersReducedMotion } from "@/lib/motion/signature";

const logo = require("../../public/assets/2ndb-production-premium-v1/graph/islands/core_center_premium_hq.png");
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface HomePressableProps extends Omit<PressableProps, "style" | "children"> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function HomePressable({ children, style, onPressIn, onPressOut, ...props }: HomePressableProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  const animateOpacity = (toValue: number) => {
    Animated.timing(opacity, {
      toValue,
      duration: 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        animateOpacity(0.8);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateOpacity(1);
        onPressOut?.(event);
      }}
      style={[style, { opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
}

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
    "Some patterns showed up in this past month's records.",
    "Your past me and present me are lining up.",
    "There's fresh material in Wiki worth a sort.",
    "Your patterns are showing up brighter where you look most.",
    "Today leans a little more 'present me'.",
  ],
  ko: [
    "AI 시대, 가장 가치있는 것은 나 자신.",
    "이번 한 달 기록에서 패턴이 좀 보여요.",
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

// J1 (e2e journey register): the default first save is a journal entry, which
// lands in `records` — NOT in `sources`, so the graph gains zero nodes. The
// "we noticed" bank used to kick in here anyway (hasAnyPiece counts records),
// fabricating patterns over an empty graph right after onboarding promised the
// piece would be findable again. Acknowledge the save honestly and say where
// the piece actually lives, until a classified capture lights the first node.
const RECORDS_ONLY_INSIGHT: Record<"en" | "ko", string> = {
  // Kept under the 2-line ribbon budget at 360dp — the actionable second
  // clause must not be the part that ellipsizes.
  en: "Saved in your records. Clip a link to light the graph.",
  ko: "조각은 기록 보관소에 있어요. 링크를 담으면 별이 떠요.",
};

// P2-6 (persona sim): when the graph data fetch fails (metered connection
// dropping mid-ride), the ribbon must say so honestly instead of falling back
// to the first-piece invitation — telling someone who JUST saved that they
// have nothing yet is the exact gaslighting the honest-UI rule forbids.
const OFFLINE_INSIGHT: Record<"en" | "ko", string> = {
  en: "Connection is shaky. Your pieces are safe. Tap to retry.",
  ko: "연결이 불안정해요. 조각은 안전해요. 눌러서 다시 시도.",
};

// The logo→village entry flourish plays once per JS session. A module-level
// flag survives the Stack pop's remount, so returning to "/" (e.g. BACK from a
// village detail) snaps to the settled state instead of replaying the logo +
// center-island ("소울 코어") fade — the old back-transition flash.
let entryFlourishPlayed = false;

// O-23 Stage③: `index` (/) branches on the UI flag. Legacy renders the village
// graph (GraphScreen, this file's original body); deep-space renders the character
// shell. The graph stays reachable in deep-space via the /graph route (graph.tsx
// re-exports GraphScreen), so no logic is forked — see docs/deep-space-nav-contract.md.
export default function Index() {
  useImportPendingCaptures();
  if (isDeepSpaceUI()) return <DeepSpaceShell />;
  return <GraphScreen />;
}

export function GraphScreen() {
  const { i18n } = useTranslation();
  const { userId, hasProfile, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const autoTriggerTTFV = useAutoTriggerTTFV();
  const insets = useSafeAreaInsets();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const skyOverlay = useSkyDrift();

  const [dataNodes, setDataNodes] = useState<DataNode[]>([]);
  const dataNodesRef = useRef<DataNode[]>([]);
  // Whether the user has left ANY piece yet, across BOTH stores: classified
  // clipper captures (`sources`, which also become graph nodes) and journal /
  // note pieces (`records`, which don't surface as nodes yet). `null` until the
  // first read resolves. Drives the empty-graph card so a journal-only user is
  // never nagged to "leave a first piece" (prev bug: the card keyed off
  // `sources` only, so any journal save left it showing forever).
  const [hasAnyPiece, setHasAnyPiece] = useState<boolean | null>(null);
  // P2-6: graph data fetch failed (offline/flaky) — drives the honest ribbon
  // line + tap-to-retry, and suppresses the empty-graph card (we don't KNOW
  // the graph is empty). reloadKey bumps re-run the fetch effect.
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [graphReloadKey, setGraphReloadKey] = useState(0);

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
  // O-12 Phase D (first-impression): insight cards stay hidden until the user
  // first touches the graph, so the initial screen is the clean graph alone.
  const [graphTouched, setGraphTouched] = useState(false);
  // O-12 Phase C P1-1: hide overlay cards while a node sheet / drilldown is open.
  const [sheetOpen, setSheetOpen] = useState(false);
  // First-run empty-graph card is dismissible so the user can just browse.
  // Dismissal persists (web localStorage / native AsyncStorage) so the card
  // doesn't re-appear on every return to the graph (it used to be mount-local
  // useState, which reset each visit).
  const { dismissed: emptyDismissed, dismiss: dismissEmptyCard } =
    useEmptyGraphDismissed();
  // B-1 coach hint: nodes exist but the graph was never touched — one line
  // in the spotlight slot until the first interaction dismisses it for good.
  const { dismissed: coreHintDismissed, dismiss: dismissCoreHint } =
    useCoreHintDismissed();
  // Persona sim v2 P1-1: one-time comfort offer. The readable-font option
  // exists (P2-10) but every 60+ persona stalled on the pixel-dark default
  // before finding 설정 > 테마. Ask ONCE where they land; accepting changes
  // the screen instantly, either choice dismisses forever.
  const { dismissed: comfortDismissed, dismiss: dismissComfortOffer } =
    useComfortOfferDismissed();
  const { fontStyle, setFontStyle } = useFontStyle();
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
  // appear once the GRAPH actually has nodes (classified `sources`); a
  // records-only user gets the honest "saved in your records" line (J1), and
  // before any piece at all (or while the check resolves) the invitation —
  // the ribbon never claims patterns it cannot have.
  // Records-only: the user has pieces but none are graph nodes yet — the
  // ribbon line AND its tap destination both follow this state.
  const recordsOnly = dataNodes.length === 0 && hasAnyPiece === true;
  const insight = useMemo(
    () =>
      dataLoadFailed
        ? OFFLINE_INSIGHT[locale]
        : dataNodes.length > 0
          ? pickInsight(locale, Math.floor(Date.now() / 86_400_000))
          : hasAnyPiece === true
            ? RECORDS_ONLY_INSIGHT[locale]
            : FIRST_PIECE_INSIGHT[locale],
    [locale, hasAnyPiece, dataNodes, dataLoadFailed],
  );
  const featuredVillage = useMemo(() => featuredVillageForCards(dataNodes), [dataNodes]);

  // Fetch the user's classified pieces (clipper captures → `sources`) as the
  // tier-4 data dots. Each is placed in the village its tags point to
  // (domainForTags), so uploading + classifying a piece grows the right
  // district, and carries the AI summary + tags so the graph popup can show
  // them on tap. relatedness edges are computed inside NavGraph.
  useEffect(() => {
    if (!userId) {
      const empty: DataNode[] = [];
      dataNodesRef.current = empty;
      setDataNodes(empty);
      setHasAnyPiece(null);
      return;
    }
    const supabase = getSupabaseClient();
    let cancelled = false;
    setDataLoadFailed(false);
    // Two reads settle together: `sources` → the tier-4 graph dots (classified
    // clipper captures); `records` (journal + note, head-only count) → the
    // user's authored pieces. The empty-graph card's emptiness check considers
    // both, so leaving a journal "조각" clears it. audit_response is excluded —
    // it's onboarding-guided Q&A, not a free-form piece.
    // P2-6: supabase responses don't reject — they carry an `error` field —
    // and a true network exception rejects the Promise.all. Both used to fall
    // through silently, leaving hasAnyPiece null and the ribbon claiming the
    // user has no pieces. Surface either as the honest offline state.
    Promise.all([
      supabase
        .from("sources")
        .select("id, title, tags, frontmatter")
        .eq("user_id", userId)
        .order("captured_at", { ascending: false })
        .limit(120),
      supabase
        .from("records")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("kind", ["journal", "note"]),
    ])
      .then(([sourcesRes, recordsRes]) => {
        if (cancelled) return;
        if (sourcesRes.error || recordsRes.error) {
          if (typeof console !== "undefined")
            console.warn(
              "[graph] data load failed",
              sourcesRes.error?.message ?? recordsRes.error?.message,
            );
          setDataLoadFailed(true);
          return;
        }
        const sources = sourcesRes.data ?? [];
        const nextDataNodes = sourceRowsToDataNodes(sources) as DataNode[];
        const stableDataNodes = retainStableDataNodes(dataNodesRef.current, nextDataNodes);
        dataNodesRef.current = stableDataNodes;
        setDataNodes(stableDataNodes);
        setHasAnyPiece(sources.length > 0 || (recordsRes.count ?? 0) > 0);
      })
      .catch((e) => {
        if (cancelled) return;
        if (typeof console !== "undefined") console.warn("[graph] data load threw", (e as Error).message);
        setDataLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, graphReloadKey]);
  useFocusRefetch(() => setGraphReloadKey((k) => k + 1), Boolean(userId));
  const handleGraphFirstInteraction = useCallback(() => {
    setGraphTouched(true);
    // The hint's job is done the moment the graph is touched.
    if (coreHintDismissed === false) dismissCoreHint();
  }, [coreHintDismissed, dismissCoreHint]);

  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  // First run: wait for native persistence before deciding whether to gate.
  if (onboardingComplete === null) return <InlineLoader />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  // First-day TTFV: surface the one-cut self-understanding screen exactly once,
  // within the first day after onboarding. null = native persistence still
  // hydrating (match the onboarding gate's loader, don't flash the graph).
  if (autoTriggerTTFV === null) return <InlineLoader />;
  if (autoTriggerTTFV) return <Redirect href="/ttfv" />;

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

  // P9 → O-R1.3: ONE overview insight card — the Pattern Core spotlight,
  // driven by real graph signals (card-insights.overviewCardSignals). The
  // former SecondB card duplicated the tab-bar /secondb entry and a second
  // SecondB face; cut per Simon's clutter greenlight. Core-named copy
  // (always ends in "코어", a vowel) is josa-safe.
  // (pure + cheap; not memoized — call site sits after an early return so a hook
  // here would violate rules-of-hooks.)
  const cardSignals = overviewCardSignals(dataNodes);
  const spotlightCore = cardSignals.recentCore ?? featuredVillage;
  const spotlightCoreName = VILLAGE_LABEL[spotlightCore][locale];
  const spotlightIsland = VILLAGE_UI[spotlightCore].island;
  const spotlightWorker = VILLAGE_UI[spotlightCore].worker;
  const recentPieceTitle = cardSignals.recentPiece?.title ?? featuredPiece?.title ?? null;
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
  // P2-6: never claim an empty graph while the load FAILED — we don't know.
  // The comfort offer owns the bottom slot until answered (one message per
  // screen): empty card, coach hint and spotlight all wait behind it.
  const showComfortOffer = comfortDismissed === false && fontStyle === "pixel" && !sheetOpen;
  const showingEmptyGraphCard =
    !showComfortOffer && hasAnyPiece === false && emptyDismissed === false && !dataLoadFailed;

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
          onFirstInteraction={handleGraphFirstInteraction}
          onActiveChange={setSheetOpen}
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
                    ? "첫 조각은 기록 보관소에 저장돼요. 링크와 캡처가 연결되면 그래프가 켜져요."
                    : "Your first piece is saved in Records. Links and captures light the graph as they connect."}
                </Text>
              </View>
            </View>
            <PremiumButton
              label={locale === "ko" ? "첫 조각 남기기" : "Leave a first piece"}
              onPress={() => router.push({ pathname: "/capture", params: { entry: "firstRun" } })}
              full
              style={styles.emptyGraphCta}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? "첫 조각 남기기" : "Leave a first piece"}
              accessibilityHint={
                locale === "ko" ? "캡처 화면으로 이동합니다" : "Opens capture to save your first piece"
              }
            />
            <PremiumButton
              label={locale === "ko" ? "먼저 둘러볼게요" : "I'll look around first"}
              variant="ghost"
              onPress={dismissEmptyCard}
              full
              style={styles.emptyGraphSkip}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? "먼저 둘러보기" : "Look around first"}
              accessibilityHint={
                locale === "ko" ? "첫 화면 카드를 닫고 마을을 둘러봅니다" : "Dismisses the first-run card"
              }
            />
          </View>
        </Animated.View>
      ) : null}

      {/* O-R1.3 (Simon greenlight: "과다한 건 의도가 아니다"): the generic
          SecondB card was a third route into /secondb (the tab bar and the
          spotlight card both go there) and a second SecondB face on screen.
          One personalized spotlight card remains — graph stays the primary
          action, the card is the single suggestion, in the thumb zone.
          J1: only once the graph has real nodes — with zero dataNodes the
          card claimed "pieces are gathering in <core>" over an empty graph
          (the records-only first save), a fabricated signal. */}
      {/* B-1 coach hint — nodes exist, graph never touched. Lives in the same
          bottom slot the spotlight card uses (never both: complementary
          graphTouched conditions), so the one-message rule holds. The first
          graph interaction or a tap on the hint dismisses it permanently. */}
      {/* Persona sim v2 P1-1 — one-time appearance offer, highest slot
          priority. Accepting applies the readable font on the spot (the
          change itself is the feedback); both choices dismiss forever and
          the line under the buttons names the way back (설정 > 테마). */}
      {showComfortOffer ? (
        <Animated.View
          style={[
            styles.insightCardStack,
            { opacity: contentOpacity, bottom: insets.bottom + TAB_BAR_HEIGHT + 12 },
          ]}
          pointerEvents="box-none"
        >
          <View style={[styles.insightCard, styles.comfortCard]}>
            {/* The offer itself must be legible to the person it targets -
                this one card renders in the readable face even on pixel default. */}
            <Text style={styles.comfortBody}>
              {locale === "ko"
                ? "글자가 작거나 흐리게 보이면 읽기 쉬운 글꼴로 바꿔드릴게요"
                : "If the letters feel small or dim, I can switch to the readable font"}
            </Text>
            <View style={styles.comfortActions}>
              <PremiumButton
                label={locale === "ko" ? "읽기 쉽게 보기" : "Make it readable"}
                onPress={() => {
                  setFontStyle("readable");
                  dismissComfortOffer();
                }}
                style={styles.comfortButton}
                accessibilityRole="button"
                accessibilityLabel={locale === "ko" ? "읽기 쉽게 보기" : "Make it readable"}
                accessibilityHint={
                  locale === "ko" ? "글꼴이 지금 바로 바뀝니다." : "The font changes right away."
                }
              />
              <PremiumButton
                label={locale === "ko" ? "지금이 좋아요" : "I like it as is"}
                variant="ghost"
                onPress={dismissComfortOffer}
                style={styles.comfortButton}
                accessibilityRole="button"
                accessibilityLabel={locale === "ko" ? "지금이 좋아요" : "I like it as is"}
                accessibilityHint={
                  locale === "ko" ? "이 안내를 닫습니다." : "Closes this offer."
                }
              />
            </View>
            <Text style={styles.comfortFootnote}>
              {locale === "ko"
                ? "설정 > 테마에서 언제든 바꿀 수 있어요"
                : "Change anytime in Settings > Theme"}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {!showComfortOffer && !showingEmptyGraphCard && !graphTouched && !sheetOpen && dataNodes.length > 0 && coreHintDismissed === false ? (
        <Animated.View
          style={[
            styles.insightCardStack,
            { opacity: contentOpacity, bottom: insets.bottom + TAB_BAR_HEIGHT + 12 },
          ]}
          pointerEvents="box-none"
        >
          <HomePressable
            onPress={dismissCoreHint}
            style={[styles.insightCard, styles.coreHintCard]}
            accessibilityRole="button"
            accessibilityLabel={locale === "ko" ? "그래프 안내" : "Graph hint"}
            accessibilityHint={locale === "ko" ? "안내를 닫습니다" : "Closes this hint"}
          >
            <Text style={styles.insightCardBody}>
              {locale === "ko"
                ? "빛나는 코어를 누르면 그 패턴을 가까이 볼 수 있어요"
                : "Tap a glowing core to look closer at that pattern"}
            </Text>
          </HomePressable>
        </Animated.View>
      ) : null}

      {!showComfortOffer && !showingEmptyGraphCard && graphTouched && !sheetOpen && dataNodes.length > 0 ? (
        <Animated.View
          style={[
            styles.insightCardStack,
            { opacity: contentOpacity, bottom: insets.bottom + TAB_BAR_HEIGHT + 12 },
          ]}
          pointerEvents="box-none"
        >
          <HomePressable
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
          </HomePressable>
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
            // P2-6: in the failed state the ribbon promises a retry — tapping
            // must retry, not navigate away from the broken screen.
            if (dataLoadFailed) {
              setGraphReloadKey((k) => k + 1);
              return;
            }
            setCenterSeen(true);
            // J1 carry-over: in the records-only state the ribbon SAYS the
            // piece lives in 기록 보관소, so tapping it must land there -
            // routing to Soul Core right after that sentence was the same
            // promise-break one tap later.
            router.push(recordsOnly ? "/records" : "/core-brain");
          }}
          hitSlop={14}
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={
            dataLoadFailed
              ? locale === "ko" ? "다시 불러오기" : "Retry loading"
              : recordsOnly
                ? locale === "ko" ? "기록 보관소 보기" : "Open my records"
                : locale === "ko" ? "오늘의 중심 보기" : "Open today's center"
          }
          accessibilityHint={
            dataLoadFailed
              ? locale === "ko" ? "그래프 데이터를 다시 불러옵니다" : "Retries loading your graph data"
              : recordsOnly
                ? locale === "ko" ? "기록 보관소 화면으로 이동합니다" : "Opens the records archive"
                : locale === "ko" ? "소울 코어 화면으로 이동합니다" : "Opens Soul Core"
          }
        >
          {/* KO "오늘의 중심" reads worse when tracked + uppercased, so KO drops
              tracking to 0 and stays sentence-case; EN keeps the stylized
              uppercase eyebrow. */}
          <Text style={[styles.insightEyebrow, locale === "ko" ? styles.insightEyebrowKo : styles.insightEyebrowEn]}>
            {locale === "ko" ? "오늘의 중심" : "Today's center"}
          </Text>
          {/* P2-11: at 200% font scale the 2-line clamp ellipsized exactly the
              actionable clause of the records-only/offline lines. Three lines
              keeps the ribbon one message while surviving large type. */}
          <Text style={styles.insightText} numberOfLines={3}>
            {insight}
          </Text>
        </Pressable>
      </Animated.View>

      {/* O-31 Stage③ (nav-contract §3): in deep-space mode the graph IS the
          그래프 primary (reached via /graph from the shell). Surface its
          second-tier — 위키 /wiki · 기록 /records · 리서치 /research — as a
          bottom strip so all three are reachable directly (누락 0). Gated on
          isDeepSpaceUI() so legacy "/" (the same GraphScreen) is untouched. */}
      {isDeepSpaceUI() ? (
        <View
          style={[styles.deepSpaceGraphNav, { bottom: insets.bottom + TAB_BAR_HEIGHT + 12 }]}
          pointerEvents="box-none"
        >
          <DeepSpaceLinks
            groups={[
              {
                title: locale === "ko" ? "그래프" : "Graph",
                items: [
                  { key: "wiki", label: locale === "ko" ? "위키" : "Wiki", route: "/wiki" },
                  { key: "records", label: locale === "ko" ? "기록" : "Records", route: "/records" },
                  { key: "research", label: locale === "ko" ? "리서치" : "Research", route: "/research" },
                ],
              },
              {
                // IA (ops-ia §1): single home entry into the assistant (Ops).
                // /ops is the hub; no duplicate entry (dedup).
                title: locale === "ko" ? "비서" : "Assistant",
                items: [
                  { key: "ops", label: locale === "ko" ? "오늘의 루틴" : "Today", route: "/ops" },
                  { key: "growth", label: locale === "ko" ? "나의 변화" : "My change", route: "/growth" },
                  { key: "import", label: locale === "ko" ? "가져오기" : "Import", route: "/import-hub" },
                ],
              },
            ]}
          />
        </View>
      ) : null}

      <PowerOnOverlay />

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
  // O-31 Stage③: deep-space graph second-tier strip (nav-contract §3). Sits
  // above the tab bar; only mounted when isDeepSpaceUI() (legacy "/" untouched).
  deepSpaceGraphNav: { position: "absolute", left: 10, right: 10, zIndex: 26 },
  skyLogo: {
    position: "absolute",
    width: 220,
    height: 220,
    top: "50%",
    left: "50%",
    marginStart: -110,
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
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: 14,
    maxWidth: 380,
    width: "100%",
    ...pixelShadowStyle(),
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
  emptyGraphSkip: { marginTop: 6 },
  emptyGraphTitle: {
    color: cosmic.moonWhite,
    fontSize: typography.sizes.md,
    fontWeight: "700",
    fontFamily: fontFamilies.pixelKo,
  },
  emptyGraphBody: {
    color: cosmic.mistGray,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fontFamilies.readable,
  },
  emptyGraphCta: {
    marginTop: 8,
  },
  insightCardStack: {
    position: "absolute",
    left: 10,
    right: 10,
    gap: 10,
    zIndex: 24,
  },
  // B-1 coach hint: same card voice, single-line weight (no 74px presence —
  // it must read as a whisper next to the graph, not a competing surface).
  comfortCard: {
    gap: spacing.sm,
  },
  comfortBody: {
    color: cosmic.moonWhite,
    fontFamily: fontFamilies.readable,
    fontSize: 16,
    lineHeight: 23,
  },
  comfortActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  comfortButton: {
    flexGrow: 1,
  },
  comfortFootnote: {
    color: cosmic.mistGray,
    fontSize: 12,
  },
  coreHintCard: {
    minHeight: 0,
    justifyContent: "center",
    paddingVertical: 8,
  },
  insightCard: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: withAlpha(cosmic.insightSurface, 0.94),
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...pixelShadowStyle(cosmic.signalMint),
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
    fontFamily: fontFamilies.pixelKo,
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
    fontFamily: fontFamilies.pixelKo,
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
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: withAlpha(cosmic.space950, 0.62),
    ...pixelShadowStyle(),
  },
  // SecondB sprite frame. Same 52px footprint across idle/sleep states.
  mascotSlot: {
    width: 52,
    height: 52,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: withAlpha(cosmic.soulViolet, 0.16),
    alignItems: "center",
    justifyContent: "center",
    ...pixelShadowStyle(cosmic.coreGlow),
  },
  insightEyebrow: {
    color: cosmic.signalMint,
    // KO "오늘의 중심" must stay legible: keep >=12px. Tracking + uppercase are
    // applied per-locale below so the Korean label is not over-spaced.
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: fontFamilies.pixelKo,
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
    fontFamily: fontFamilies.readable,
  },
});
