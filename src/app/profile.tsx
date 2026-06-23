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
import { semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useProgression } from "@/lib/progression/useProgression";
import { DeepSpaceLinks } from "@/components/deep-space/DeepSpaceLinks";

type HubCopy = {
  label: string;
  items: Record<string, { label: string; hint: string }>;
};

type DeepSpaceProfileSection = "know" | "analyze";

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
  const { t, i18n } = useTranslation("profile");
  const { t: tPlans } = useTranslation("plans");
  const { userId, loading } = useAuth();
  const progression = useProgression();
  const sections = t("sections", { returnObjects: true }) as Record<string, HubCopy>;
  const deepSpaceMode = true;
  const [activeDeepSpaceSection, setActiveDeepSpaceSection] = useState<DeepSpaceProfileSection>("know");

  const [email, setEmail] = useState<string | null>(null);
  const [_busy, setBusy] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const supabase = getSupabaseClient();
        // Identity display must be offline-resilient. getUser() hits the network to
        // re-validate the JWT, so when the backend is unreachable a signed-in user's
        // email returns null and the profile falls back to "Guest" / "Email unavailable"
        // -- misleading them into thinking they are signed out. getSession() reads the
        // locally-persisted session, so the real email shows even offline; "Guest" then
        // means genuinely signed out (no session), not "backend currently unreachable".
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setEmail(data.session?.user?.email ?? null);
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[profile] getSession failed", (e as Error).message);
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
  // Monetization v2 (2026-06-10): every tier sells under its own name, so the
  // enum value is the plans.json card key directly (soma is live again).
  const planKey = progression.tier;
  const planName = progression.loading ? tPlans("loading") : tPlans(`tiers.${planKey}.name`);
  const planTagline = tPlans(`tiers.${planKey}.tagline`);
  const settingsCopy = sections.account.items.settings;
  const deepSpaceSections: {
    key: DeepSpaceProfileSection;
    label: string;
    group: { title: string; items: { key: string; label: string; route: Href }[] };
  }[] = [
    {
      key: "know",
      label: sections.know.label,
      group: {
        title: sections.know.label,
        items: [
          { key: "core-brain", label: sections.center.items.coreBrain.label, route: "/core-brain" },
          { key: "persona", label: sections.know.items.persona.label, route: "/persona" },
          { key: "insights", label: sections.analyze.items.insights.label, route: "/insights" },
          { key: "trends", label: i18n.language?.toLowerCase().startsWith("ko") ? "트렌드" : "Trends", route: "/trends" },
        ],
      },
    },
    {
      key: "analyze",
      label: sections.analyze.label,
      group: {
        title: sections.analyze.label,
        items: [
          { key: "big-five", label: sections.know.items.bigFive.label, route: "/big-five" },
          { key: "mbti", label: sections.know.items.mbti.label, route: "/mbti" },
          { key: "attachment", label: sections.know.items.attachment.label, route: "/attachment" },
          { key: "trinity", label: sections.analyze.items.trinity.label, route: "/trinity" },
          { key: "esm", label: sections.center.items.esm.label, route: "/esm" },
          { key: "interview", label: sections.know.items.interview.label, route: "/interview" },
          { key: "audit", label: sections.know.items.audit.label, route: "/audit" },
        ],
      },
    },
  ];
  const activeDeepSpaceGroup =
    deepSpaceSections.find((section) => section.key === activeDeepSpaceSection)?.group ?? deepSpaceSections[0].group;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topBar} accessible accessibilityLabel={profileTitle}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted" style={[styles.eyebrow, deepSpaceMode && styles.deepSpaceMutedText]}>
              {t("hero.eyebrow")}
            </Text>
            <Text variant="heading" numberOfLines={1} style={deepSpaceMode && styles.deepSpaceText}>
              {displayName}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            hitSlop={14}
            activeOpacity={0.7}
            style={[styles.settingsButton, deepSpaceMode && styles.deepSpaceIconButton]}
            accessibilityRole="button"
            accessibilityLabel={settingsCopy.label}
            accessibilityHint={settingsCopy.hint}
          >
            <SettingsGlyph color={deepSpaceMode ? semantic.deepSpaceText : semantic.brand} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/plans")}
          activeOpacity={0.7}
          style={[styles.subscriptionCard, deepSpaceMode && styles.deepSpaceSubscriptionCard]}
          accessibilityRole="button"
          accessibilityLabel={`${tPlans("current")}: ${planName}`}
        >
          <View style={[styles.planIcon, deepSpaceMode && styles.deepSpacePlanIcon]}>
            <PlanGlyph color={deepSpaceMode ? semantic.deepSpaceAccent : semantic.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand" style={[styles.eyebrow, deepSpaceMode && styles.deepSpaceText]}>
              {tPlans("current")}
            </Text>
            <Text variant="heading" style={deepSpaceMode && styles.deepSpaceText}>
              {planName}
            </Text>
            <Text variant="subtle" color="textMuted" numberOfLines={2} style={deepSpaceMode && styles.deepSpaceMutedText}>
              {planTagline}
            </Text>
          </View>
          {progression.loading ? (
            <ActivityIndicator color={deepSpaceMode ? semantic.deepSpaceAccent : semantic.brand} />
          ) : (
            <Text variant="caption" color="brand" style={deepSpaceMode && styles.deepSpaceText}>
              {tPlans("hero.eyebrow")}
            </Text>
          )}
        </TouchableOpacity>

        {/* O-31 Stage4/6: one summary card above, then reveal one route cluster
            at a time via the disclosure tabs. */}
        <View style={styles.deepSpaceDisclosure}>
          <View style={styles.deepSpaceTabs} accessibilityRole="tablist">
            {deepSpaceSections.map((section) => {
              const selected = section.key === activeDeepSpaceSection;
              return (
                <TouchableOpacity
                  key={section.key}
                  onPress={() => setActiveDeepSpaceSection(section.key)}
                  activeOpacity={0.72}
                  style={[styles.deepSpaceTab, selected && styles.deepSpaceTabActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={section.label}
                >
                  <Text
                    variant="caption"
                    style={[styles.deepSpaceTabText, selected && styles.deepSpaceTabTextActive]}
                  >
                    {section.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <DeepSpaceLinks groups={[activeDeepSpaceGroup]} />
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
    flexBasis: "48%",
    flexGrow: 1,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: semantic.surfaceAlt,
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...pixelShadowStyle(),
  },
  quickChipIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.surface,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
  },
  quickChipCopy: { flex: 1, minWidth: 0, gap: 2 },
  quickChipLabel: { lineHeight: 20 },
  quickChipHint: { lineHeight: 16 },
  deepSpaceText: { color: semantic.deepSpaceText },
  deepSpaceMutedText: { color: semantic.deepSpaceTextMuted },
  deepSpaceIconButton: {
    backgroundColor: semantic.deepSpaceCard,
    borderColor: semantic.deepSpaceCardLine,
    borderWidth: 1,
    borderRadius: 10,
    shadowOpacity: 0,
    elevation: 0,
  },
  deepSpaceSubscriptionCard: {
    backgroundColor: semantic.deepSpaceCard,
    borderColor: semantic.deepSpaceAccent,
    borderWidth: 1,
    borderStartWidth: 1,
    borderStartColor: semantic.deepSpaceAccent,
    borderRadius: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  deepSpacePlanIcon: {
    backgroundColor: semantic.deepSpaceCard,
    borderColor: semantic.deepSpaceCardLine,
    borderWidth: 1,
    borderRadius: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  deepSpaceDisclosure: { gap: spacing.md },
  deepSpaceTabs: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: 4,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: semantic.deepSpaceCardLine,
    backgroundColor: semantic.deepSpaceCard,
  },
  deepSpaceTab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.deepSpaceCardLine,
  },
  deepSpaceTabActive: {
    borderColor: semantic.deepSpaceAccent,
    backgroundColor: semantic.deepSpaceCardPressed,
  },
  deepSpaceTabText: { color: semantic.deepSpaceTextMuted, letterSpacing: 0, textAlign: "center" },
  deepSpaceTabTextActive: { color: semantic.deepSpaceText },
});
