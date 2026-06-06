import { Link } from "expo-router";
import { Pressable, ScrollView, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

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
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={
            locale === "ko"
              ? "길이 끊긴 것 같아요. 중심에서 다시 이어볼게요."
              : "Looks like the path broke. Let's reconnect from the center."
          }
        />
        <View style={styles.actions}>
          <Link href="/" asChild>
            <Button
              label={locale === "ko" ? "마을 중심으로" : "Go home"}
              variant="primary"
              accessibilityHint={
                locale === "ko" ? "마을 중심 화면으로 이동합니다." : "Opens the village center."
              }
            />
          </Link>
        </View>
        <View style={styles.destinations}>
          <Text variant="caption" color="textMuted" style={styles.destinationsTitle}>
            {locale === "ko" ? "또는, 자주 가는 곳" : "Or, common destinations"}
          </Text>
          <Link href="/capture" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={locale === "ko" ? "조각 담기" : "Capture"}
              accessibilityHint={
                locale === "ko" ? "새 조각을 남기는 화면을 엽니다." : "Opens capture from the not-found page."
              }
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {locale === "ko" ? "조각 담기" : "Capture"}
              </Text>
            </Pressable>
          </Link>
          <Link href="/audit" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={locale === "ko" ? "과거의 나" : "Past me"}
              accessibilityHint={
                locale === "ko" ? "과거 기록을 돌아보는 화면을 엽니다." : "Opens the past-me timeline."
              }
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {locale === "ko" ? "과거의 나" : "Past me"}
              </Text>
            </Pressable>
          </Link>
          <Link href="/persona" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={locale === "ko" ? "나의 모습" : "Persona"}
              accessibilityHint={locale === "ko" ? "나의 모습 화면을 엽니다." : "Opens the persona screen."}
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {locale === "ko" ? "나의 모습" : "Persona"}
              </Text>
            </Pressable>
          </Link>
          <Link href="/manual" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={locale === "ko" ? "사용 안내서" : "Manual"}
              accessibilityHint={
                locale === "ko" ? "앱 사용 안내서를 엽니다." : "Opens the app manual from the not-found page."
              }
              style={styles.destinationLink}
            >
              <Text variant="body" color="brand">
                {locale === "ko" ? "사용 안내서" : "Manual"}
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
