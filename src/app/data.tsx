// Data management (A-to-Z Phase 12) — user-facing "데이터 관리". Structural
// hub that explains each data action in plain language and routes to the
// place that performs it. The actual destructive controls live in the
// settings danger zone; export lives on the wiki screen. This screen makes
// the data-control surface discoverable and explains what each does.

import { View, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
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
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={ko ? "08-1. 데이터 관리" : "08-1. Data management"}
          title={ko ? "조각을 옮기고 정리해요" : "Move and organize your pieces"}
          subtitle={ko ? "가져오기 · 내보내기 · 삭제" : "Import · export · delete"}
          island="knowledge"
          worker="momo"
          speech={
            ko
              ? "중요한 조각을 지우기 전에는 먼저 내보내기로 백업해두세요."
              : "Before deleting anything important, export a backup first."
          }
          islandSize={250}
          workerSize={104}        />

        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "가져오기" : "Import"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "다른 AI가 정리한 나, 예전에 한 성향·성격 검사 결과를 가져와 우리 구조에 맞게 분류해 보관해요."
              : "Bring in what another assistant gathered about you, or a past disposition/personality test, sorted into your structure."}
          </Text>
          <Button label={ko ? "외부 자료 가져오기" : "Import external material"} variant="secondary" onPress={() => router.push("/import")} />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "내보내기" : "Export"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "지식 창고에서 내 조각들을 하나의 텍스트로 모아 복사할 수 있어요. 백업이나 다른 곳으로 옮길 때 쓰세요."
              : "From the store you can gather your pieces into one text to copy. Handy for a backup or moving elsewhere."}
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
          <View style={styles.statusPill}>
            <Text variant="caption" color="textSubtle">
              {ko ? "곧 지원" : "Coming soon"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
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
  eyebrow: { letterSpacing: 1 },
  statusPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.sm,
    backgroundColor: semantic.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
