// Root render-error fallback. Re-exported as `ErrorBoundary` from
// src/app/_layout.tsx so Expo Router catches any render error thrown below the
// root layout and shows this instead of a blank/white crash (handoff queue B,
// post-2026-06-26 crash hardening).
//
// CRITICAL — this renders OUTSIDE the app's providers. Theme, SafeArea, and the
// i18n React context all live inside the root layout's default export, which is
// exactly what threw. So this must NOT call useThemePalette / useSafeAreaInsets
// or any other context hook. It uses:
//   - static `semantic.*` tokens (no hex literals, per DESIGN.md),
//   - raw react-native primitives (system font, always available),
//   - i18n via useSuspense:false + defaultValue so it never suspends or shows a
//     raw key even if translations are not ready,
//   - one message + one action (Information Density),
//   - a flat surface, no shadow/elevation (Android Shine-through guard),
//   - generous lineHeight so Korean glyph descenders are not bottom-clipped.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ErrorBoundaryProps } from "expo-router";

import { radii, semantic, spacing } from "@/lib/theme/tokens";

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation("common", { useSuspense: false });

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.message}>
          {t("errors.unknown", { defaultValue: "Something went wrong. Please try again." })}
        </Text>

        {error?.message ? (
          <Text style={styles.detail} numberOfLines={3}>
            {error.message}
          </Text>
        ) : null}

        <Pressable
          onPress={() => {
            void retry();
          }}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={t("actions.retry", { defaultValue: "Retry" })}
          hitSlop={12}
        >
          <Text style={styles.buttonLabel}>
            {t("actions.retry", { defaultValue: "Retry" })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: spacing.md,
  },
  message: {
    color: semantic.text,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    color: semantic.textSubtle,
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: 2,
    textAlign: "center",
  },
  button: {
    marginTop: spacing.sm,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.brand,
    borderRadius: radii.md,
  },
  buttonLabel: {
    color: semantic.background,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    textAlign: "center",
  },
});
