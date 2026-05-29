// Data management (A-to-Z Phase 12) — user-facing "데이터 관리". Structural
// hub that explains each data action in plain language and routes to the
// place that performs it. The actual destructive controls live in the
// settings danger zone; export lives on the wiki screen. This screen makes
// the data-control surface discoverable and explains what each does.

import { View, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";

export default function DataManagement() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const ko = locale === "ko";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
            {ko ? "설정" : "Settings"}
          </Text>
          <Text variant="heading">{ko ? "데이터 관리" : "Data management"}</Text>
          <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
            {ko ? "내 조각들을 내보내거나 정리할 수 있어요." : "Export or clean up your pieces."}
          </Text>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "내보내기" : "Export"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "지식 창고에서 내 조각들을 하나의 텍스트로 모아 복사할 수 있어요. 백업이나 다른 곳으로 옮길 때 쓰세요."
              : "From the store you can gather your pieces into one text to copy — handy for a backup or moving elsewhere."}
          </Text>
          <Button label={ko ? "지식 창고에서 내보내기" : "Export from the store"} variant="secondary" onPress={() => router.push("/wiki")} />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.danger }]}>
          <Text variant="caption" color="danger" style={styles.eyebrow}>{ko ? "삭제" : "Delete"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "특정 종류만 지우거나, 전체를 한 번에 지울 수 있어요. 삭제는 되돌릴 수 없으니 내보내기를 먼저 권해요."
              : "Delete one kind, or everything at once. Deletion can't be undone, so export first."}
          </Text>
          <Button label={ko ? "삭제 옵션 열기" : "Open delete options"} variant="secondary" onPress={() => router.push("/settings")} />
        </View>

        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "기기 설정" : "On this device"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "이 기기에 저장된 화면 설정·첫 진입 안내 표시 여부 같은 가벼운 항목을 초기화해요. (곧 지원)"
              : "Reset lightweight on-device bits like view preferences and the first-run hints. (coming soon)"}
          </Text>
          <Button label={ko ? "기기 설정 초기화" : "Clear device preferences"} variant="secondary" disabled />
        </View>

        <Button label={ko ? "설정으로" : "Back to settings"} variant="secondary" onPress={() => router.push("/settings")} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: { letterSpacing: 1 },
});
