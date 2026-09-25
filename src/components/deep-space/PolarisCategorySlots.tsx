import { View, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Text } from "@/components/ui/Text";
import { m3 } from "@/lib/theme/m3";
import { polarisProgress } from "@/lib/persona/polaris-progress";
import type { RoleCard } from "@/lib/persona/role-cards";

export function PolarisCategorySlots({ cards }: { cards: readonly RoleCard[] }) {
  const { t } = useTranslation("core-brain");
  const { t: home } = useTranslation("home");
  const progress = polarisProgress(cards);
  return <View style={styles.list}>
    <Text variant="heading">{t("categoryProgress", { n: progress.filled, total: progress.total })}</Text>
    <Text variant="caption" color="textMuted">{t("categoryIntro")}</Text>
    {progress.slots.map((slot) => <Pressable key={slot.category} style={styles.slot}
      accessibilityRole="button" accessibilityLabel={`${home(`ds.star.${slot.category}`)} · ${t(`categoryState.${slot.state}`)}`}
      onPress={() => router.push(`/me/${slot.category}`)}>
      <View style={[styles.square, slot.state === "filled" && styles.filled]} />
      <View style={styles.copy}>
        <Text variant="body">{home(`ds.star.${slot.category}`)}</Text>
        <Text variant="caption" color="textMuted">{t(`categoryState.${slot.state}`)}</Text>
      </View>
      <Text variant="caption">{t("fill")}</Text>
    </Pressable>)}
    <Text variant="caption" color="textMuted">{t(progress.firstApproved ? "rewardFirstReached" : "rewardFirstGoal")}</Text>
    <Text variant="caption" color="textMuted">{t(progress.complete ? "rewardAllReached" : "rewardAllGoal")}</Text>
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 12, width: "100%" },
  slot: { minHeight: 56, padding: 12, borderWidth: 1, borderColor: m3.color.outlineVariant, flexDirection: "row", alignItems: "center", gap: 12 },
  square: { width: 12, height: 12, borderWidth: 2, borderColor: m3.color.outline },
  filled: { backgroundColor: m3.color.tertiary, borderColor: m3.color.tertiary },
  copy: { flex: 1, gap: 4 },
});
