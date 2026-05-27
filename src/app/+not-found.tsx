import { Link } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

export default function NotFound() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  return (
    <Screen>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Text variant="subtle" color="brand" style={styles.badgeText}>404</Text>
        </View>
        <Text variant="heading" style={{ marginTop: spacing.lg, textAlign: "center" }}>
          {locale === "ko" ? "이 길은 아직 만들어지지 않았어요" : "This page doesn't exist yet"}
        </Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
          {locale === "ko"
            ? "주소를 잘못 따라왔을 수도 있어요. 일기로 돌아가서 다시 시작해볼까요?"
            : "You may have followed a stale link. Let's head back to your journal."}
        </Text>
        <View style={styles.actions}>
          <Link href="/" asChild>
            <Button label={locale === "ko" ? "처음으로" : "Go home"} variant="primary" />
          </Link>
        </View>
        <View style={styles.destinations}>
          <Text variant="caption" color="textMuted" style={styles.destinationsTitle}>
            {locale === "ko" ? "또는, 자주 가는 곳" : "Or, common destinations"}
          </Text>
          <Link href="/journal" style={styles.destinationLink}>
            <Text variant="body" color="brand">
              {locale === "ko" ? "일기" : "Journal"}
            </Text>
          </Link>
          <Link href="/audit" style={styles.destinationLink}>
            <Text variant="body" color="brand">
              {locale === "ko" ? "라이프 오딧" : "Life audit"}
            </Text>
          </Link>
          <Link href="/persona" style={styles.destinationLink}>
            <Text variant="body" color="brand">
              {locale === "ko" ? "페르소나 v1" : "Persona v1"}
            </Text>
          </Link>
          <Link href="/manual" style={styles.destinationLink}>
            <Text variant="body" color="brand">
              {locale === "ko" ? "사용 안내서" : "Manual"}
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
  },
  badgeText: {
    fontFamily: "monospace",
    letterSpacing: 2,
    fontWeight: "700",
  },
  actions: { marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  destinations: {
    marginTop: spacing.xl,
    width: "100%",
    maxWidth: 320,
    gap: spacing.xs,
    alignItems: "center",
  },
  destinationsTitle: { letterSpacing: 1, marginBottom: spacing.xs },
  destinationLink: { paddingVertical: 4 },
});
