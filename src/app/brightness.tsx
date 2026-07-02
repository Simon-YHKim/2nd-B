// 밝기 변화 (rev2 P3c): the 8-week brightness timeline + honesty meter.
// ONE message: how the sky changed. The heatmap IS the explanation — 북극성 row
// on top (tier-1 dominant), the observed stars under it, one cell per week.
// Honesty meter says what the light is made of: observations and citations,
// never confidence (별빛 != 확신).
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, ProgressLinear } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { SELF_UNDERSTANDING_STARS } from "@/lib/persona/stars";
import type { StarId } from "@/lib/persona/stars";
import { loadTierObservations } from "@/lib/persona/load-tier-observations";
import { buildBrightnessTimeline, type BrightnessTimeline } from "@/lib/persona/brightness-timeline";
import type { TierObservation } from "@/lib/persona/tier-history";
import { tierShiftNudge, detectTierShift } from "@/lib/persona/tier-history";

const starName = (starId: StarId, locale: "en" | "ko"): string => {
  const star = SELF_UNDERSTANDING_STARS.find((s) => s.id === starId);
  return star ? (locale === "ko" ? star.nameKo : star.nameEn) : starId;
};

/** Level 1..5 -> cell opacity (mirrors the constellation's dim->bright ladder). */
const CELL_OPACITY: Record<number, number> = { 1: 0.16, 2: 0.32, 3: 0.5, 4: 0.72, 5: 1 };

export default function BrightnessTimelineScreen() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [observations, setObservations] = useState<TierObservation[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadTierObservations(userId).then((rows) => {
      if (alive) setObservations(rows);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const timeline: BrightnessTimeline | null = useMemo(
    () => (observations ? buildBrightnessTimeline(observations, new Date()) : null),
    [observations],
  );
  const nudge = useMemo(
    () => (observations ? tierShiftNudge(detectTierShift(observations), locale, starName) : null),
    [observations, locale],
  );

  // rev2 TITLES verbatim: 밝기 변화 (the windowed top app bar carries it).
  const barTitle = locale === "ko" ? "밝기 변화" : "Brightness";

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "불러오는 중이에요…" : "Loading…"} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const empty = timeline !== null && timeline.honesty.observations < 2;

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="heading">{locale === "ko" ? "8주 타임라인" : "8-week timeline"}</Text>

        {timeline === null ? (
          <PremiumLoadingState message={locale === "ko" ? "하늘을 살펴보는 중…" : "Reading the sky…"} />
        ) : empty ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "아직 변화를 그릴 기록이 부족해요. 점검을 마치고 제안을 승인하면 별의 궤적이 여기 쌓여요."
                : "Not enough history to draw yet. Finish a check and ratify a proposal, and the trail builds up here."}
            </Text>
            <MdButton
              variant="tonal"
              label={locale === "ko" ? "북극성으로 가기" : "Go to Polaris"}
              onPress={() => router.replace("/core-brain")}
            />
          </MdCard>
        ) : (
          <>
            {/* Heatmap: 북극성 row (violet, tier-1) then observed stars (cyan). */}
            <MdCard variant="outlined" style={styles.cardPad}>
              <View style={styles.gridRow}>
                <Text variant="caption" color="textMuted" style={styles.rowLabel} numberOfLines={1}>
                  {locale === "ko" ? "북극성" : "Polaris"}
                </Text>
                {timeline.polaris.map((v, i) => (
                  <View
                    key={i}
                    style={[
                      styles.cell,
                      styles.cellPolaris,
                      v === null
                        ? styles.cellEmpty
                        : { backgroundColor: withAlpha(m3.accent.polaris, 0.15 + v * 0.85) },
                    ]}
                  />
                ))}
              </View>
              {timeline.stars.map((star) => (
                <View key={star.starId} style={styles.gridRow}>
                  <Text variant="caption" color="textMuted" style={styles.rowLabel} numberOfLines={1}>
                    {starName(star.starId, locale)}
                  </Text>
                  {star.levels.map((level, i) => (
                    <View
                      key={i}
                      style={[
                        styles.cell,
                        level === null
                          ? styles.cellEmpty
                          : { backgroundColor: withAlpha(m3.accent.starCore, CELL_OPACITY[level]) },
                      ]}
                    />
                  ))}
                </View>
              ))}
              <View style={styles.axisRow}>
                <Text variant="caption" color="textSubtle">
                  {locale === "ko" ? "8주 전" : "8w ago"}
                </Text>
                <Text variant="caption" color="textSubtle">
                  {locale === "ko" ? "이번 주" : "this week"}
                </Text>
              </View>
            </MdCard>

            {nudge ? (
              <MdCard variant="filled" style={styles.cardPad}>
                <Text variant="body">{nudge}</Text>
              </MdCard>
            ) : null}

            {/* Honesty meter: what this light is made of (별빛 != 확신). */}
            <MdCard variant="outlined" style={styles.cardPad}>
              <Text variant="caption" color="textMuted">
                {locale === "ko" ? "이 별빛의 근거" : "What this light is made of"}
              </Text>
              <Text variant="body" style={styles.honestyLine}>
                {locale === "ko"
                  ? `관측 ${timeline.honesty.observations}번 · 근거 있는 관측 ${timeline.honesty.cited}번 · 별 ${timeline.honesty.observedStars}개`
                  : `${timeline.honesty.observations} observations · ${timeline.honesty.cited} cited · ${timeline.honesty.observedStars} stars`}
              </Text>
              <ProgressLinear
                value={timeline.honesty.observations > 0 ? timeline.honesty.cited / timeline.honesty.observations : 0}
                accessibilityLabel={
                  locale === "ko"
                    ? `근거 비율 ${timeline.honesty.cited}/${timeline.honesty.observations}`
                    : `Cited ratio ${timeline.honesty.cited} of ${timeline.honesty.observations}`
                }
              />
              <Text variant="caption" color="textSubtle" style={styles.honestyCaption}>
                {locale === "ko"
                  ? "밝기는 확신이 아니라 기록의 양이에요. 근거가 붙을수록 믿을 만해져요."
                  : "Brightness is how much is on record, not certainty. Citations make it trustworthy."}
              </Text>
              <MdButton
                variant="text"
                label={locale === "ko" ? "승인 이력 보기" : "See the ratification log"}
                onPress={() => router.push("/ratifications")}
              />
            </MdCard>
          </>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  cardPad: { padding: spacing.md, gap: spacing.sm },
  gridRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 3 },
  rowLabel: { width: 92 },
  cell: { flex: 1, height: 18, borderRadius: 3 },
  cellPolaris: { height: 22, borderRadius: 4 },
  cellEmpty: { borderWidth: 1, borderColor: withAlpha(deepSpace.accentDim, 0.18), backgroundColor: "transparent" },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingLeft: 74 + 3 },
  honestyLine: { marginBottom: 4 },
  honestyCaption: { marginTop: 4 },
});
