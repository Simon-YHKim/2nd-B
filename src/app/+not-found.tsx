import { Link } from "expo-router";
import { Pressable, ScrollView, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

export default function NotFound() {
  const { t } = useTranslation("notFound");
  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={t("hero.speech")}
        />
        <View style={styles.actions}>
          <Link href="/" asChild>
            <Button
              label={t("actions.home")}
              variant="primary"
              accessibilityHint={t("actions.homeHint")}
            />
          </Link>
        </View>
        <View style={styles.destinations}>
          <Text variant="caption" color="textMuted" style={styles.destinationsTitle}>
            {t("destinations.title")}
          </Text>
          <Link href="/capture" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("destinations.capture.label")}
              accessibilityHint={t("destinations.capture.hint")}
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {t("destinations.capture.label")}
              </Text>
            </Pressable>
          </Link>
          <Link href="/audit" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("destinations.audit.label")}
              accessibilityHint={t("destinations.audit.hint")}
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {t("destinations.audit.label")}
              </Text>
            </Pressable>
          </Link>
          <Link href="/persona" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("destinations.persona.label")}
              accessibilityHint={t("destinations.persona.hint")}
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {t("destinations.persona.label")}
              </Text>
            </Pressable>
          </Link>
          <Link href="/manual" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("destinations.manual.label")}
              accessibilityHint={t("destinations.manual.hint")}
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {t("destinations.manual.label")}
              </Text>
            </Pressable>
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
  destinationsTitle: { letterSpacing: 0, marginBottom: spacing.xs },
  destinationLink: {
    minHeight: 44,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
});
