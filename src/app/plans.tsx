// Monetization v2 Plans screen (Simon-approved 2026-06-10). Free is the
// unlimited record core; Soma / Cortex / Brain add AI room at the confirmed
// list prices (src/lib/progression/pricing.ts is the SoT; pricing.test.ts
// guards this screen's copy against drift). Honest by design: there is NO
// in-app checkout yet — real billing goes through native IAP (+ Small
// Business Program) behind Simon's store setup. Until then this screen shows
// the final prices and a truthful coming-soon status so the AI limit is never
// a dead end (persona PF-D). The contextual entry point is the SecondB chat
// usage panel, which links here when the daily AI limit is reached.

import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useProgression } from "@/lib/progression/useProgression";
import type { SubscriptionTier } from "@/lib/progression/entitlements";
import { LIFETIME } from "@/lib/progression/pricing";
import { VILLAGE_UI } from "@/lib/village-ui";

// Every tier sells under its own enum name (v2: soma is live again as the
// entry tier). The highlighted card is soma — the step the free AI limit
// points at (NEXT_TIER in src/lib/chat/limits.ts).
const CARD_TIERS: { key: SubscriptionTier; highlight: boolean }[] = [
  { key: "free", highlight: false },
  { key: "soma", highlight: true },
  { key: "cortex", highlight: false },
  { key: "brain", highlight: false },
];

export default function Plans() {
  const { t, i18n } = useTranslation("plans");
  const locale = i18n.language === "ko" ? "ko" : "en";
  const eyebrowTracking = { letterSpacing: locale === "ko" ? 0 : 0.5 };
  const progression = useProgression();

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

        {CARD_TIERS.map(({ key, highlight }) => {
          const isCurrent = !progression.loading && progression.tier === key;
          return (
            <View
              key={key}
              style={[styles.card, highlight ? styles.cardHighlight : null]}
              accessibilityRole="text"
              accessibilityLabel={`${t(`tiers.${key}.name`)} ${t(`tiers.${key}.price`)}${isCurrent ? ", " + t("current") : ""}`}
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
              {key !== "free" ? (
                <Text variant="caption" color="textMuted">{t(`tiers.${key}.priceNote`)}</Text>
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
              {key === LIFETIME.tier ? (
                <Text variant="caption" color="textMuted" style={styles.lifetimeNote}>
                  {t(`tiers.${LIFETIME.tier}.lifetimeNote`)}
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* Honest state. No fake checkout AND no notify-signup we cannot
            honor (there is no email capture / backend yet) — just a truthful
            status. Real billing is gated on Simon's store/IAP setup. */}
        <View style={styles.notifyPanel}>
          <Text variant="subtle" color="textMuted">{t("comingSoon")}</Text>
          <Text variant="caption" color="textMuted" style={styles.notifyHint}>{t("comingSoonBody")}</Text>
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
    borderStartWidth: 4,
    borderStartColor: semantic.brand,
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
  lifetimeNote: { marginTop: spacing.xs },
  notifyPanel: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notifyHint: { marginTop: spacing.xs },
  back: { alignSelf: "center", marginTop: spacing.sm, padding: spacing.sm, minHeight: 44, justifyContent: "center" },
});
