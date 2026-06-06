// Data management (A-to-Z Phase 12) — user-facing "데이터 관리". Structural
// hub that explains each data action in plain language and routes to the
// place that performs it. The actual destructive controls live in the
// settings danger zone; export lives on the wiki screen. This screen makes
// the data-control surface discoverable and explains what each does.

import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { VILLAGE_UI } from "@/lib/village-ui";

export default function DataManagement() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "데이터 도구를 불러오는 중이에요…" : "Loading data tools…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const ko = locale === "ko";

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
<ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SceneHero
          eyebrow={ko ? "08-1. 데이터 관리" : "08-1. Data management"}
          title={ko ? "조각을 옮기고 정리해요" : "Move and organize your pieces"}
          subtitle={ko ? "가져오기 · 내보내기 · 삭제" : "Import · export · delete"}
          island={VILLAGE_UI.records.island}
          worker={VILLAGE_UI.records.worker}
          accent={VILLAGE_UI.records.accent}
          speech={
            ko
              ? "중요한 조각을 지우기 전에는 먼저 내보내기로 백업해두세요."
              : "Before deleting anything important, export a backup first."
          }
        />

        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "가져오기" : "Import"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "다른 AI가 정리한 나, 예전에 한 성향·성격 검사 결과를 가져와 우리 구조에 맞게 분류해 보관해요."
              : "Bring in what another assistant gathered about you, or a past disposition/personality test, sorted into your structure."}
          </Text>
          <Button
            label={ko ? "외부 자료 가져오기" : "Import external material"}
            variant="secondary"
            onPress={() => router.push("/import")}
            accessibilityHint={ko ? "외부 자료 가져오기 화면으로 이동합니다." : "Opens the import screen."}
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "내보내기" : "Export"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "지식 창고에서 내 조각들을 하나의 텍스트로 모아 복사할 수 있어요. 백업이나 다른 곳으로 옮길 때 쓰세요."
              : "From the store you can gather your pieces into one text to copy. Handy for a backup or moving elsewhere."}
          </Text>
          <Button
            label={ko ? "지식 창고에서 내보내기" : "Export from the store"}
            variant="secondary"
            onPress={() => router.push("/wiki")}
            accessibilityHint={ko ? "지식 창고 화면으로 이동합니다." : "Opens the knowledge store."}
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.danger }]}>
          <Text variant="caption" color="danger" style={styles.eyebrow}>{ko ? "삭제" : "Delete"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "특정 종류만 지우거나, 전체를 한 번에 지울 수 있어요. 삭제는 되돌릴 수 없으니 내보내기를 먼저 권해요."
              : "Delete one kind, or everything at once. Deletion can't be undone, so export first."}
          </Text>
          <Button
            label={ko ? "삭제 옵션 열기" : "Open delete options"}
            variant="secondary"
            onPress={() => router.push("/settings")}
            accessibilityHint={ko ? "설정 화면의 삭제 옵션으로 이동합니다." : "Opens delete options in Settings."}
          />
        </View>

        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "기기 설정" : "On this device"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "화면 설정이나 첫 진입 안내 표시 여부 같은 가벼운 항목은 이 기기에만 저장돼요. 내 조각 데이터와 달리 기기를 바꾸거나 앱 데이터를 지우면 함께 초기화돼요."
              : "Lightweight bits like view preferences and first-run hints live only on this device. Unlike your pieces, they reset on their own when you switch devices or clear the app's data."}
          </Text>
        </View>
      </ScrollView>
</KeyboardAvoidingView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: { letterSpacing: 0 },
});
