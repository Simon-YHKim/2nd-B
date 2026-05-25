// C6: visual marker shown when the signed-in user is in judge mode.
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";

export function JudgeBadge() {
  const { t } = useTranslation("auth");
  return (
    <View style={styles.badge}>
      <Text variant="subtle" style={{ color: semantic.text, fontWeight: "700" }}>
        {t("judge.badge")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: semantic.brand,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
