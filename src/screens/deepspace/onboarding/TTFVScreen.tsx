// First-day TTFV "첫 통찰 · First Light" — rebuilt 1:1 from the finalized
// reference (docs/clone-audit/reference-handoff/reference-app/sb-ops.jsx ·
// FirstInsight) + the 03-ttfv.png capture (pixel target). A single deep-space
// screen with TWO internal states (propose -> ratify): it surfaces ONE self-
// understanding insight from one of the 북두칠성 7 domain stars and lets the user
// ratify it. Brightness (L1->L2) rises only on explicit ratify — a propose->
// ratify gesture, not an auto-write.
//
// Per rev2 PRD v2.0 "레이아웃 자유, 의미 고정" the FIXED invariants are preserved:
// both answers ratify (the correction is itself a signal), each answer appends a
// first_light-tagged record so the ratify ledger keeps the moment, and there is
// NO LLM call (the insight is static prop data; the AI scoring slots in later).
//
// ONE message + ONE graphic per state (Information Density). Visual Tier System:
// 북극성 (Tier C) dominates — white core + violet bloom; the lit 관계 star (Tier A)
// is cyan and recedes below it; the third node is dim. All links are cyan.

import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line } from "react-native-svg";

import { deepSpace, deepSpaceSpacing, flattenAlpha, withAlpha } from "@/lib/theme/tokens";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { m3 } from "@/lib/theme/m3";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { DeepSpaceBackdrop } from "@/components/deepspace/DeepSpaceBackdrop";
import { SbIcon } from "@/components/deepspace/shell/SbIcon";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { isAvailableUiLocale, systemLocaleFor, type AvailableUiLocale } from "@/lib/i18n/locales";

/**
 * One ratifiable self-understanding insight. Static prop data for now; the real
 * per-user scoring (which star, which phrase, what evidence) slots in later.
 */
export interface TTFVInsight {
  /** Which of the 7 lenses the lit star represents (display). */
  starKo: string;
  starEn: string;
  /** The pattern phrase, highlighted in the insight line. */
  phraseKo: string;
  phraseEn: string;
}

// With no `insight` prop the screen falls back to ds.ttfv.defaultInsight.*, which
// ships in all five locales. The prop still carries its own starKo/starEn pair for
// the day real per-user scoring supplies one.

// The first-star suggestion is a starting point, NOT derived from real answers
// (sign-up collects no personality questions), so we never fabricate the user's
// words. These honest grounds say it's a light first read that firms up over time.
const EVIDENCE: { qKey: string; aKey: string }[] = [
  { qKey: "ds.ttfv.evidence1.q", aKey: "ds.ttfv.evidence1.a" },
  { qKey: "ds.ttfv.evidence2.q", aKey: "ds.ttfv.evidence2.a" },
];

const RECORD_COPY: Record<AvailableUiLocale, { prefix: string; affirm: string; soft: string }> = {
  en: {
    prefix: "First light",
    affirm: "that's right",
    soft: "feels a little different",
  },
  ko: {
    prefix: "첫 통찰",
    affirm: "맞아요",
    soft: "조금 다르게 느껴요",
  },
  es: {
    prefix: "Primera luz",
    affirm: "es cierto",
    soft: "se siente un poco diferente",
  },
  pt: {
    prefix: "Primeira luz",
    affirm: "faz sentido",
    soft: "parece um pouco diferente",
  },
  id: {
    prefix: "Cahaya pertama",
    affirm: "itu benar",
    soft: "terasa sedikit berbeda",
  },
};

function uiLocaleFor(language: string | undefined): AvailableUiLocale {
  const candidate = language?.toLowerCase().split("-")[0];
  return isAvailableUiLocale(candidate) ? candidate : "en";
}

// Constellation stage (fixed box): 북극성 top-centre, the lit 관계 star bottom-
// left, a dim third node bottom-right — the small triangle the capture shows.
const STAGE_W = 220;
const STAGE_H = 150;
const POLARIS = { x: 110, y: 34 };
const GWANGE = { x: 58, y: 104 };
const DIM = { x: 162, y: 104 };

type Phase = "propose" | "ratify";

interface TTFVScreenProps {
  insight?: TTFVInsight;
}

/**
 * 별 발광 색 — 원래 `opacity` 로 겹쳐 만들던 것을 **미리 합성해 둔다**(규칙 4).
 * 바닥은 이 무대가 앉은 딥스페이스 바닥색이다.
 */
const TTFV_GROUND = deepSpace.bgEdge;
const TTFV_DIM_FILL = flattenAlpha(deepSpace.accentDim, 0.5, TTFV_GROUND);
const TTFV_HALO_FILL = flattenAlpha(deepSpace.accent, 0.16, TTFV_GROUND);
const TTFV_MID_FILL = flattenAlpha(deepSpace.accentSoft, 0.34, TTFV_GROUND);
const TTFV_POLARIS_HALO = flattenAlpha(m3.accent.polaris, 0.14, TTFV_GROUND);
const TTFV_POLARIS_MID = flattenAlpha(m3.accent.polaris, 0.26, TTFV_GROUND);

export function TTFVScreen({ insight }: TTFVScreenProps) {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const uiLocale = uiLocaleFor(i18n.language);
  const { userId, isMinor } = useAuth();

  const [phase, setPhase] = useState<Phase>("propose");
  const [soft, setSoft] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotionPref();

  // Gentle 북극성 pulse (reference sb-pulse 2.4s). Single node, native driver.
  // Reduce-motion (OS pref or lite mode): hold a static mid-frame, no loop.
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: pixelStepsFor(1200), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: pixelStepsFor(1200), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  // Spec 03: both answers ratify (the star lights either way — a correction is
  // still a signal). The answer is kept as a first_light-tagged record so the
  // moment lands in the ledger; the honest brightness engine stays untouched (it
  // counts records, and this IS one). Fire-and-forget: a save hiccup must never
  // block the first-light moment.
  const ratify = (softAnswer: boolean) => {
    setSoft(softAnswer);
    setPhase("ratify");
    if (!userId) return;
    const phraseText = insight ? (ko ? insight.phraseKo : insight.phraseEn) : t("ds.ttfv.defaultInsight.phrase");
    const recordCopy = RECORD_COPY[uiLocale];
    void createRecord({
      userId,
      locale: systemLocaleFor(i18n.language),
      minor: isMinor === true,
      kind: "note",
      body: `${recordCopy.prefix}: "${phraseText}" - ${softAnswer ? recordCopy.soft : recordCopy.affirm}`,
      withFollowup: false,
      tags: ["first_light", softAnswer ? "first_light:soft" : "first_light:affirm"],
    }).catch(() => {});
  };

  const star = insight ? (ko ? insight.starKo : insight.starEn) : t("ds.ttfv.defaultInsight.star");
  const phrase = insight ? (ko ? insight.phraseKo : insight.phraseEn) : t("ds.ttfv.defaultInsight.phrase");

  const pulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }],
  };

  return (
    <SafeAreaView style={styles.frame} edges={["top", "bottom"]}>
      <DeepSpaceBackdrop />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Eyebrow + page title (centred, no back button / no companion bubble). */}
        <Text variant="caption" style={styles.eyebrow}>{t("ds.ttfv.eyebrow")}</Text>
        <Text variant="heading" style={styles.pageTitle}>
          {t("ds.ttfv.pageTitle")}
        </Text>

        {/* ONE graphic: the small constellation IS the explanation. */}
        <View style={styles.stage} accessible accessibilityLabel={t("ds.ttfv.stageA11y")}>
          <Animated.View style={[styles.polarisPulse, pulseStyle]} pointerEvents="none" />
          <Svg width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
            {/* Cyan links (all links cyan). */}
            <Line x1={POLARIS.x} y1={POLARIS.y} x2={GWANGE.x} y2={GWANGE.y} stroke={deepSpace.cardLine} strokeWidth={1} />
            <Line x1={POLARIS.x} y1={POLARIS.y} x2={DIM.x} y2={DIM.y} stroke={deepSpace.cardLine} strokeWidth={1} />
            <Line x1={GWANGE.x} y1={GWANGE.y} x2={DIM.x} y2={DIM.y} stroke={deepSpace.cardLine} strokeWidth={1} strokeDasharray="3 5" />

            {/* 별은 원이 아니라 **4방향으로 빛나는 rect 별**이다(Simon 결정 2026-08-21,
                PIXEL-CLAY 규칙 1). 발광은 알파를 겹치던 것 → 미리 합성한 색 층
                (규칙 4). 밝기의 층위(Tier)는 그대로다 — 북극성이 가장 크고 밝다. */}
            {/* Tier: receding third node. */}
            <PixelStarSvg cx={DIM.x} cy={DIM.y} r={3.4} fill={TTFV_DIM_FILL} />

            {/* Tier A: the lit star (cyan, soft bloom). Brightens on ratify. */}
            <PixelStarSvg cx={GWANGE.x} cy={GWANGE.y} r={phase === "ratify" ? 15 : 11} fill={TTFV_HALO_FILL} />
            <PixelStarSvg cx={GWANGE.x} cy={GWANGE.y} r={phase === "ratify" ? 9 : 7} fill={TTFV_MID_FILL} />
            <PixelStarSvg cx={GWANGE.x} cy={GWANGE.y} r={phase === "ratify" ? 5.2 : 4.2} fill={deepSpace.accentBright} />

            {/* Tier C: 북극성 — dominant, white core + violet bloom. */}
            <PixelStarSvg cx={POLARIS.x} cy={POLARIS.y} r={16} fill={TTFV_POLARIS_HALO} />
            <PixelStarSvg cx={POLARIS.x} cy={POLARIS.y} r={9} fill={TTFV_POLARIS_MID} />
            <PixelStarSvg cx={POLARIS.x} cy={POLARIS.y} r={6} fill={deepSpace.textHi} />
          </Svg>
          <Text variant="caption" style={[styles.starLabel, styles.polarisLabel]}>{t("home:ds.home.polaris")}</Text>
          <Text variant="caption" numberOfLines={1} style={[styles.starLabel, styles.gwangeLabel]}>{star}</Text>
        </View>

        {phase === "propose" ? (
          <View style={styles.block}>
            {/* 세컨비 head sits in the middle, above the question (gentle bob). */}
            <SecondbHead size={84} mood="neutral" track={false} accessibilityLabel={t("ds.ttfv.secondbName")} />

            <Text variant="body" style={styles.insight}>
              {t("ds.ttfv.insightLead")}
              <Text variant="body" style={styles.insightHi}>{ko ? `‘${phrase}’` : phrase}</Text>
              {t("ds.ttfv.insightTail")}
            </Text>
            <Text variant="body" style={styles.sub}>
              {t("ds.ttfv.sub")}
            </Text>

            {/* 근거 — progressive disclosure: the two grounds, collapsed by default. */}
            <View style={styles.whyWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showWhy }}
                accessibilityLabel={t("ds.ttfv.grounds")}
                onPress={() => setShowWhy((v) => !v)}
                style={styles.whyToggle}
                hitSlop={8}
              >
                <SbIcon name="target" size={15} color={withAlpha(deepSpace.accentSoft, 0.85)} />
                <Text variant="caption" style={styles.whyToggleText}>{t("ds.ttfv.grounds")}</Text>
                <SbIcon name={showWhy ? "expand_less" : "expand_more"} size={16} color={withAlpha(deepSpace.accentSoft, 0.85)} />
              </Pressable>
              {showWhy ? (
                <View style={styles.whyBody}>
                  {EVIDENCE.map((e, i) => (
                    <View key={i} style={styles.evidenceCard}>
                      <Text variant="caption" style={styles.evidenceQ}>{t(e.qKey)}</Text>
                      <Text variant="body" style={styles.evidenceA}>{t(e.aKey)}</Text>
                    </View>
                  ))}
                  <Text variant="caption" style={styles.whyFootnote}>
                    {t("ds.ttfv.whyFootnote")}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Two answers, side by side. Both ratify (조금 달라요 = soft ratify).
                Visuals live on wrapper Views — Fabric Android drops styles given
                to Pressable (PR 680), which rendered both pills invisible and
                killed the primary consent CTA. The Pressable is a bare surface. */}
            <View style={styles.answerRow}>
              <View style={[styles.answerBtn, styles.affirmBtn]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("ds.ttfv.affirm")}
                  onPress={() => ratify(false)}
                  style={styles.answerPress}
                >
                  <SbIcon name="check" size={18} color={deepSpace.onAccent} />
                  <Text variant="caption" style={styles.affirmText}>{t("ds.ttfv.affirm")}</Text>
                </Pressable>
              </View>
              <View style={[styles.answerBtn, styles.differBtn]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("ds.ttfv.differ")}
                  onPress={() => ratify(true)}
                  style={styles.answerPress}
                >
                  <Text variant="caption" style={styles.differText}>{t("ds.ttfv.differ")}</Text>
                </Pressable>
              </View>
            </View>

            <Text variant="caption" style={styles.consent}>
              {t("ds.ttfv.consent")}
            </Text>
          </View>
        ) : (
          <View style={styles.block}>
            {/* Ratify: the lit star rose one level. Softened when the user
                answered 조금 달라요 (their correction is the signal, spec 03). */}
            <View style={styles.levelChip}>
              {/* trending_up icon + star name convey "this star went up" without
                  the internal L1→L2 ladder jargon; the ratify title below states
                  the change in plain language. */}
              <SbIcon name="trending_up" size={16} color={m3.accent.insightHi} />
              <Text variant="caption" style={styles.levelChipText}>{star}</Text>
            </View>
            <Text variant="body" style={styles.ratifyTitle}>
              {soft
                ? t("ds.ttfv.ratifySoft")
                : t("ds.ttfv.ratifyTitle", { star: star.toLowerCase() })}
            </Text>
            <Text variant="body" style={styles.sub}>
              {t("ds.ttfv.ratifySub")}
            </Text>
            <View style={styles.enterBtn}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ds.ttfv.enter")}
                onPress={() => router.replace("/")}
                style={styles.answerPress}
              >
                <SbIcon name="star_shine" size={18} color={deepSpace.onAccent} fill />
                <Text variant="caption" style={styles.affirmText}>{t("ds.ttfv.enter")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: deepSpace.bg },
  scroll: { paddingHorizontal: 28, paddingTop: 46, paddingBottom: 40, alignItems: "center", gap: deepSpaceSpacing.xs },

  eyebrow: { color: m3.accent.shareEyebrow, fontSize: 10, letterSpacing: 2, textAlign: "center", marginBottom: 4 },
  pageTitle: { color: deepSpace.textHi, fontSize: 18, textAlign: "center", marginBottom: 10 },

  stage: { width: STAGE_W, height: STAGE_H, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  polarisPulse: {
    position: "absolute",
    left: POLARIS.x - 22,
    top: POLARIS.y - 22,
    width: 44,
    height: 44,
    borderRadius: m3.shape.none,
    backgroundColor: withAlpha(m3.accent.polaris, 0.3),
  },
  starLabel: { position: "absolute", fontSize: 11, color: m3.accent.starCaption, letterSpacing: 0.6, textAlign: "center" },
  polarisLabel: { left: 0, right: 0, top: POLARIS.y + 14 },
  // 96px keeps every shipped locale's star name on one line ("Relationship",
  // "Relaciones", "Hubungan"); the old 48px box wrapped EN mid-word ("Relation/ship").
  gwangeLabel: { left: GWANGE.x - 48, width: 96, top: GWANGE.y + 12 },

  block: { alignItems: "center", gap: deepSpaceSpacing.sm, marginTop: deepSpaceSpacing.sm, alignSelf: "stretch" },
  insight: { fontSize: 18, lineHeight: 27, color: deepSpace.textHi, textAlign: "center", maxWidth: 280, marginTop: 4 },
  insightHi: { fontSize: 18, fontWeight: "700", color: m3.accent.insightHi },
  sub: { fontSize: 14, lineHeight: 20, color: deepSpace.textMid, textAlign: "center", maxWidth: 270 },

  whyWrap: { alignSelf: "stretch", alignItems: "center", maxWidth: 320, width: "100%", marginTop: 6 },
  whyToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  whyToggleText: { fontSize: 13, fontWeight: "600", color: withAlpha(deepSpace.accentSoft, 0.85) },
  whyBody: { alignSelf: "stretch", gap: 8, marginTop: 10 },
  evidenceCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: m3.shape.none,
    backgroundColor: withAlpha(m3.accent.entryTag, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(m3.accent.entryTag, 0.2),
    gap: 3,
  },
  evidenceQ: { fontSize: 10, letterSpacing: 0.4, color: m3.accent.entryTag },
  evidenceA: { fontSize: 13, color: m3.accent.shareInkSoft },
  whyFootnote: { fontSize: 11, lineHeight: 16, color: withAlpha(m3.accent.starCaption, 0.6), textAlign: "center", marginTop: 2 },

  answerRow: { flexDirection: "row", gap: 10, alignSelf: "stretch", maxWidth: 320, width: "100%", marginTop: 16 },
  answerBtn: { flex: 1, minHeight: 50, borderRadius: m3.shape.medium, overflow: "hidden" },
  // bare touch surface inside the styled wrapper (Fabric-safe)
  answerPress: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 50 },
  affirmBtn: { backgroundColor: deepSpace.accent },
  differBtn: { borderWidth: 1, borderColor: withAlpha(m3.accent.starCaption, 0.4), backgroundColor: "transparent" },
  affirmText: { fontSize: 15, color: deepSpace.onAccent },
  differText: { fontSize: 15, color: m3.accent.starCaption },

  consent: { fontSize: 13, color: withAlpha(m3.accent.consentFootnote, 0.5), textAlign: "center", marginTop: 12, maxWidth: 280 },

  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: m3.shape.none,
    backgroundColor: withAlpha(m3.accent.insightHi, 0.16),
    marginBottom: 6,
  },
  levelChipText: { fontSize: 13, fontWeight: "700", color: m3.accent.starCaption },
  ratifyTitle: { fontSize: 18, lineHeight: 26, fontWeight: "700", color: deepSpace.textHi, textAlign: "center", maxWidth: 280 },
  enterBtn: { alignSelf: "stretch", maxWidth: 320, minHeight: 52, borderRadius: m3.shape.medium, backgroundColor: deepSpace.accent, marginTop: 20, overflow: "hidden" },

  pressed: { opacity: 0.85 },
});
