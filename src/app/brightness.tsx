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
  const { t, i18n } = useTranslation("brightness");
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
  const barTitle = t("barTitle");

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const empty = timeline !== null && timeline.honesty.observations < 2;

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="heading">{t("timeline")}</Text>

        {timeline === null ? (
          <PremiumLoadingState message={t("readingSky")} />
        ) : empty ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {t("emptyBody")}
            </Text>
            <MdButton
              variant="tonal"
              label={t("goPolaris")}
              onPress={() => router.replace("/core-brain")}
            />
          </MdCard>
        ) : (
          <>
            {/* Heatmap: 북극성 row (violet, tier-1) then observed stars (cyan). */}
            <MdCard variant="outlined" style={styles.cardPad}>
              <View style={styles.gridRow}>
                <Text variant="caption" color="textMuted" style={styles.rowLabel} numberOfLines={1}>
                  {t("polaris")}
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
                  {t("weeksAgo")}
                </Text>
                <Text variant="caption" color="textSubtle">
                  {t("thisWeek")}
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
                {t("evidence")}
              </Text>
              <Text variant="body" style={styles.honestyLine}>
                {t("honestyLine", {
                  obs: timeline.honesty.observations,
                  cited: timeline.honesty.cited,
                  stars: timeline.honesty.observedStars,
                })}
              </Text>
              <ProgressLinear
                value={timeline.honesty.observations > 0 ? timeline.honesty.cited / timeline.honesty.observations : 0}
                accessibilityLabel={t("citedRatioLabel", {
                  cited: timeline.honesty.cited,
                  obs: timeline.honesty.observations,
                })}
              />
              <Text variant="caption" color="textSubtle" style={styles.honestyCaption}>
                {t("honestyCaption")}
              </Text>
              <MdButton
                variant="text"
                label={t("ratLog")}
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
