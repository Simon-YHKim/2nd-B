// D-09 M1: the Plans screen. Free is the local-unlimited core; Plus (cortex) and
// Pro (brain) add AI room. Honest by design (D-09 M5): there is NO in-app
// checkout here yet, because real billing goes through native IAP / Toss behind
// Simon's payment-provider setup (D-09 M3). Until then this screen shows the
// value and an honest "notify me at launch" CTA so the AI limit is never a
// dead end (persona PF-D). The contextual entry point is the SecondB chat usage
// panel, which links here when the daily AI limit is reached.

import { useState } from "react";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { PremiumAppShell, SceneHero, PremiumButton } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useProgression } from "@/lib/progression/useProgression";
import type { SubscriptionTier } from "@/lib/progression/entitlements";
import { VILLAGE_UI } from "@/lib/village-ui";

// Maps each displayed card to the SubscriptionTier(s) that count as "you are
// here". soma is a deprecated alias of Plus (D-09), so a legacy soma user still
// sees Plus highlighted as current.
const CARD_TIERS: { key: "free" | "plus" | "pro"; matches: SubscriptionTier[]; highlight: boolean }[] = [
  { key: "free", matches: ["free"], highlight: false },
  { key: "plus", matches: ["cortex", "soma"], highlight: true },
  { key: "pro", matches: ["brain"], highlight: false },
];

export default function Plans() {
  const { t, i18n } = useTranslation("plans");
  const locale = i18n.language === "ko" ? "ko" : "en";
  const eyebrowTracking = { letterSpacing: locale === "ko" ? 0 : 0.5 };
  const progression = useProgression();
  const [notified, setNotified] = useState(false);

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.work.island}
          worker={VILLAGE_UI.work.worker}
          accent={VILLAGE_UI.work.accent}
          speech={t("hero.speech")}
        />

        {CARD_TIERS.map(({ key, matches, highlight }) => {
          const isCurrent = !progression.loading && matches.includes(progression.tier);
          return (
            <View
              key={key}
              style={[styles.card, highlight ? styles.cardHighlight : null]}
              accessibilityLabel={`${t(`tiers.${key}.name`)} ${t(`tiers.${key}.price`)}`}
            >
              <View style={styles.cardHead}>
                <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
                  {t(`tiers.${key}.name`)}
                </Text>
                {isCurrent ? (
                  <Text variant="caption" color="textMuted" style={styles.currentTag}>
                    {t("current")}
                  </Text>
                ) : null}
              </View>
              <Text variant="heading">{t(`tiers.${key}.price`)}</Text>
              {key === "plus" ? (
                <Text variant="caption" color="textMuted">{t("tiers.plus.priceNote")}</Text>
              ) : null}
              <Text variant="subtle" color="textMuted" style={styles.tagline}>
                {t(`tiers.${key}.tagline`)}
              </Text>
              <View style={styles.features}>
                {(["f1", "f2", "f3"] as const).map((f) => (
                  <Text key={f} variant="subtle" color="text" style={styles.feature}>
                    {t(`tiers.${key}.${f}`)}
                  </Text>
                ))}
              </View>
            </View>
          );
        })}

        {/* D-09 M5: honest state. No fake checkout — real billing is gated on
            Simon's PG setup (D-09 M3). */}
        <View style={styles.notifyPanel}>
          <Text variant="subtle" color="textMuted">{t("comingSoon")}</Text>
          {notified ? (
            <Text variant="body" color="brand" style={styles.notifiedText}>{t("notified")}</Text>
          ) : (
            <>
              <PremiumButton label={t("notify")} variant="secondary" onPress={() => setNotified(true)} />
              <Text variant="caption" color="textMuted" style={styles.notifyHint}>{t("notifyHint")}</Text>
            </>
          )}
        </View>

        <Pressable
          onPress={() => router.back()}
          hitSlop={6}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={t("back")}
        >
          <Text variant="caption" color="brand">{t("back")}</Text>
        </Pressable>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  eyebrow: { fontWeight: "700" },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHighlight: {
    borderColor: semantic.brand,
    borderLeftWidth: 4,
    borderLeftColor: semantic.brand,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  currentTag: {
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  tagline: { marginTop: 2 },
  features: { marginTop: spacing.sm, gap: spacing.xs },
  feature: {},
  notifyPanel: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notifyHint: { marginTop: spacing.xs },
  notifiedText: { marginTop: spacing.xs },
  back: { alignSelf: "center", marginTop: spacing.sm, padding: spacing.sm },
});
