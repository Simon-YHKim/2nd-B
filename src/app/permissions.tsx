// Permissions transparency screen. Route/status structure stays in code; all
// user-facing privacy and permission copy lives in the permissions namespace.

import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Link } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { VILLAGE_UI } from "@/lib/village-ui";

type Status = "inUse" | "optional" | "planned" | "notUsed";
type Platform = "web" | "native" | "both" | "none";

interface PermissionEntry {
  key: string;
  status: Status;
  platform: Platform;
}

const ENTRIES: PermissionEntry[] = [
  { key: "network", status: "inUse", platform: "both" },
  { key: "clipboard", status: "optional", platform: "web" },
  { key: "calendar", status: "planned", platform: "native" },
  { key: "cameraPhoto", status: "optional", platform: "native" },
  { key: "microphone", status: "notUsed", platform: "none" },
  { key: "location", status: "notUsed", platform: "none" },
  { key: "contactsSms", status: "notUsed", platform: "none" },
];

const STATUS_COLOR: Record<Status, keyof typeof semantic> = {
  inUse: "brand",
  optional: "info",
  planned: "warning",
  notUsed: "textSubtle",
};

export default function Permissions() {
  const { t } = useTranslation("permissions");
  const principles = t("principles.items", { returnObjects: true }) as string[];

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.relation.island}
          worker={VILLAGE_UI.relation.worker}
          accent={VILLAGE_UI.relation.accent}
          speech={t("hero.speech")}
        />

        <View style={styles.cards}>
          {ENTRIES.map((entry) => {
            const color = STATUS_COLOR[entry.status];
            return (
              <View key={entry.key} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text variant="body" style={styles.cardTitle}>
                    {t(`entries.${entry.key}.name`)}
                  </Text>
                  <View style={[styles.tag, { borderColor: semantic[color] }]}>
                    <Text variant="caption" color={color}>
                      {t(`status.${entry.status}`)}
                    </Text>
                  </View>
                </View>
                <Text variant="subtle" color="textMuted" style={{ lineHeight: 20 }}>
                  {t(`entries.${entry.key}.why`)}
                </Text>
                <Text variant="subtle" color="textSubtle">
                  {t("platform.label")} {t(`platform.${entry.platform}`)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.principles}>
          <Text variant="caption" color="brand" style={styles.principlesTitle}>
            {t("principles.title")}
          </Text>
          {principles.map((principle) => (
            <Text key={principle} variant="subtle" color="textMuted" style={styles.principle}>
              - {principle}
            </Text>
          ))}
        </View>

        <View style={styles.actions}>
          <Link href="/manual" asChild>
            <Button
              label={t("manual.button")}
              variant="secondary"
              accessibilityHint={t("manual.accessibilityHint")}
            />
          </Link>
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  cards: { gap: spacing.sm },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  cardTitle: { fontFamily: fontFamilies.pixelKo, fontWeight: "600", flex: 1, minWidth: 0 },
  tag: {
    flexShrink: 0,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  principles: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  principlesTitle: { letterSpacing: 0 },
  principle: { lineHeight: 20 },
  actions: { gap: spacing.sm },
});
