// Profile hub. Route structure and accents stay in code; all user-facing hub
// labels and hints live in the profile locale namespace.

import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, type Href } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useProgression } from "@/lib/progression/useProgression";

interface HubRoute {
  sectionKey: string;
  key: string;
  route: Href;
  accent: string;
}

type HubCopy = {
  label: string;
  items: Record<string, { label: string; hint: string }>;
};

const PRIMARY_HUB_ITEMS: HubRoute[] = [
  { sectionKey: "center", key: "coreBrain", route: "/core-brain", accent: semantic.brand },
  { sectionKey: "center", key: "esm", route: "/esm", accent: semantic.brand },
  { sectionKey: "know", key: "persona", route: "/persona", accent: cosmic.soulViolet },
  { sectionKey: "analyze", key: "insights", route: "/insights", accent: cosmic.signalBlue },
];

function SettingsGlyph({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" accessibilityElementsHidden>
      <Circle cx="11" cy="11" r="3" stroke={color} strokeWidth={1.8} fill="none" />
      <Path
        d="M11 3 L11 5 M11 17 L11 19 M3 11 L5 11 M17 11 L19 11 M5.4 5.4 L6.8 6.8 M15.2 15.2 L16.6 16.6 M16.6 5.4 L15.2 6.8 M6.8 15.2 L5.4 16.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="square"
      />
    </Svg>
  );
}

function PlanGlyph({ color }: { color: string }) {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34" accessibilityElementsHidden>
      <Path d="M8 8 L26 8 L26 26 L8 26 Z" stroke={color} strokeWidth={2} fill="none" />
      <Path d="M12 17 L16 21 L23 13" stroke={color} strokeWidth={2} fill="none" strokeLinecap="square" strokeLinejoin="miter" />
    </Svg>
  );
}

export default function Profile() {
  const { t } = useTranslation("profile");
  const { t: tPlans } = useTranslation("plans");
  const { userId, loading } = useAuth();
  const progression = useProgression();
  const sections = t("sections", { returnObjects: true }) as Record<string, HubCopy>;

  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setEmail(data.user?.email ?? null);
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[profile] getUser failed", (e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const displayName = email ? email.split("@")[0] : t("fallbackName");
  const profileTitle = t("hero.title", { displayName });
  const planKey =
    progression.tier === "brain"
      ? "pro"
      : progression.tier === "cortex" || progression.tier === "soma"
        ? "plus"
        : "free";
  const planName = progression.loading ? tPlans("loading") : tPlans(`tiers.${planKey}.name`);
  const planTagline = tPlans(`tiers.${planKey}.tagline`);
  const settingsCopy = sections.account.items.settings;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topBar} accessible accessibilityLabel={profileTitle}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted" style={styles.eyebrow}>
              {t("hero.eyebrow")}
            </Text>
            <Text variant="heading" numberOfLines={1}>
              {displayName}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.settingsButton}
            accessibilityRole="button"
            accessibilityLabel={settingsCopy.label}
            accessibilityHint={settingsCopy.hint}
          >
            <SettingsGlyph color={semantic.brand} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/plans")}
          activeOpacity={0.7}
          style={styles.subscriptionCard}
          accessibilityRole="button"
          accessibilityLabel={`${tPlans("current")}: ${planName}`}
        >
          <View style={styles.planIcon}>
            <PlanGlyph color={semantic.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand" style={styles.eyebrow}>
              {tPlans("current")}
            </Text>
            <Text variant="heading">{planName}</Text>
            <Text variant="subtle" color="textMuted" numberOfLines={2}>
              {planTagline}
            </Text>
          </View>
          {progression.loading ? (
            <ActivityIndicator color={semantic.brand} />
          ) : (
            <Text variant="caption" color="brand">
              {tPlans("hero.eyebrow")}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.accountStrip}>
          {busy ? (
            <ActivityIndicator color={semantic.brand} />
          ) : (
            <Text variant="subtle" color="textMuted" numberOfLines={1}>
              {email ?? t("account.emailUnavailable")}
            </Text>
          )}
        </View>

        <View style={styles.quickGrid}>
          {PRIMARY_HUB_ITEMS.map((item) => {
            const itemCopy = sections[item.sectionKey].items[item.key];
            return (
              <TouchableOpacity
                key={String(item.route)}
                onPress={() => router.push(item.route)}
                activeOpacity={0.7}
                style={[styles.quickChip, { borderColor: item.accent }]}
                accessibilityRole="button"
                accessibilityLabel={itemCopy.label}
                accessibilityHint={itemCopy.hint}
              >
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {itemCopy.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.lg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.surface,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    ...pixelShadowStyle(),
  },
  subscriptionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: gameboy.borderWidth,
    borderStartWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    borderRadius: gameboy.radius,
    padding: spacing.lg,
    gap: spacing.md,
    ...pixelShadowStyle(semantic.brand),
  },
  planIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.surfaceAlt,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    ...pixelShadowStyle(),
  },
  accountStrip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  eyebrow: { letterSpacing: 0 },
  quickChip: {
    width: "48%",
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: semantic.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
    ...pixelShadowStyle(),
  },
});
