// AppNav — single "back to the navigator" affordance.
//
// Per user directive (2026-05-27): the main screen becomes the network
// navigator (NavGraph). Every other screen surfaces this one-button
// strip so users can always return to the dot constellation. The
// constellation IS the menu — duplicating it as a list at the bottom
// of every screen would compete with that mental model.
//
// Older versions of AppNav rendered three rows of buttons (Daily /
// Self / Meta). That role is retired: the dots cover discovery, the
// back button handles return. We keep the AppNav export + signature
// so every screen that already imported `<AppNav locale={locale} />`
// keeps compiling without a touch.

import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { semantic, spacing } from "@/lib/theme/tokens";

export function AppNav({ locale }: { locale: "en" | "ko" }) {
  return (
    <View style={styles.wrap}>
      <Button
        label={locale === "ko" ? "← 네비게이터로" : "← Back to navigator"}
        variant="secondary"
        onPress={() => router.push("/")}
      />
      <Text variant="subtle" color="textSubtle" style={styles.hint}>
        {locale === "ko"
          ? "메인 화면의 점들 중 하나로 바로 이동할 수 있어요."
          : "Jump anywhere from the main dots."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    alignItems: "stretch",
  },
  hint: { textAlign: "center", letterSpacing: 0.5, fontSize: 11 },
});
