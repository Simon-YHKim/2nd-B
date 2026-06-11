// Theme (A-to-Z Phase 12) - user-facing "테마". Dark / Light wired through
// the ThemeContext. The main graph
// stays dark even in light mode (non-negotiable constraint #4), surfaced as
// a clear note.

import { View, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useFontStyle, type FontStyle } from "@/lib/settings/readable-font";
import { useLiteMode } from "@/lib/settings/lite-mode";
import { useTheme } from "@/lib/theme/ThemeContext";
import { VILLAGE_UI } from "@/lib/village-ui";

export default function ThemeScreen() {
  const { t } = useTranslation("theme");
  const { userId, loading } = useAuth();
  const { mode, setMode } = useTheme();
  const { fontStyle, setFontStyle } = useFontStyle();
  const { liteMode, setLiteMode } = useLiteMode();

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const options: { id: "dark" | "light" }[] = [{ id: "dark" }, { id: "light" }];
  // P2-10: font choice mirrors the theme rows — same radio pattern, no new UI
  // grammar. Pixel is the village identity; readable is the low-vision option.
  const fontOptions: { id: FontStyle }[] = [{ id: "pixel" }, { id: "readable" }];
  // O-R2 ③: lite mode reuses the same row grammar (full / lite) so the screen
  // stays one pattern. Lite routes motion, decorative crew, and the graph glow
  // LOD to their lightest existing settings for budget phones.
  const performanceOptions: { id: "full" | "lite" }[] = [{ id: "full" }, { id: "lite" }];

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.taste.island}
          worker={VILLAGE_UI.taste.worker}
          accent={VILLAGE_UI.taste.accent}
          speech={t("hero.speech")}
        />

        <View style={styles.list}>
          {options.map((o) => {
            const active = o.id === mode;
            const label = t(`options.${o.id}.label`);
            return (
              <View key={o.id} style={[styles.row, active ? { borderColor: semantic.brand } : null]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{label}</Text>
                  <Text variant="subtle" color="textSubtle">{t(`options.${o.id}.sub`)}</Text>
                </View>
                {active ? (
                  <View style={styles.statusPill}>
                    <Text variant="caption" color="brand">{t("actions.inUse")}</Text>
                  </View>
                ) : (
                  <Button
                    label={t("actions.use")}
                    variant="secondary"
                    onPress={() => setMode(o.id)}
                    accessibilityLabel={t("actions.useThemeLabel", { label })}
                    accessibilityHint={t("actions.useThemeHint")}
                  />
                )}
              </View>
            );
          })}
        </View>

        <Text variant="caption" color="textSubtle">{t("font.title")}</Text>
        <View style={styles.list}>
          {fontOptions.map((o) => {
            const active = o.id === fontStyle;
            const label = t(`font.options.${o.id}.label`);
            return (
              <View key={o.id} style={[styles.row, active ? { borderColor: semantic.brand } : null]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{label}</Text>
                  <Text variant="subtle" color="textSubtle">{t(`font.options.${o.id}.sub`)}</Text>
                </View>
                {active ? (
                  <View style={styles.statusPill}>
                    <Text variant="caption" color="brand">{t("actions.inUse")}</Text>
                  </View>
                ) : (
                  <Button
                    label={t("actions.use")}
                    variant="secondary"
                    onPress={() => setFontStyle(o.id)}
                    accessibilityLabel={t("font.useFontLabel", { label })}
                    accessibilityHint={t("font.useFontHint")}
                  />
                )}
              </View>
            );
          })}
        </View>

        <Text variant="caption" color="textSubtle">{t("performance.title")}</Text>
        <View style={styles.list}>
          {performanceOptions.map((o) => {
            const active = (o.id === "lite") === liteMode;
            const label = t(`performance.options.${o.id}.label`);
            return (
              <View key={o.id} style={[styles.row, active ? { borderColor: semantic.brand } : null]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{label}</Text>
                  <Text variant="subtle" color="textSubtle">{t(`performance.options.${o.id}.sub`)}</Text>
                </View>
                {active ? (
                  <View style={styles.statusPill}>
                    <Text variant="caption" color="brand">{t("actions.inUse")}</Text>
                  </View>
                ) : (
                  <Button
                    label={t("actions.use")}
                    variant="secondary"
                    onPress={() => setLiteMode(o.id === "lite")}
                    accessibilityLabel={t("performance.usePerformanceLabel", { label })}
                    accessibilityHint={t("performance.usePerformanceHint")}
                  />
                )}
              </View>
            );
          })}
        </View>

        <View style={[styles.note, { borderStartColor: cosmic.soulViolet }]}>
          <Text variant="subtle" color="textMuted">
            {t("note")}
          </Text>
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  note: {
    backgroundColor: semantic.surfaceAlt,
    borderStartWidth: 3,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  statusPill: {
    borderWidth: 1,
    borderColor: semantic.brand,
    borderRadius: radii.sm,
    backgroundColor: semantic.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
