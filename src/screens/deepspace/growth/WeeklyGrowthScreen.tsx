// "나의 변화" weekly growth review (Claude Design weekly-growth.dc.html).
// Synthesizes star_tier_history + ops_routine_logs + milestones + records into a
// this-week vs last-week summary (lib/growth). The 7 stars keep their existing
// constellation visual language — only brightness change is shown (visual tier
// untouched, no new core). Next step is propose→ratify (saved as a routine).
// deepSpace.* tokens only, assembled from the shared Ops kit.

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline, Text as SvgText } from "react-native-svg";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { MetaChip, OpsFrame, OpsState } from "@/components/deepspace/ops";
import { SecondbHead } from "@/components/deepspace";
import { useAuth } from "@/lib/auth/AuthContext";
import { gatherWeeklyGrowth } from "@/lib/growth/gather";
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
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId } = useAuth();

  const [data, setData] = useState<WeeklyGrowth | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saved, setSaved] = useState(false);

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

  const t = (k: string) => COPY(ko)[k] ?? k;
  const top = data?.topStar ?? null;
  const tip = data?.hasPriorWeek ? t("comparedLast") : t("firstWeekTip");

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
    <OpsFrame title={t("title")} bubble={t("bubble")} tip={tip} onBack={() => router.back()}>
      {status === "error" ? (
        <OpsState variant="error" title={t("errTitle")} body={t("errBody")} />
      ) : status === "loading" || !data ? (
        <OpsState variant="empty" title="…" body={t("loading")} />
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
          <Text style={styles.heroLabel}>{t("thisWeeksStar")}</Text>
          <Text style={styles.heroName}>{ko ? hero.nameKo : hero.nameEn}</Text>
          <Text style={styles.heroDelta}>
            {hero.delta > 0 ? t("brightened").replace("{n}", String(hero.delta)) : t("brightestNow")}
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
              <Text style={styles.legendText}>{t("lastWeek")}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendFill} />
              <Text style={styles.legendText}>{t("thisWeek")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.chipRow}>
          <MetaChip label={`${t("records")} ${g.metrics.records}`} />
          <MetaChip label={`${t("streak")} ${g.metrics.streak}${t("days")}`} />
          <MetaChip label={`${t("rate")} ${g.metrics.completionRate}%`} color={deepSpace.mint} />
          <MetaChip label={`${t("milestone")} +${g.metrics.milestoneDelta}`} />
        </View>

        <View style={styles.obsCard}>
          <View style={styles.obsHead}>
            <SecondbHead size={22} mood="positive" />
            <Text style={styles.obsText}>{ko ? step.obsKo : step.obsEn}</Text>
          </View>
          <View style={styles.reasonChip}>
            <View style={[styles.dot, { backgroundColor: deepSpace.soul }]} />
            <Text style={styles.reasonText}>{`${ko ? hero.nameKo : hero.nameEn} ↑`}</Text>
          </View>
          <View style={styles.obsActions}>
            <Pressable onPress={saveStep} hitSlop={6} style={[styles.primaryBtn, saved ? styles.disabled : null]} disabled={saved}>
              <Text style={styles.primaryText}>{saved ? t("saved") : t("addRoutine")}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => router.push("/imagine")} hitSlop={6} style={styles.dreamRow}>
          <Text style={styles.dreamIcon}>✨</Text>
          <Text style={styles.dreamText}>{t("dreamToStep")}</Text>
          <Text style={styles.dreamCaret}>›</Text>
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
        <Text style={styles.firstTitle}>{t("firstTitle")}</Text>
        <Text style={styles.firstBody}>{t("firstBody")}</Text>
        <Pressable onPress={() => router.push("/capture")} hitSlop={6} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>{t("captureToday")}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/ops")} hitSlop={6} style={styles.ghostBtn}>
          <Text style={styles.ghostText}>{t("startRoutine")}</Text>
        </Pressable>
      </View>
    );
  }
}

function COPY(ko: boolean): Record<string, string> {
  return ko
    ? {
        title: "나의 변화", bubble: "이번 주, 너는 여기가 자랐어요.", comparedLast: "지난주와 비교했어요.",
        firstWeekTip: "한 주만 채우면 변화가 보여요.", loading: "변화를 모으는 중…",
        errTitle: "잠시 불러오지 못했어요", errBody: "조금 뒤에 다시 볼게요",
        thisWeeksStar: "이번 주의 별", brightened: "밝기 +{n}단계", brightestNow: "가장 환한 별",
        lastWeek: "지난주", thisWeek: "이번주",
        records: "기록", streak: "루틴 연속", days: "일", rate: "완료율", milestone: "마일스톤",
        addRoutine: "루틴으로 담기", saved: "담았어요", dreamToStep: "이번 주 공상 한 조각을 첫 걸음으로?",
        firstTitle: "첫 변화는 다음 주에", firstBody: "이번 주 기록과 루틴을 채우면 일요일에 너의 별이 얼마나 밝아졌는지 보여줄게요.",
        captureToday: "오늘 기록 담기", startRoutine: "루틴 하나 시작하기",
      }
    : {
        title: "My change", bubble: "This week, you grew here.", comparedLast: "Compared with last week.",
        firstWeekTip: "Fill one week and you'll see change.", loading: "Gathering your change…",
        errTitle: "Couldn't load just now", errBody: "We'll show it again shortly",
        thisWeeksStar: "THIS WEEK'S STAR", brightened: "Brightened +{n}", brightestNow: "Your brightest star",
        lastWeek: "Last week", thisWeek: "This week",
        records: "Records", streak: "Streak", days: "d", rate: "Done", milestone: "Milestone",
        addRoutine: "Add as routine", saved: "Saved", dreamToStep: "Turn a daydream into a first step?",
        firstTitle: "First change comes next week", firstBody: "Fill this week with records and routines, and on Sunday we'll show how much your star brightened.",
        captureToday: "Capture today", startRoutine: "Start a routine",
      };
}

const styles = StyleSheet.create({
  heroBox: { alignItems: "center", gap: 4 },
  heroLabel: { fontFamily: fontFamilies.pixelEn, fontSize: 8, letterSpacing: 1.5, color: deepSpace.accentSoft },
  heroName: { fontFamily: fontFamilies.pixelKo, fontSize: 19, color: deepSpace.textHi, marginTop: 4 },
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
  obsText: { flex: 1, fontSize: 14, color: deepSpace.textHi, lineHeight: 21 },
  reasonChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: deepSpace.soulLine, borderRadius: deepSpaceRadii.sm,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  reasonText: { fontSize: 12, color: deepSpace.soul, fontFamily: fontFamilies.pixelKo },
  obsActions: { flexDirection: "row", gap: deepSpaceSpacing.sm },

  primaryBtn: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.mint },
  primaryText: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.onMint },
  disabled: { opacity: 0.5 },
  ghostBtn: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, borderWidth: 1, borderColor: deepSpace.cardLineStrong },
  ghostText: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.accentSoft },

  dreamRow: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: 48, paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1, borderColor: deepSpace.soulLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card,
  },
  dreamIcon: { fontSize: 14 },
  dreamText: { flex: 1, fontSize: 13, color: deepSpace.textMid },
  dreamCaret: { fontSize: 16, color: deepSpace.soul },

  firstWeek: { alignItems: "center", gap: deepSpaceSpacing.md, paddingTop: deepSpaceSpacing.lg },
  firstTitle: { fontFamily: fontFamilies.pixelKo, fontSize: 15, color: deepSpace.accentBright, marginTop: 8 },
  firstBody: { fontSize: 13, color: deepSpace.textLo, textAlign: "center", lineHeight: 19, paddingHorizontal: deepSpaceSpacing.md },
});
