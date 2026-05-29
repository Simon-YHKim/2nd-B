// Theme (A-to-Z Phase 12) — user-facing "테마". Dark / Light wired through
// the ThemeContext; System is shown as a placeholder option. The main graph
// stays dark even in light mode (non-negotiable constraint #4), surfaced as
// a clear note.

import { View, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
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

  const options: { id: "system" | "dark" | "light"; label: string; sub: string; placeholder?: boolean }[] = [
    {
      id: "system",
      label: locale === "ko" ? "시스템 따라가기" : "Match system",
      sub: locale === "ko" ? "기기 설정을 따라요. (곧 지원)" : "Follow your device. (coming soon)",
      placeholder: true,
    },
    { id: "dark", label: locale === "ko" ? "다크" : "Dark", sub: locale === "ko" ? "밤빛 기본 톤" : "The default night tone" },
    { id: "light", label: locale === "ko" ? "라이트" : "Light", sub: locale === "ko" ? "밝은 종이 톤" : "A bright paper tone" },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
            {locale === "ko" ? "설정" : "Settings"}
          </Text>
          <Text variant="heading">{locale === "ko" ? "테마" : "Theme"}</Text>
          <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
            {locale === "ko" ? "앱의 전체 톤을 골라요." : "Pick the overall tone of the app."}
          </Text>
        </View>

        <View style={styles.list}>
          {options.map((o) => {
            const active = !o.placeholder && o.id === mode;
            return (
              <View key={o.id} style={[styles.row, active ? { borderColor: semantic.brand } : null]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{o.label}</Text>
                  <Text variant="subtle" color="textSubtle">{o.sub}</Text>
                </View>
                <Button
                  label={active ? (locale === "ko" ? "사용 중" : "In use") : o.placeholder ? (locale === "ko" ? "준비 중" : "Soon") : (locale === "ko" ? "선택" : "Use")}
                  variant={active ? "primary" : "secondary"}
                  disabled={o.placeholder || active}
                  onPress={() => { if (o.id === "dark" || o.id === "light") setMode(o.id); }}
                />
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

        <Button label={locale === "ko" ? "설정으로" : "Back to settings"} variant="secondary" onPress={() => router.push("/settings")} />
      </ScrollView>
    </Screen>
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
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  note: {
    backgroundColor: semantic.surfaceAlt,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
});
