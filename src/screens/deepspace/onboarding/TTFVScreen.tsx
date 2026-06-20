// First-day TTFV "첫날 자기이해 한 컷" (first-day self-understanding) onboarding.
// A single deep-space screen with TWO internal states (propose -> ratify): it
// surfaces ONE self-understanding insight via one of the 북두칠성 7 stars and
// lets the user ratify it. Brightness (L1->L2) rises only on explicit ratify, so
// this is a propose->ratify gesture, not an auto-write.
//
// ONE message + ONE graphic per state (Information Density rule). Visual Tier
// System is enforced in the constellation: Tier 1 북극성(Soul Core) dominates
// (largest, max bloom, soul/violet); Tier 2 is the single lit star (cyan, soft
// bloom); Tier 3 is the six receded stars (small, low opacity). All links cyan.
//
// No LLM call: the insight is static prop data (the AI scoring slots in later).
// deepSpace.* tokens only, inline EN/KO COPY like ImportHubScreen (no locales).

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbStatusHeader } from "@/components/deepspace";

/**
 * One ratifiable self-understanding insight. Static prop data for now; the real
 * per-user scoring (which star, which phrase, what evidence) slots in later.
 */
export interface TTFVInsight {
  /** Which of the 7 lenses the lit star represents (display). */
  starKo: string;
  starEn: string;
  /** The pattern phrase, cyan-highlighted in the insight line. */
  phraseKo: string;
  phraseEn: string;
  /** Evidence shown only after ratify (progressive disclosure). */
  reasonKo: string;
  reasonEn: string;
  /** Which dipper star (0..6) is lit. */
  litIndex: number;
}

const DEFAULT_INSIGHT: TTFVInsight = {
  starKo: "관계",
  starEn: "Relationship",
  phraseKo: "먼저 다가가 살피는",
  phraseEn: "reaching-out, attentive",
  reasonKo: "첫 기록에서 사람·마음을 살피는 말이 자주 보였어요",
  reasonEn: "Your first notes often reached toward people and how they feel",
  litIndex: 3,
};

// The 북두칠성 (Big Dipper): 3 handle stars + a 4-star bowl, fixed positions in
// the 300x300 viewBox. litIndex only changes which star glows, not the shape.
const D = {
  alkaid: { x: 58, y: 196 }, // handle tip
  mizar: { x: 95, y: 210 },
  alioth: { x: 130, y: 214 },
  megrez: { x: 166, y: 210 }, // bowl top-left / handle junction (default lit)
  phecda: { x: 176, y: 250 }, // bowl bottom-left
  merak: { x: 224, y: 244 }, // bowl bottom-right
  dubhe: { x: 212, y: 204 }, // bowl top-right
} as const;
const DIPPER = [D.alkaid, D.mizar, D.alioth, D.megrez, D.phecda, D.merak, D.dubhe];
const DIPPER_POINTS = DIPPER.map((s) => `${s.x},${s.y}`).join(" ");

const SOUL = { x: 150, y: 50 }; // 북극성 Soul Core — top center, Tier 1
const VIEWBOX = 300;
const LEVEL_TAG = "L1 → L2";

type Phase = "propose" | "ratify";

interface TTFVScreenProps {
  insight?: TTFVInsight;
}

export function TTFVScreen({ insight = DEFAULT_INSIGHT }: TTFVScreenProps) {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const t = (k: string) => COPY(ko)[k] ?? k;

  const [phase, setPhase] = useState<Phase>("propose");
  const [size, setSize] = useState(VIEWBOX);
  const bloom = useRef(new Animated.Value(0)).current;

  // Ratify brightens the lit star one level with a calm fade + bloom (no bounce).
  useEffect(() => {
    if (phase !== "ratify") return;
    const anim = Animated.timing(bloom, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop(); // cancel on unmount (no zombie animation)
  }, [phase, bloom]);

  const clamped = Math.min(Math.max(Math.round(insight.litIndex), 0), DIPPER.length - 1);
  const lit = DIPPER[clamped] ?? D.megrez;
  const star = ko ? insight.starKo : insight.starEn;
  const phrase = ko ? insight.phraseKo : insight.phraseEn;
  const reason = ko ? insight.reasonKo : insight.reasonEn;
  const starLow = star.toLowerCase();

  const caption = ko ? `${star}의 별이 켜졌어요` : `Your ${starLow} star lit up`;
  const ratifyTitle = ko ? `${star}의 별이 한 칸 밝아졌어요.` : `Your ${starLow} star brightened one step.`;
  const exploreLabel = ko ? `${star}의 별 더 알아가기` : `Explore your ${starLow} star`;

  const overlayStyle = {
    opacity: bloom,
    transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
  };

  return (
    <SafeAreaView style={styles.frame} edges={["top", "bottom"]}>
      <View style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.backRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        </View>

        <SecondbStatusHeader
          text={phase === "propose" ? t("headProposeText") : t("headRatifyText")}
          tip={phase === "propose" ? t("headProposeTip") : t("headRatifyTip")}
        />

        {/* ONE graphic: the constellation IS the explanation. */}
        <View
          style={styles.stage}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.round(w) !== size) setSize(Math.round(w));
          }}
          accessible
          accessibilityLabel={t("graphicLabel")}
        >
          <Svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} width={size} height={size}>
            {/* Faint cyan links (all links cyan). */}
            <Line x1={SOUL.x} y1={SOUL.y + 16} x2={lit.x} y2={lit.y - 10} stroke={deepSpace.cardLine} strokeWidth={1} strokeDasharray="3 5" />
            <Polyline points={DIPPER_POINTS} fill="none" stroke={deepSpace.cardLine} strokeWidth={1} />
            <Line x1={D.dubhe.x} y1={D.dubhe.y} x2={D.megrez.x} y2={D.megrez.y} stroke={deepSpace.cardLine} strokeWidth={1} />

            {/* Tier 1 — 북극성 Soul Core: dominant, max bloom, soul/violet. */}
            <Circle cx={SOUL.x} cy={SOUL.y} r={46} fill={deepSpace.soul} opacity={0.07} />
            <Circle cx={SOUL.x} cy={SOUL.y} r={33} fill={deepSpace.soul} opacity={0.13} />
            <Circle cx={SOUL.x} cy={SOUL.y} r={22} fill={deepSpace.soul} opacity={0.26} />
            <Circle cx={SOUL.x} cy={SOUL.y} r={15} fill={deepSpace.soulDeep} opacity={0.9} />
            <Circle cx={SOUL.x} cy={SOUL.y} r={11} fill={deepSpace.soul} stroke={deepSpace.soulLine} strokeWidth={1} />

            {/* Tier 3 — the six receded stars. */}
            {DIPPER.map((s, i) =>
              i === clamped ? null : <Circle key={`dim-${i}`} cx={s.x} cy={s.y} r={3.2} fill={deepSpace.accentDim} opacity={0.5} />,
            )}

            {/* Tier 2 — the lit star at L1: cyan, soft bloom. */}
            <Circle cx={lit.x} cy={lit.y} r={14} fill={deepSpace.accent} opacity={0.16} />
            <Circle cx={lit.x} cy={lit.y} r={8.5} fill={deepSpace.accentSoft} opacity={0.3} />
            <Circle cx={lit.x} cy={lit.y} r={4.6} fill={deepSpace.accentBright} />
          </Svg>

          {/* Ratify overlay — same lit star one level brighter (bigger bloom +
              brighter core + rays). Fades + blooms in over the base. */}
          <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
            <Svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} width={size} height={size}>
              <Circle cx={lit.x} cy={lit.y} r={24} fill={deepSpace.accent} opacity={0.2} />
              <Circle cx={lit.x} cy={lit.y} r={14} fill={deepSpace.accentSoft} opacity={0.4} />
              <Circle cx={lit.x} cy={lit.y} r={6.2} fill={deepSpace.accentBright} />
              <Line x1={lit.x} y1={lit.y - 9} x2={lit.x} y2={lit.y - 18} stroke={deepSpace.accentSoft} strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
              <Line x1={lit.x} y1={lit.y + 9} x2={lit.x} y2={lit.y + 18} stroke={deepSpace.accentSoft} strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
              <Line x1={lit.x + 9} y1={lit.y} x2={lit.x + 18} y2={lit.y} stroke={deepSpace.accentSoft} strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
              <Line x1={lit.x - 9} y1={lit.y} x2={lit.x - 18} y2={lit.y} stroke={deepSpace.accentSoft} strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
            </Svg>
            <View style={[styles.levelTag, { left: `${(lit.x / VIEWBOX) * 100}%`, top: `${(lit.y / VIEWBOX) * 100}%` }]}>
              <Text style={styles.levelTagText}>{LEVEL_TAG}</Text>
            </View>
          </Animated.View>
        </View>

        {phase === "propose" ? (
          <View style={styles.block}>
            <Text style={styles.caption}>{caption}</Text>
            {/* ONE message: the insight line, with the pattern phrase in cyan. */}
            <Text style={styles.insight}>
              {ko ? "너에게선 " : "A "}
              <Text style={styles.insightHi}>{phrase}</Text>
              {ko ? " 결이 보여요." : " pattern shows in you."}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("affirm")} onPress={() => setPhase("ratify")} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{t("affirm")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("differ")} onPress={() => router.back()} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>{t("differ")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.block}>
            {/* ONE message for the ratify state. */}
            <Text style={styles.ratifyTitle}>{ratifyTitle}</Text>
            <Text style={styles.ratifySub}>{t("ratifySub")}</Text>
            {/* 근거 — progressive disclosure: evidence appears only after ratify. */}
            <View style={styles.reasonCard}>
              <Text style={styles.reasonLabel}>{t("why")}</Text>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
            {/* The lit star is the relationship lens (DEFAULT_INSIGHT); its deep
                dive is /attachment (RelationalLensView), the relationship-lens detail. */}
            <Pressable accessibilityRole="button" accessibilityLabel={exploreLabel} onPress={() => router.push("/attachment")} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{exploreLabel}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function COPY(ko: boolean): Record<string, string> {
  return ko
    ? {
        back: "뒤로",
        graphicLabel: "북극성과 북두칠성 별자리, 한 별이 켜져 있어요",
        headProposeText: "오늘, 너의 첫 별이 하나 보였어요.",
        headProposeTip: "맞으면 별이 한 칸 밝아져요.",
        headRatifyText: "좋아요. 별 하나가 더 또렷해졌어요.",
        headRatifyTip: "별자리는 알아갈수록 자라요.",
        affirm: "맞아요",
        differ: "조금 달라요",
        ratifySub: "알아갈수록 너의 별자리가 또렷해져요.",
        why: "근거",
      }
    : {
        back: "Back",
        graphicLabel: "The north star and the seven-star dipper, with one star lit",
        headProposeText: "Today, your first star showed itself.",
        headProposeTip: "If it fits, the star brightens one step.",
        headRatifyText: "Nice. One star is clearer now.",
        headRatifyTip: "Your constellation grows as you go.",
        affirm: "That's right",
        differ: "A little different",
        ratifySub: "The more you learn, the clearer your constellation becomes.",
        why: "WHY",
      };
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: deepSpace.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 220, backgroundColor: deepSpace.bgGlow, opacity: 0.5 },
  scroll: { padding: deepSpaceSpacing.lg, paddingBottom: 48, gap: deepSpaceSpacing.md },

  backRow: { flexDirection: "row", alignItems: "center" },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: deepSpace.accentBright, fontSize: 24, lineHeight: 28 },

  stage: { width: "100%", maxWidth: VIEWBOX, aspectRatio: 1, alignSelf: "center", position: "relative", marginTop: deepSpaceSpacing.sm },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  levelTag: {
    position: "absolute",
    marginLeft: 14,
    marginTop: -12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.sm,
    backgroundColor: deepSpace.card,
  },
  levelTagText: { fontFamily: fontFamilies.pixelEn, fontSize: 8, letterSpacing: 0.5, color: deepSpace.accentSoft, lineHeight: 12 },

  block: { gap: deepSpaceSpacing.sm, marginTop: deepSpaceSpacing.xs },
  caption: { fontFamily: fontFamilies.sans, fontSize: 13, lineHeight: 19, color: deepSpace.textLo, textAlign: "center" },
  insight: { fontFamily: fontFamilies.sans, fontSize: 19, lineHeight: 29, color: deepSpace.textHi, textAlign: "center", marginBottom: deepSpaceSpacing.xs },
  insightHi: { fontFamily: fontFamilies.sans, fontWeight: "700", color: deepSpace.accentSoft },

  ratifyTitle: { fontFamily: fontFamilies.sans, fontSize: 19, lineHeight: 28, fontWeight: "700", color: deepSpace.textHi, textAlign: "center" },
  ratifySub: { fontFamily: fontFamilies.sans, fontSize: 14, lineHeight: 21, color: deepSpace.textMid, textAlign: "center", marginBottom: deepSpaceSpacing.xs },
  reasonCard: { padding: deepSpaceSpacing.md, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card, gap: 6 },
  reasonLabel: { fontFamily: fontFamilies.pixelKo, fontSize: 9, letterSpacing: 1, color: deepSpace.accentSoft },
  reasonText: { fontFamily: fontFamilies.sans, fontSize: 14, lineHeight: 21, color: deepSpace.textMid },

  primaryBtn: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.accent, marginTop: deepSpaceSpacing.xs },
  primaryText: { fontFamily: fontFamilies.pixelKo, fontSize: 15, color: deepSpace.onAccent, paddingHorizontal: deepSpaceSpacing.md, textAlign: "center" },
  secondaryBtn: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, borderWidth: 1, borderColor: deepSpace.cardLineStrong, backgroundColor: deepSpace.card },
  secondaryText: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.accentSoft },
  pressed: { opacity: 0.85 },
});
