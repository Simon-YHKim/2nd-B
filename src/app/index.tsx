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
import { SecondBFab, SecondBSprite } from "@/components/art/SecondBSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { domainForTags } from "@/lib/graph/relatedness";
import { secondbPresence, SLEEP_AFTER_MS } from "@/lib/companion/fab-state";
import { StarNoiseLayer } from "@/components/premium";

const logo = require("../../public/assets/2ndb-refine/auth/loading_core_orb_premium.png");

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
  const onboardingComplete = useOnboardingComplete();
  const insets = useSafeAreaInsets();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const skyOverlay = useSkyDrift();

  const [dataNodes, setDataNodes] = useState<DataNode[]>([]);

  // Highlight-on-return (queue B): a record / wiki detail can deep-link back
  // to the graph and ask it to focus a specific node.
  const params = useLocalSearchParams<{ highlight?: string; highlightWikiPageId?: string; highlightRecordId?: string }>();
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
  const [emptyDismissed, setEmptyDismissed] = useState(false);
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

  const entryProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entryProgress, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [entryProgress]);

  const logoScale = entryProgress.interpolate({ inputRange: [0, 1], outputRange: [4, 2] });
  // Entry flourish only (refine-v2 #7): the logo fades fully OUT as the
  // village fades in, instead of staying as a fixed centered watermark that
  // didn't track zoom/village scale. The premium islands carry the screen.
  const logoOpacity = entryProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 0] });
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
      .select("id, title, tags")
      .eq("user_id", userId)
      .limit(120)
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          setDataNodes(
            res.data.map((p) => {
              const tags = (p.tags ?? []) as string[];
              // Place each piece in the village its tags point to (no longer
              // hardcoded to wiki-daily), so adding data grows the right
              // district. relatedness edges are computed inside NavGraph.
              return {
                id: p.id,
                title: p.title,
                parentId: domainForTags(tags, p.title),
                tags,
              };
            }),
          );
        }
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

  return (
    <View style={styles.skyContainer}>
      <Animated.Image
        source={logo}
        style={[styles.skyLogo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        resizeMode="contain"
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: skyOverlay }]} />

      <Animated.View style={[styles.contentLayer, { opacity: contentOpacity }]} pointerEvents="box-none">
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
      {dataNodes.length === 0 && !emptyDismissed ? (
        <Animated.View style={[styles.emptyGraphWrap, { opacity: contentOpacity }]} pointerEvents="box-none">
          <View style={styles.emptyGraphCard}>
            {/* Close — lets the user dismiss and browse the empty village. */}
            <Pressable
              onPress={() => setEmptyDismissed(true)}
              hitSlop={12}
              style={styles.emptyGraphClose}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? "닫고 둘러보기" : "Dismiss and look around"}
            >
              <Text style={styles.emptyGraphCloseText}>✕</Text>
            </Pressable>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <IslandArt id="core" size={180} />
            </View>
            <Text style={styles.emptyGraphTitle}>{locale === "ko" ? "아직 마을이 조용해요" : "The village is quiet"}</Text>
            <Text style={styles.emptyGraphBody}>
              {locale === "ko" ? "첫 조각을 남기면 길이 조금씩 켜져요." : "Leave a first piece and the roads light up."}
            </Text>
            <Pressable onPress={() => router.push({ pathname: "/journal", params: { entry: "firstRun" } })} style={styles.emptyGraphCta}>
              <Text style={styles.emptyGraphCtaText}>{locale === "ko" ? "첫 조각 남기기" : "Leave a first piece"}</Text>
            </Pressable>
            <Pressable onPress={() => setEmptyDismissed(true)} hitSlop={8} style={styles.emptyGraphSkip}>
              <Text style={styles.emptyGraphSkipText}>{locale === "ko" ? "먼저 둘러볼게요" : "I'll look around first"}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Top insight ribbon — Core Brain talks. The slot on the left
          is reserved for a future mascot avatar; for now it shows a
          subtle initial circle so the layout doesn't reflow when the
          asset lands. */}
      <Animated.View style={[styles.insightRibbon, { opacity: contentOpacity, top: Math.max(insets.top + 8, 18) }]} pointerEvents="box-none">
        {/* SecondB placeholder — soul-violet pixel block with a mint core.
            Same 52px footprint the eventual sprite will occupy. */}
        <View style={styles.mascotSlot} accessibilityLabel="SecondB">
          <SecondBSprite state={presence.mascot === "sleep" ? "sleep" : "idle"} size={46} float={presence.mascot !== "sleep"} />
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
          <Text style={styles.insightEyebrow}>{locale === "ko" ? "오늘의 중심" : "Today's center"}</Text>
          <Text style={styles.insightText} numberOfLines={2}>{insight}</Text>
        </Pressable>
      </Animated.View>

      {/* Top-right cluster removed (graph-ux #2/#4): language is auto-detected
          and lives in Settings; Settings is reachable from the Profile tab.
          The main graph keeps a clean top so 오늘의 중심 sits at the very top. */}

      {/* Bottom-right floating chat (세컨비 / 2ndB) entry — moved out
          of the constellation bubble per user directive (2026-05-28).
          Single circular FAB, plenty of safe-area margin. */}
      <Animated.View style={[styles.jarvisFabWrap, { opacity: contentOpacity }]}>
        <Pressable
          onPress={() => {
            wake();
            setCenterSeen(true);
            router.push("/jarvis");
          }}
          hitSlop={16}
          style={styles.jarvisFab}
          accessibilityLabel={locale === "ko" ? "세컨비에게 묻기" : "Ask SecondB"}
        >
          {/* SecondB v2 FAB sprite — default / notification / chat_ready. */}
          <SecondBFab fabState={presence.fab} size={48} />
        </Pressable>
      </Animated.View>
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
    width: 220, height: 220,
    top: "50%", left: "50%",
    marginLeft: -110, marginTop: -110,
  },
  contentLayer: { ...StyleSheet.absoluteFill as object },
  emptyGraphWrap: {
    position: "absolute",
    left: 0, right: 0, bottom: 96,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyGraphCard: {
    alignItems: "center",
    backgroundColor: "rgba(13,21,48,0.88)",
    borderColor: "rgba(141,152,184,0.28)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    maxWidth: 360,
  },
  emptyGraphClose: { position: "absolute", top: 8, right: 10, padding: 6, zIndex: 2 },
  emptyGraphCloseText: { color: cosmic.mistGray, fontSize: 16, fontFamily: fontFamilies.sans },
  emptyGraphSkip: { marginTop: 10, paddingVertical: 6 },
  emptyGraphSkipText: { color: cosmic.mistGray, fontSize: 13, fontFamily: fontFamilies.sans },
  emptyGraphTitle: { color: cosmic.moonWhite, fontSize: 16, fontWeight: "700", marginTop: 8, fontFamily: fontFamilies.sans },
  emptyGraphBody: { color: cosmic.mistGray, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 4, fontFamily: fontFamilies.sans },
  emptyGraphCta: {
    marginTop: 14,
    backgroundColor: cosmic.signalMint,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  emptyGraphCtaText: { color: cosmic.space950, fontWeight: "700", fontSize: 14, fontFamily: fontFamilies.sans },
  insightRibbon: {
    position: "absolute",
    top: 12, left: 12, right: 12,
    maxWidth: 600,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  // SecondB placeholder — soul-violet block with a mint signal core.
  // Same 52px footprint the eventual pixel sprite will occupy.
  mascotSlot: {
    width: 52,
    height: 52,
    borderRadius: 12, // square-ish, pixel-block feel rather than round avatar
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
    fontSize: 10,
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
    top: 16, right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  localeBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
  },
  localeToggleText: {
    color: cosmic.mistGray,
    fontSize: 12, letterSpacing: 1.5, fontWeight: "700",
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
  jarvisFabWrap: {
    position: "absolute",
    // Sits above the premium bottom tab bar (TAB_BAR_HEIGHT + inset margin).
    bottom: 96, right: 20,
  },
  // SecondB FAB — soul-violet body, mint glow. Square-ish pixel block,
  // not a round avatar, so it reads as a pixel resident rather than a
  // chat button (handoff §5 + §7-1 floating-b).
  jarvisFab: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.55)",
    backgroundColor: "rgba(167,139,250,0.22)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  // Inner pixel sprite stand-in — small violet square with a mint core.
  // Replaced by a real Image when the sprite sheet lands (Phase 3).
  jarvisFabSprite: {
    width: 26,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: cosmic.space950,
    backgroundColor: cosmic.soulViolet,
    alignItems: "center",
    justifyContent: "center",
  },
  jarvisFabSpriteCore: {
    width: 6,
    height: 6,
    borderRadius: 1.5,
    backgroundColor: cosmic.signalMint,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.85,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
