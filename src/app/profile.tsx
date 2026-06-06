// Profile hub. Route structure and accents stay in code; all user-facing hub
// labels and hints live in the profile locale namespace.

import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, type Href } from "expo-router";

import { PremiumAppShell, SceneHero, PremiumLoadingState } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

interface HubRoute {
  key: string;
  route: Href;
}

interface HubSection {
  key: string;
  accent: string;
  items: HubRoute[];
}

type HubCopy = {
  label: string;
  items: Record<string, { label: string; hint: string }>;
};

const HUB: HubSection[] = [
  {
    key: "center",
    accent: semantic.brand,
    items: [
      { key: "coreBrain", route: "/core-brain" },
      { key: "esm", route: "/esm" },
    ],
  },
  {
    key: "know",
    accent: cosmic.soulViolet,
    items: [
      { key: "persona", route: "/persona" },
      { key: "bigFive", route: "/big-five" },
      { key: "attachment", route: "/attachment" },
      { key: "audit", route: "/audit" },
      { key: "interview", route: "/interview" },
    ],
  },
  {
    key: "analyze",
    accent: cosmic.signalBlue,
    items: [
      { key: "insights", route: "/insights" },
      { key: "trinity", route: "/trinity" },
      { key: "research", route: "/research" },
    ],
  },
  {
    key: "account",
    accent: cosmic.mistGray,
    items: [
      { key: "settings", route: "/settings" },
      { key: "privacy", route: "/privacy" },
      { key: "account", route: "/account" },
      { key: "theme", route: "/theme" },
      { key: "data", route: "/data" },
      { key: "formats", route: "/formats" },
      { key: "manual", route: "/manual" },
      { key: "import", route: "/import" },
      { key: "inbox", route: "/inbox" },
      { key: "support", route: "/support" },
      { key: "permissions", route: "/permissions" },
    ],
  },
];

export default function Profile() {
  const { t } = useTranslation("profile");
  const { userId, loading } = useAuth();
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

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title", { displayName })}
          subtitle={t("hero.subtitle")}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={t("hero.speech")}
        />

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>
            {t("account.eyebrow")}
          </Text>
          <Text variant="heading" style={{ fontSize: 20 }}>{displayName}</Text>
          {busy ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: "flex-start" }} />
          ) : (
            <Text variant="body" color="textMuted">
              {email ?? t("account.emailUnavailable")}
            </Text>
          )}
        </View>

        {HUB.map((section) => {
          const sectionCopy = sections[section.key];
          return (
            <View key={section.key} style={[styles.section, { borderLeftColor: section.accent }]}>
              <Text variant="caption" color="textMuted" style={styles.eyebrow}>
                {sectionCopy.label}
              </Text>
              <View style={styles.chipRow}>
                {section.items.map((item) => {
                  const itemCopy = sectionCopy.items[item.key];
                  return (
                    <Pressable
                      key={String(item.route)}
                      onPress={() => router.push(item.route)}
                      style={styles.chip}
                      accessibilityRole="button"
                      accessibilityLabel={itemCopy.label}
                      accessibilityHint={itemCopy.hint}
                    >
                      <Text variant="subtle" color="textMuted">{itemCopy.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.lg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: { letterSpacing: 0 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: semantic.surfaceAlt,
  },
});
