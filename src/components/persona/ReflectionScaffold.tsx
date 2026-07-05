// A small, dismissible scaffold shown UNDER a reflection summary. It models how to
// interpret the mirror with two concrete steps (see lib/persona/reflection-scaffold
// for the why: lower-disposition reflectors get no benefit from a passive read, so
// we model an active step instead of adding more text). The CTA routes to capture so
// the user can act on it in one line. Generic + shell-agnostic; render it wherever a
// narrative reflection is shown.

import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";

import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { reflectionScaffold } from "@/lib/persona/reflection-scaffold";
import { useTranslation } from "react-i18next";

export function ReflectionScaffold({ locale }: { locale: "en" | "ko" }) {
  const { t } = useTranslation("common");
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const copy = reflectionScaffold(locale);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="caption" color="textMuted" style={styles.title}>
          {copy.title}
        </Text>
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel={t("reflectDismiss")}
          hitSlop={10}
          style={styles.dismiss}
        >
          <Text variant="caption" color="textSubtle">
            {t("reflectDismiss")}
          </Text>
        </Pressable>
      </View>

      {copy.steps.map((step, i) => (
        <View key={i} style={styles.stepRow}>
          <Text variant="caption" color="brand" style={styles.stepNum}>
            {i + 1}
          </Text>
          <Text variant="body" style={styles.stepText}>
            {step}
          </Text>
        </View>
      ))}

      <Pressable
        onPress={() => router.push("/capture")}
        accessibilityRole="button"
        accessibilityLabel={copy.cta}
        style={styles.cta}
      >
        <Text variant="caption" color="brand">
          {copy.cta}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderStartColor: cosmic.signalMint,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1 },
  dismiss: { minHeight: 28, justifyContent: "center", paddingHorizontal: spacing.xs },
  stepRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  stepNum: { minWidth: 14, textAlign: "center" },
  stepText: { flex: 1 },
  cta: { minHeight: 44, justifyContent: "center", marginTop: spacing.xs },
});
