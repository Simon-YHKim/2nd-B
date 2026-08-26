// "나의 변화" weekly growth review (Claude Design weekly-growth.dc.html).
// Synthesizes star_tier_history + ops_routine_logs + milestones + records into a
// this-week vs last-week summary (lib/growth). The 7 stars keep their existing
// constellation visual language — only brightness change is shown (visual tier
// untouched, no new core). Next step is propose→ratify (saved as a routine).
// deepSpace.* tokens only, assembled from the shared Ops kit.

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { ringCells, stepPolyline } from "@/components/pixel/pixel-line";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceSpacing, flattenAlpha, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { Text } from "@/components/ui/Text";
import { MetaChip, OpsFrame, OpsState } from "@/components/deepspace/ops";
import { SecondbHead } from "@/components/deepspace";
import { useAuth } from "@/lib/auth/AuthContext";
import { gatherWeeklyGrowth } from "@/lib/growth/gather";
import { startTask } from "@/lib/tasks/store";
import type { StarChange, WeeklyGrowth } from "@/lib/growth/weekly";
import { createRoutineFromRecommendation } from "@/lib/ops/routines";
import { getSevenStar, type SevenStarId } from "@/lib/persona/seven-stars";
import type { OpsDomainId } from "@/lib/ops/domains";

// Dipper layout (design coords, viewBox 272x188), star index 1..7 → position.
/** 그래프 선·링을 놓는 셀 크기. 원래 굵기가 1~1.2 라 2가 가장 가깝다. */
const GROWTH_CELL = 2;

/**
 * 원래 `opacity` 로 만들던 색들 — 미리 합성해 둔다(PIXEL-CLAY 규칙 4).
 * 바닥은 이 그래프가 앉은 카드 배경이다.
 */
const GROWTH_GROUND = deepSpace.bgMid;
const GROWTH_LAST_FILL = flattenAlpha(deepSpace.accentDim, 0.4, GROWTH_GROUND);
const GROWTH_FIRST_FILL = GROWTH_LAST_FILL;
const GROWTH_HERO_HALO = flattenAlpha(deepSpace.soul, 0.16, GROWTH_GROUND);
const GROWTH_HERO_MID = flattenAlpha(deepSpace.soul, 0.3, GROWTH_GROUND);

const POS: ReadonlyArray<[number, number]> = [
  [44, 150],
  [84, 128],
  [128, 138],
  [150, 108],
  [196, 118],
  [214, 80],
  [232, 40],
];

// 별 탭 진입 규칙(결정 4)과 동일: 자란 별의 근거 칩은 그 별의 요약으로 간다.
// 2026-08-25 이관 전에는 옛 축 7개가 각자 다른 렌즈 화면으로 흩어졌는데, 새
// 일곱은 진입점이 하나라 맵이 필요 없다.
const starRoute = (id: SevenStarId): string => `/me/${id}`;

// Deterministic observation + next step per grown star (no LLM — synthesis only).
// 2026-08-25: 새 일곱(나를 알아가는 자리) 기준으로 재작성. 프로필만 인터뷰가
// 없는 별이라 다음 걸음도 항목 채우기다.
const STEP: Record<SevenStarId, { obsKo: string; obsEn: string; stepKo: string; stepEn: string; domain: OpsDomainId }> = {
  profile: { obsKo: "내 기본 정보를 채워간 한 주였어요.", obsEn: "You filled in more of your basics this week.", stepKo: "프로필 항목 하나 채우기", stepEn: "Fill in one profile field", domain: "daily_focus" },
  infancy: { obsKo: "가장 이른 기억을 파본 한 주였어요.", obsEn: "You dug into your earliest memories.", stepKo: "떠오른 장면 한 조각 적어두기", stepEn: "Note one scene that came up", domain: "learning_goals" },
  school: { obsKo: "학창시절을 되짚은 한 주였어요.", obsEn: "You revisited your school years.", stepKo: "그 시절 한 장면 더 파보기", stepEn: "Dig into one more scene from then", domain: "learning_goals" },
  twenties: { obsKo: "20대의 나를 깊게 판 한 주였어요.", obsEn: "You went deep on your twenties.", stepKo: "그때의 선택 하나 적어보기", stepEn: "Write down one choice from then", domain: "learning_goals" },
  later: { obsKo: "서른 이후의 변화를 돌아본 한 주였어요.", obsEn: "You looked at how you changed after thirty.", stepKo: "달라진 것 한 줄 적기", stepEn: "Write one line about what changed", domain: "daily_focus" },
  work: { obsKo: "일하는 나를 들여다본 한 주였어요.", obsEn: "You looked at yourself at work.", stepKo: "이번 주 일의 한 장면 적기", stepEn: "Note one scene from work this week", domain: "career_check" },
  now: { obsKo: "지금의 나를 자주 들여다봤어요.", obsEn: "You checked in on yourself often.", stepKo: "오늘 한 줄 돌아보기", stepEn: "One line of reflection today", domain: "daily_focus" },
};

export function WeeklyGrowthScreen() {
  const { t, i18n } = useTranslation("deepspace");
  // 별 이름은 홈 별자리와 같은 키에서 온다 -- 화면마다 다른 이름 금지.
  const { t: tHome } = useTranslation("home");
  const starName = (id: SevenStarId) => tHome(`ds.star.${getSevenStar(id).key}`);
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
      // med#20: without a schedule this saved recurrence=none + reminder=null,
      // so the routine was never "due today" — invisible in the ops list the
      // button promises. Anchor it as a daily 9AM routine (same default the
      // ops hub uses), which also makes the reminder derivable.
      const at = new Date();
      at.setHours(9, 0, 0, 0);
      await createRoutineFromRecommendation(userId, step.domain, {
        title: ko ? step.stepKo : step.stepEn,
        reason: ko ? step.obsKo : step.obsEn,
        startsAtIso: at.toISOString(),
        recurrence: "daily",
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
          <Text variant="heading" style={styles.heroName}>{starName(hero.id)}</Text>
          <Text variant="body" style={styles.heroDelta}>
            {hero.delta > 0 ? t("ds.growth.brightened").replace("{n}", String(hero.delta)) : t("ds.growth.brightestNow")}
          </Text>
        </View>

        <View style={styles.svgWrap}>
          <Svg viewBox="0 0 272 188" width="100%" height="100%">
            {/* 별을 잇는 선 — `<Polyline>` 이었다. 같은 점을 셀 계단으로(규칙 1). */}
            {stepPolyline(POS, GROWTH_CELL).map((p, i) => (
              <Rect key={`ln${i}`} x={p.x} y={p.y} width={GROWTH_CELL} height={GROWTH_CELL} fill={deepSpace.cardLineStrong} />
            ))}
            {g.stars.map((s, i) => {
              const [cx, cy] = POS[i] ?? [0, 0];
              const isHero = s.id === hero.id;
              const color = isHero ? deepSpace.soul : s.after >= 3 ? deepSpace.accent : deepSpace.accentDim;
              const r = isHero ? 4.5 : 2.5 + s.after * 0.5;
              return (
                <React.Fragment key={s.id}>
                  {/* 지난주 = 빈 사각 링 · 이번주 = 채운 별. 원을 셀로 근사하지
                      않는다(규칙 1). 발광은 미리 합성한 색 층이다(규칙 4). */}
                  {ringCells(cx, cy, isHero ? 5 : 4, 2).map((p, i) => (
                    <Rect key={`h${i}`} x={p.x} y={p.y} width={2} height={2} fill={GROWTH_LAST_FILL} />
                  ))}
                  {isHero ? <PixelStarSvg cx={cx} cy={cy} r={13} fill={GROWTH_HERO_HALO} /> : null}
                  {isHero ? <PixelStarSvg cx={cx} cy={cy} r={8} fill={GROWTH_HERO_MID} /> : null}
                  <PixelStarSvg cx={cx} cy={cy} r={r} fill={color} />
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
            onPress={() => router.push(starRoute(hero.id) as never)}
            hitSlop={6}
            style={styles.reasonChip}
            android_ripple={{ color: withAlpha(deepSpace.soul, 0.12) }}
          >
            <View style={[styles.dot, { backgroundColor: deepSpace.soul }]} />
            <Text variant="caption" style={styles.reasonText}>{`${starName(hero.id)} ↑ `}<RNText style={styles.reasonCaret}>›</RNText></Text>
          </Pressable>
          <View style={styles.obsActions}>
            <Pressable onPress={saveStep} hitSlop={6} style={[styles.primaryBtn, saved ? styles.disabled : null]} disabled={saved}>
              <Text variant="caption" style={styles.primaryText}>{saved ? t("ds.growth.saved") : t("ds.growth.addRoutine")}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ds.growth.dreamToStep")}
          onPress={() => router.push("/imagine")}
          hitSlop={6}
          style={styles.dreamRow}
        >
          <View style={styles.dreamBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text variant="caption" pixelEn style={styles.dreamBadgeText}>GO</Text>
          </View>
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
          {stepPolyline(POS, GROWTH_CELL).map((p, i) => (
            <Rect key={`fl${i}`} x={p.x} y={p.y} width={GROWTH_CELL} height={GROWTH_CELL} fill={deepSpace.cardLine} />
          ))}
          {POS.map(([cx, cy], i) =>
            ringCells(cx, cy, 4, 2).map((p, j) => (
              <Rect key={`fr${i}-${j}`} x={p.x} y={p.y} width={2} height={2} fill={GROWTH_FIRST_FILL} />
            )),
          )}
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
  legendHollow: { width: 8, height: 8, borderRadius: m3.shape.none, borderWidth: 1, borderColor: deepSpace.accentDim },
  legendFill: { width: 8, height: 8, borderRadius: m3.shape.none, backgroundColor: deepSpace.text },
  legendText: { fontSize: 11, color: deepSpace.textLo },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

  obsCard: {
    padding: deepSpaceSpacing.md, borderWidth: 1, borderColor: deepSpace.soulLine,
    borderRadius: m3.shape.large, backgroundColor: deepSpace.card, gap: deepSpaceSpacing.sm,
  },
  obsHead: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  obsText: { flex: 1, fontSize: 14, color: deepSpace.textHi },
  reasonChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44,
    paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: deepSpace.soulLine, borderRadius: m3.shape.small,
  },
  dot: { width: 7, height: 7, borderRadius: m3.shape.none },
  reasonText: { fontSize: 12, color: deepSpace.soul },
  reasonCaret: { fontSize: 14, color: deepSpace.soul },
  obsActions: { flexDirection: "row", gap: deepSpaceSpacing.sm },

  primaryBtn: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: m3.shape.medium, backgroundColor: deepSpace.mint },
  primaryText: { fontSize: 14, color: deepSpace.onMint },
  disabled: { opacity: 0.5 },
  ghostBtn: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: m3.shape.medium, borderWidth: 1, borderColor: deepSpace.cardLineStrong },
  ghostText: { fontSize: 14, color: deepSpace.accentSoft },

  dreamRow: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: 48, paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1, borderColor: deepSpace.soulLine, borderRadius: m3.shape.medium, backgroundColor: deepSpace.card,
  },
  dreamBadge: {
    width: 28,
    height: 22,
    borderRadius: m3.shape.small,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: deepSpace.soulLine,
    backgroundColor: withAlpha(deepSpace.soul, 0.1),
  },
  dreamBadgeText: { fontSize: 9, color: deepSpace.soul },
  dreamText: { flex: 1, fontSize: 13, color: deepSpace.textMid },
  dreamCaret: { fontSize: 16, color: deepSpace.soul },

  firstWeek: { alignItems: "center", gap: deepSpaceSpacing.md, paddingTop: deepSpaceSpacing.lg },
  firstTitle: { fontSize: 15, color: deepSpace.accentBright, marginTop: 8 },
  firstBody: { fontSize: 13, color: deepSpace.textLo, textAlign: "center", paddingHorizontal: deepSpaceSpacing.md },
});
