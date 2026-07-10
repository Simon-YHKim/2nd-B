// "나의 변화" weekly growth review (Claude Design weekly-growth.dc.html).
// Synthesizes star_tier_history + ops_routine_logs + milestones + records into a
// this-week vs last-week summary (lib/growth). The 7 stars keep their existing
// constellation visual language — only brightness change is shown (visual tier
// untouched, no new core). Next step is propose→ratify (saved as a routine).
// deepSpace.* tokens only, assembled from the shared Ops kit.

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import Svg, { Circle, Polyline, Text as SvgText } from "react-native-svg";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { MetaChip, OpsFrame, OpsState } from "@/components/deepspace/ops";
import { SecondbHead } from "@/components/deepspace";
import { useAuth } from "@/lib/auth/AuthContext";
import { gatherWeeklyGrowth } from "@/lib/growth/gather";
import { startTask } from "@/lib/tasks/store";
import type { StarChange, WeeklyGrowth } from "@/lib/growth/weekly";
import { createRoutineFromRecommendation } from "@/lib/ops/routines";
import type { StarId } from "@/lib/persona/stars";
import type { OpsDomainId } from "@/lib/ops/domains";

// Dipper layout (design coords, viewBox 272x188), star index 1..7 → position.
const POS: ReadonlyArray<[number, number]> = [
  [44, 150],
  [84, 128],
  [128, 138],
  [150, 108],
  [196, 118],
  [214, 80],
  [232, 40],
];

// Star → lens route (mirrors DeepSpaceHomeScreen's LENS_ROUTES). The 근거 칩
// deep-links to the lens that explains why this star grew. Inline because the
// home-screen map isn't exported; keep the two in sync if routes change.
const LENS_ROUTE: Record<StarId, string> = {
  now: "/big-five",
  recall: "/interview",
  seen: "/persona",
  rhythm: "/esm",
  relational: "/attachment",
  possible: "/imagine",
  values: "/audit",
};

// Deterministic observation + next step per grown star (no LLM — synthesis only).
const STEP: Record<StarId, { obsKo: string; obsEn: string; stepKo: string; stepEn: string; domain: OpsDomainId }> = {
  now: { obsKo: "지금의 나를 자주 들여다본 한 주였어요.", obsEn: "You checked in on yourself often this week.", stepKo: "오늘 한 줄 돌아보기", stepEn: "One line of reflection today", domain: "daily_focus" },
  recall: { obsKo: "지난 이야기를 많이 되짚었어요.", obsEn: "You revisited your story a lot.", stepKo: "기억 한 조각 적어두기", stepEn: "Note one memory", domain: "learning_goals" },
  seen: { obsKo: "남에게 보이는 나를 살핀 한 주였어요.", obsEn: "You looked at how others see you.", stepKo: "피드백 한 번 청해보기", stepEn: "Ask for one piece of feedback", domain: "career_check" },
  rhythm: { obsKo: "하루의 리듬이 또렷해졌어요.", obsEn: "Your daily rhythm came into focus.", stepKo: "같은 시간에 한 가지 하기", stepEn: "Do one thing at the same time", domain: "daily_focus" },
  relational: { obsKo: "관계를 자주 떠올린 한 주였어요.", obsEn: "Relationships were on your mind.", stepKo: "한 사람에게 안부 전하기", stepEn: "Reach out to one person", domain: "home_reset" },
  possible: { obsKo: "미래를 자주 그린 한 주였어요. 그 그림에 작은 일정 하나를 더해볼까요?", obsEn: "You pictured your future a lot. Add one small plan to it?", stepKo: "미래 계획 한 줄 적기", stepEn: "Write one future plan", domain: "learning_goals" },
  values: { obsKo: "무엇이 중요한지 자주 돌아봤어요.", obsEn: "You reflected on what matters.", stepKo: "가치 한 가지 실천하기", stepEn: "Act on one value", domain: "career_check" },
};

export function WeeklyGrowthScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId } = useAuth();

  const [data, setData] = useState<WeeklyGrowth | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saved, setSaved] = useState(false);
  // The background reanalyze task outlives this screen, so guard its setState.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    (userId ? gatherWeeklyGrowth(userId) : Promise.resolve(null))
      .then((g) => {
        if (!alive) return;
        setData(g);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [userId]);

  const top = data?.topStar ?? null;
  const tip = data?.hasPriorWeek ? t("ds.growth.comparedLast") : t("ds.growth.firstWeekTip");

  // Loading-system demo (loading.dc.html): re-reading the stars is a genuine
  // multi-table read, so run it in the BACKGROUND — the user keeps using the app,
  // the global dock shows progress, and the completion toast offers "결과 보기"
  // (no auto-navigation). Additive: the on-mount load above is unchanged.
  const reanalyze = () => {
    if (!userId) return;
    startTask({
      title: t("ds.growth.reanalyzing"),
      tip: t("ds.growth.reanalyzingTip"),
      mode: "background",
      etaSec: 8,
      resultHref: "/growth",
      run: async () => {
        const g = await gatherWeeklyGrowth(userId);
        if (!mounted.current) return; // screen left; "결과 보기" remounts + re-gathers
        setData(g);
        setStatus("ready");
      },
    });
  };

  const saveStep = async () => {
    if (!userId || !top || saved) return;
    const step = STEP[top.id];
    try {
      await createRoutineFromRecommendation(userId, step.domain, {
        title: ko ? step.stepKo : step.stepEn,
        reason: ko ? step.obsKo : step.obsEn,
      });
      setSaved(true);
    } catch {
      /* best-effort */
    }
  };

  return (
    <OpsFrame title={t("ds.growth.title")} bubble={t("ds.growth.bubble")} tip={tip} onBack={() => router.back()}>
      {status === "error" ? (
        <OpsState variant="error" title={t("ds.growth.errTitle")} body={t("ds.growth.errBody")} />
      ) : status === "loading" || !data ? (
        <OpsState variant="empty" title="…" body={t("ds.growth.loading")} />
      ) : !data.hasPriorWeek || !top ? (
        renderFirstWeek()
      ) : (
        renderGrowth(data, top)
      )}
    </OpsFrame>
  );

  function renderGrowth(g: WeeklyGrowth, hero: StarChange) {
    const step = STEP[hero.id];
    return (
      <>
        <View style={styles.heroBox}>
          <Text variant="caption" pixelEn style={styles.heroLabel}>{t("ds.growth.thisWeeksStar")}</Text>
          <Text variant="heading" style={styles.heroName}>{ko ? hero.nameKo : hero.nameEn}</Text>
          <Text variant="body" style={styles.heroDelta}>
            {hero.delta > 0 ? t("ds.growth.brightened").replace("{n}", String(hero.delta)) : t("ds.growth.brightestNow")}
          </Text>
        </View>

        <View style={styles.svgWrap}>
          <Svg viewBox="0 0 272 188" width="100%" height="100%">
            <Polyline
              points={POS.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={deepSpace.cardLineStrong}
              strokeWidth={1.2}
            />
            {g.stars.map((s, i) => {
              const [cx, cy] = POS[i] ?? [0, 0];
              const isHero = s.id === hero.id;
              const color = isHero ? deepSpace.soul : s.after >= 3 ? deepSpace.accent : deepSpace.accentDim;
              const r = isHero ? 4.5 : 2.5 + s.after * 0.5;
              return (
                <React.Fragment key={s.id}>
                  {/* last week = hollow */}
                  <Circle cx={cx} cy={cy} r={isHero ? 5 : 4} fill="none" stroke={deepSpace.accentDim} strokeWidth={1} opacity={0.4} />
                  {/* this week = filled */}
                  {isHero ? <Circle cx={cx} cy={cy} r={13} fill={deepSpace.soul} opacity={0.16} /> : null}
                  {isHero ? <Circle cx={cx} cy={cy} r={8} fill={deepSpace.soul} opacity={0.3} /> : null}
                  <Circle cx={cx} cy={cy} r={r} fill={color} />
                  {isHero && s.delta > 0 ? (
                    <SvgText x={cx + 16} y={cy - 6} fill={deepSpace.mint} fontSize={9}>{`+${s.delta}`}</SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.legendHollow} />
              <Text variant="subtle" style={styles.legendText}>{t("ds.growth.lastWeek")}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendFill} />
              <Text variant="subtle" style={styles.legendText}>{t("ds.growth.thisWeek")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.chipRow}>
          <MetaChip label={`${t("ds.growth.records")} ${g.metrics.records}`} />
          <MetaChip label={`${t("ds.growth.streak")} ${g.metrics.streak}${t("ds.growth.days")}`} />
          <MetaChip label={`${t("ds.growth.rate")} ${g.metrics.completionRate}%`} color={deepSpace.mint} />
          <MetaChip label={`${t("ds.growth.milestone")} +${g.metrics.milestoneDelta}`} />
        </View>

        <View style={styles.obsCard}>
          <View style={styles.obsHead}>
            <SecondbHead size={22} mood="neutral" />
            <Text variant="body" style={styles.obsText}>{ko ? step.obsKo : step.obsEn}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(LENS_ROUTE[hero.id] as never)}
            hitSlop={6}
            style={({ pressed }) => [styles.reasonChip, pressed ? styles.reasonChipPressed : null]}
          >
            <View style={[styles.dot, { backgroundColor: deepSpace.soul }]} />
            <Text variant="caption" style={styles.reasonText}>{`${ko ? hero.nameKo : hero.nameEn} ↑`}</Text>
            <RNText style={styles.reasonCaret}>›</RNText>
          </Pressable>
          <View style={styles.obsActions}>
            <Pressable onPress={saveStep} hitSlop={6} style={[styles.primaryBtn, saved ? styles.disabled : null]} disabled={saved}>
              <Text variant="caption" style={styles.primaryText}>{saved ? t("ds.growth.saved") : t("ds.growth.addRoutine")}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => router.push("/imagine")} hitSlop={6} style={styles.dreamRow}>
          <RNText style={styles.dreamIcon}>✨</RNText>
          <Text variant="body" style={styles.dreamText}>{t("ds.growth.dreamToStep")}</Text>
          <RNText style={styles.dreamCaret}>›</RNText>
        </Pressable>

        <Pressable onPress={reanalyze} hitSlop={6} style={styles.ghostBtn}>
          <Text variant="caption" style={styles.ghostText}>{t("ds.growth.reanalyze")}</Text>
        </Pressable>
      </>
    );
  }

  function renderFirstWeek() {
    return (
      <View style={styles.firstWeek}>
        <Svg viewBox="0 0 272 188" width="100%" height={150}>
          <Polyline points={POS.map((p) => p.join(",")).join(" ")} fill="none" stroke={deepSpace.cardLine} strokeWidth={1.2} />
          {POS.map(([cx, cy], i) => (
            <Circle key={i} cx={cx} cy={cy} r={4} fill="none" stroke={deepSpace.accentDim} strokeWidth={1} opacity={0.4} />
          ))}
        </Svg>
        <Text variant="heading" style={styles.firstTitle}>{t("ds.growth.firstTitle")}</Text>
        <Text variant="body" style={styles.firstBody}>{t("ds.growth.firstBody")}</Text>
        <Pressable onPress={() => router.push("/capture")} hitSlop={6} style={styles.primaryBtn}>
          <Text variant="caption" style={styles.primaryText}>{t("ds.growth.captureToday")}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/ops")} hitSlop={6} style={styles.ghostBtn}>
          <Text variant="caption" style={styles.ghostText}>{t("ds.growth.startRoutine")}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  heroBox: { alignItems: "center", gap: 4 },
  heroLabel: { fontSize: 8, letterSpacing: 1.5, color: deepSpace.accentSoft },
  heroName: { fontSize: 19, color: deepSpace.textHi, marginTop: 4 },
  heroDelta: { fontSize: 12, color: deepSpace.textMid },

  svgWrap: { height: 196, marginTop: 4 },
  legend: { flexDirection: "row", gap: 12, position: "absolute", left: 0, bottom: 0 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendHollow: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: deepSpace.accentDim },
  legendFill: { width: 8, height: 8, borderRadius: 4, backgroundColor: deepSpace.text },
  legendText: { fontSize: 11, color: deepSpace.textLo },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

  obsCard: {
    padding: deepSpaceSpacing.md, borderWidth: 1, borderColor: deepSpace.soulLine,
    borderRadius: deepSpaceRadii.lg, backgroundColor: deepSpace.card, gap: deepSpaceSpacing.sm,
  },
  obsHead: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  obsText: { flex: 1, fontSize: 14, color: deepSpace.textHi },
  reasonChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44,
    paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: deepSpace.soulLine, borderRadius: deepSpaceRadii.sm,
  },
  reasonChipPressed: { opacity: 0.7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  reasonText: { fontSize: 12, color: deepSpace.soul },
  reasonCaret: { fontSize: 14, color: deepSpace.soul },
  obsActions: { flexDirection: "row", gap: deepSpaceSpacing.sm },

  primaryBtn: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.mint },
  primaryText: { fontSize: 14, color: deepSpace.onMint },
  disabled: { opacity: 0.5 },
  ghostBtn: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, borderWidth: 1, borderColor: deepSpace.cardLineStrong },
  ghostText: { fontSize: 14, color: deepSpace.accentSoft },

  dreamRow: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: 48, paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1, borderColor: deepSpace.soulLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card,
  },
  dreamIcon: { fontSize: 14 },
  dreamText: { flex: 1, fontSize: 13, color: deepSpace.textMid },
  dreamCaret: { fontSize: 16, color: deepSpace.soul },

  firstWeek: { alignItems: "center", gap: deepSpaceSpacing.md, paddingTop: deepSpaceSpacing.lg },
  firstTitle: { fontSize: 15, color: deepSpace.accentBright, marginTop: 8 },
  firstBody: { fontSize: 13, color: deepSpace.textLo, textAlign: "center", paddingHorizontal: deepSpaceSpacing.md },
});
