import { Link } from "expo-router";
import { ScrollView, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

export default function NotFound() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow="404"
          title={locale === "ko" ? "아직 놓이지 않은 길이에요" : "This path is not laid yet"}
          subtitle={locale === "ko" ? "마을의 중심으로 돌아갈 수 있어요" : "Return to the village center"}
          island="core"
          worker="secondb"
          speech={locale === "ko" ? "길이 끊긴 것 같아요. 중심에서 다시 이어볼게요." : "Looks like the path broke. Let's reconnect from the center."}
          islandSize={250}
          workerSize={104}
          railIcons={["?", "⌂", "◇", "↩"]}
        />
        <View style={styles.actions}>
          <Link href="/" asChild>
            <Button label={locale === "ko" ? "마을 중심으로" : "Go home"} variant="primary" />
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
              {locale === "ko" ? "과거의 나" : "Past me"}
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
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xl },
  actions: { width: "100%", maxWidth: 320, alignSelf: "center" },
  destinations: {
    width: "100%",
    maxWidth: 320,
    gap: spacing.xs,
    alignItems: "center",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.md,
    backgroundColor: semantic.surface,
    padding: spacing.lg,
  },
  destinationsTitle: { letterSpacing: 1, marginBottom: spacing.xs },
  destinationLink: { paddingVertical: 4 },
});
