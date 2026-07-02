// 승인 이력 (rev2 P3d): the propose->ratify history. Every persisted
// star_tier_history observation, newest first: which star, what changed
// (L from->to), when, how it was produced (origin), and how many records back
// it. No fabrication: this IS the ledger the constellation's light rests on.
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, MdChip } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { SELF_UNDERSTANDING_STARS, type StarId } from "@/lib/persona/stars";
import { loadTierObservations } from "@/lib/persona/load-tier-observations";
import { buildRatificationLog, type RatificationEntry } from "@/lib/persona/brightness-timeline";

const starName = (starId: StarId, locale: "en" | "ko"): string => {
  const star = SELF_UNDERSTANDING_STARS.find((s) => s.id === starId);
  return star ? (locale === "ko" ? star.nameKo : star.nameEn) : starId;
};

function originLabel(origin: string | null, locale: "en" | "ko"): string {
  if (origin === "ratify") return locale === "ko" ? "내가 승인" : "You ratified";
  if (origin === "rebuild") return locale === "ko" ? "재계산" : "Recomputed";
  if (!origin) return locale === "ko" ? "기록" : "Recorded";
  return origin;
}

export default function RatificationLogScreen() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [entries, setEntries] = useState<RatificationEntry[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadTierObservations(userId).then((rows) => {
      if (alive) setEntries(buildRatificationLog(rows));
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <DeepSpaceScreen active="lens">
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "불러오는 중이에요…" : "Loading…"} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <DeepSpaceScreen active="lens">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="heading">{locale === "ko" ? "승인 이력" : "Ratification log"}</Text>
        <Text variant="caption" color="textSubtle">
          {locale === "ko"
            ? "별의 밝기가 바뀐 모든 기록이에요. 자동 반영은 없어요. 제안을 승인한 것만 남아요."
            : "Every recorded change to a star's light. Nothing applies itself; only what you ratified lands here."}
        </Text>

        {entries === null ? (
          <PremiumLoadingState message={locale === "ko" ? "장부를 펴는 중…" : "Opening the ledger…"} />
        ) : entries.length === 0 ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "아직 승인한 변화가 없어요. 북극성에서 제안을 점검하고 승인하면 여기 남아요."
                : "No ratified changes yet. Review a proposal in Polaris and it lands here."}
            </Text>
            <MdButton
              variant="tonal"
              label={locale === "ko" ? "북극성으로 가기" : "Go to Polaris"}
              onPress={() => router.replace("/core-brain")}
            />
          </MdCard>
        ) : (
          entries.map((entry, i) => (
            <MdCard key={`${entry.starId}-${entry.recordedAt}-${i}`} variant="outlined" style={styles.entry}>
              <View style={styles.entryHead}>
                <Text variant="body" style={styles.entryStar} numberOfLines={1}>
                  {starName(entry.starId, locale)}
                </Text>
                <Text variant="caption" color="textSubtle">
                  {entry.recordedAt.slice(0, 10)}
                </Text>
              </View>
              <View style={styles.entryMeta}>
                <Text variant="body" style={styles.delta}>
                  {entry.prevLevel === null ? `L${entry.level}` : `L${entry.prevLevel} → L${entry.level}`}
                  {entry.prevLevel !== null && entry.level !== entry.prevLevel
                    ? entry.level > entry.prevLevel
                      ? " ↑"
                      : " ↓"
                    : ""}
                </Text>
                <MdChip kind="assist" label={originLabel(entry.origin, locale)} />
                {entry.citedCount > 0 ? (
                  <Text variant="caption" color="textMuted">
                    {locale === "ko" ? `근거 ${entry.citedCount}개` : `${entry.citedCount} cited`}
                  </Text>
                ) : null}
              </View>
            </MdCard>
          ))
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  cardPad: { padding: spacing.md, gap: spacing.sm },
  entry: { padding: spacing.md, gap: 6 },
  entryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  entryStar: { flex: 1, fontWeight: "600" },
  entryMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  delta: { color: withAlpha(m3.accent.skyTextHi, 0.9) },
});
