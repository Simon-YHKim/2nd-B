// Theme (A-to-Z Phase 12) — user-facing "테마". Dark / Light wired through
// the ThemeContext. The main graph
// stays dark even in light mode (non-negotiable constraint #4), surfaced as
// a clear note.

import { View, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme } from "@/lib/theme/ThemeContext";

export default function ThemeScreen() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { mode, setMode } = useTheme();

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const options: { id: "dark" | "light"; label: string; sub: string }[] = [
    { id: "dark", label: locale === "ko" ? "다크" : "Dark", sub: locale === "ko" ? "밤빛 기본 톤" : "The default night tone" },
    { id: "light", label: locale === "ko" ? "라이트" : "Light", sub: locale === "ko" ? "밝은 종이 톤" : "A bright paper tone" },
  ];

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "08-4. 테마" : "08-4. Theme"}
          title={locale === "ko" ? "마을의 빛을 고르세요" : "Choose the village light"}
          subtitle={locale === "ko" ? "밤빛 기본 · 밝은 보조 톤" : "Night default · bright secondary tone"}
          island="inspiration"
          worker="lulu"
          speech={locale === "ko" ? "메인 그래프는 언제나 밤빛이에요. 별과 연결이 가장 또렷하거든요." : "The main graph always keeps the night sky so stars and links stay crisp."}
          islandSize={250}
          workerSize={104}
          railIcons={["✦", "◐", "☼", "◇"]}
        />

        <View style={styles.list}>
          {options.map((o) => {
            const active = o.id === mode;
            return (
              <View key={o.id} style={[styles.row, active ? { borderColor: semantic.brand } : null]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{o.label}</Text>
                  <Text variant="subtle" color="textSubtle">{o.sub}</Text>
                </View>
                {active ? (
                  <View style={styles.statusPill}>
                    <Text variant="caption" color="brand">{locale === "ko" ? "사용 중" : "In use"}</Text>
                  </View>
                ) : (
                  <Button
                    label={locale === "ko" ? "적용" : "Use"}
                    variant="secondary"
                    onPress={() => setMode(o.id)}
                  />
                )}
              </View>
            );
          })}
        </View>

        <View style={[styles.note, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "밤빛 조각마을(메인 그래프)은 라이트 모드에서도 어두운 톤을 유지해요. 별과 연결이 가장 잘 보이는 배경이거든요."
              : "The graph village stays dark even in light mode — it's the background where the stars and connections read best."}
          </Text>
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
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
    shadowColor: "#A78BFA",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  note: {
    backgroundColor: semantic.surfaceAlt,
    borderLeftWidth: 3,
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
