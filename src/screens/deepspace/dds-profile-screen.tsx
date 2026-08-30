import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader, SecondbHead } from "@/components/deepspace";
import { m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { m3 } from "@/lib/theme/m3";
import { canPublishProfileIdentity, loadProfileIdentity } from "./dds-profile-identity";

type ProfileSection = "know" | "analyze";

interface ProfileRouteItem {
  key: string;
  route: Href;
  label: string;
  hint?: string;
}

interface ProfileRouteGroup {
  key: ProfileSection;
  label: string;
  items: ProfileRouteItem[];
}

type HubCopy = {
  label: string;
  items: Record<string, { label: string; hint: string }>;
};

interface IdentityState {
  owner: string | null;
  value: string | null;
  loading: boolean;
}

export function DeepSpaceProfileScreen() {
  const { t } = useTranslation("profile");
  const { t: tDeepSpace } = useTranslation("deepspace");
  const { t: tHome } = useTranslation("home");
  const { t: tPlans } = useTranslation("plans");
  const { t: tCommon } = useTranslation("common");
  const { userId, loading } = useAuth();
  const progression = useProgression();
  const sections = t("sections", { returnObjects: true }) as Record<string, HubCopy>;
  const [activeSection, setActiveSection] = useState<ProfileSection>("know");
  const [identity, setIdentity] = useState<IdentityState>({ owner: null, value: null, loading: true });
  const activeUserRef = useRef(userId);
  activeUserRef.current = userId;

  useEffect(() => {
    if (!userId) {
      setIdentity({ owner: null, value: null, loading: false });
      return;
    }

    const requestedUserId = userId;
    let cancelled = false;
    setIdentity({ owner: requestedUserId, value: null, loading: true });
    const isActive = () => canPublishProfileIdentity(cancelled, requestedUserId, activeUserRef.current);

    void loadProfileIdentity(requestedUserId).then((value) => {
      if (!isActive()) return;
      setIdentity({ owner: requestedUserId, value, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <DeepSpaceScreen active="settings" header="none">
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" caption={t("loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const identityResolved = identity.owner === userId && !identity.loading;
  const displayName = identityResolved ? identity.value ?? t("fallbackName") : t("loading");
  const profileTitle = t("hero.title", { displayName });
  const planKey = progression.tier;
  const planName = progression.loading ? tPlans("loading") : tPlans(`tiers.${planKey}.name`);
  const planTagline = progression.loading ? null : tPlans(`tiers.${planKey}.tagline`);

  const routeGroups: ProfileRouteGroup[] = [
    {
      key: "know",
      label: sections.know.label,
      items: [
        {
          key: "core-brain",
          route: "/core-brain",
          label: sections.center.items.coreBrain.label,
          hint: sections.center.items.coreBrain.hint,
        },
        {
          key: "profile-details",
          route: "/profile-details",
          label: tDeepSpace("profileDetails.screenTitle"),
          hint: tDeepSpace("profileDetails.intro"),
        },
        {
          key: "insights",
          route: "/insights",
          label: sections.analyze.items.insights.label,
          hint: sections.analyze.items.insights.hint,
        },
        {
          key: "brightness",
          route: "/brightness",
          label: tDeepSpace("trends.title"),
        },
        {
          key: "growth",
          route: "/growth",
          label: sections.know.items.growth.label,
          hint: sections.know.items.growth.hint,
        },
      ],
    },
    {
      key: "analyze",
      label: sections.analyze.label,
      items: [
        {
          key: "big-five",
          route: "/big-five",
          label: sections.know.items.bigFive.label,
          hint: sections.know.items.bigFive.hint,
        },
        {
          key: "ipip",
          route: "/ipip-neo",
          label: sections.know.items.ipip.label,
          hint: sections.know.items.ipip.hint,
        },
        {
          key: "rlss",
          route: "/rlss",
          label: sections.know.items.rlss.label,
          hint: sections.know.items.rlss.hint,
        },
        {
          key: "attachment",
          route: "/attachment",
          label: sections.know.items.attachment.label,
          hint: sections.know.items.attachment.hint,
        },
        { key: "seen", route: "/seen", label: tHome("ds.home.starName.seen") },
        {
          key: "esm",
          route: "/esm",
          label: sections.center.items.esm.label,
          hint: sections.center.items.esm.hint,
        },
        {
          key: "interview",
          route: "/interview",
          label: sections.know.items.interview.label,
          hint: sections.know.items.interview.hint,
        },
        {
          key: "audit",
          route: "/audit",
          label: sections.know.items.audit.label,
          hint: sections.know.items.audit.hint,
        },
      ],
    },
  ];
  const activeGroup = routeGroups.find((group) => group.key === activeSection) ?? routeGroups[0];

  return (
    <DeepSpaceScreen active="settings" header="none">
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <PixelPressable
            variant="bevel"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityLabel={tCommon("actions.back")}
            contentStyle={styles.squareButtonContent}
          >
            <PixelGlyph name="arrowBack" color={m3.color.onSurface} size={24} />
          </PixelPressable>
          <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.title]}>
            {t("hero.eyebrow")}
          </RNText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identityRow}>
            <SecondbHead size={48} mood="neutral" />
            <RNText
              accessibilityLabel={profileTitle}
              numberOfLines={1}
              style={[m3TextStyle("titleMedium"), styles.identityName]}
            >
              {displayName}
            </RNText>
            <PixelPressable
              variant="bevel"
              onPress={() => router.push("/settings")}
              accessibilityLabel={sections.account.items.settings.label}
              accessibilityHint={sections.account.items.settings.hint}
              contentStyle={styles.settingsContent}
            >
              <PixelGlyph name="settings" color={m3.color.primary} size={20} />
              <RNText style={[m3TextStyle("labelMedium"), styles.settingsLabel]}>
                {sections.account.items.settings.label}
              </RNText>
            </PixelPressable>
          </View>

          <PixelPressable
            variant="bevel"
            onPress={() => router.push("/plans")}
            accessibilityLabel={`${tPlans("current")}: ${planName}`}
            style={styles.fullWidth}
            contentStyle={styles.planContent}
          >
            <PixelSurface variant="inset" contentStyle={styles.planIcon}>
              <PixelGlyph name="taskAlt" color={m3.color.tertiary} size={24} />
            </PixelSurface>
            <View style={styles.planCopy}>
              <RNText style={[m3TextStyle("labelSmall"), styles.planEyebrow]}>{tPlans("current")}</RNText>
              <RNText numberOfLines={1} style={[m3TextStyle("titleMedium"), styles.planName]}>
                {planName}
              </RNText>
              {planTagline ? (
                <RNText numberOfLines={2} style={[m3TextStyle("bodySmall"), styles.planTagline]}>
                  {planTagline}
                </RNText>
              ) : null}
            </View>
            <PixelGlyph name="chevronRight" color={m3.color.onSurfaceVariant} size={20} />
          </PixelPressable>

          <PixelSurface variant="frame" contentStyle={styles.tabs}>
            {routeGroups.map((group) => {
              const selected = group.key === activeSection;
              return (
                <PixelPressable
                  key={group.key}
                  variant={selected ? "inset" : "bevel"}
                  onPress={() => setActiveSection(group.key)}
                  accessibilityLabel={group.label}
                  accessibilityHint={selected ? undefined : group.label}
                  style={styles.tab}
                  contentStyle={styles.tabContent}
                >
                  <RNText
                    style={[
                      m3TextStyle("labelMedium"),
                      styles.tabLabel,
                      selected && styles.tabLabelSelected,
                    ]}
                  >
                    {group.label}
                  </RNText>
                </PixelPressable>
              );
            })}
          </PixelSurface>

          <PixelSurface variant="frame" contentStyle={styles.routeList}>
            {activeGroup.items.map((item) => (
              <PixelPressable
                key={item.key}
                variant="bevel"
                onPress={() => router.push(item.route)}
                accessibilityLabel={item.label}
                accessibilityHint={item.hint}
                style={styles.fullWidth}
                contentStyle={styles.routeContent}
              >
                <RNText numberOfLines={2} style={[m3TextStyle("bodyMedium"), styles.routeLabel]}>
                  {item.label}
                </RNText>
                <PixelGlyph name="chevronRight" color={m3.color.onSurfaceVariant} size={20} />
              </PixelPressable>
            ))}
          </PixelSurface>
        </ScrollView>
      </View>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollView: { flex: 1 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s2,
  },
  squareButtonContent: {
    minWidth: m3.minTouch,
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s2,
  },
  title: { flex: 1, color: m3.color.onSurface, lineHeight: 28, paddingBottom: m3.spacing.s1 },
  scroll: {
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s6,
    paddingBottom: m3.spacing.s8,
  },
  identityRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  identityName: {
    flex: 1,
    minWidth: 0,
    color: m3.color.onSurface,
    lineHeight: 24,
    paddingBottom: m3.spacing.s1,
  },
  settingsContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
  },
  settingsLabel: { color: m3.color.primary, lineHeight: 16, paddingBottom: m3.spacing.s1 },
  fullWidth: { width: "100%" },
  planContent: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  planIcon: {
    minWidth: m3.minTouch,
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    padding: m3.spacing.s2,
  },
  planCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  planEyebrow: { color: m3.color.onSurfaceVariant, lineHeight: 16, paddingBottom: m3.spacing.s1 },
  planName: { color: m3.color.onSurface, lineHeight: 24, paddingBottom: m3.spacing.s1 },
  planTagline: { color: m3.color.onSurfaceVariant, lineHeight: 18, paddingBottom: m3.spacing.s1 },
  tabs: { flexDirection: "row", gap: m3.spacing.s2, padding: m3.spacing.s2 },
  tab: { flex: 1 },
  tabContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s2,
  },
  tabLabel: {
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 16,
    paddingBottom: m3.spacing.s1,
  },
  tabLabelSelected: { color: m3.color.primary },
  routeList: { gap: m3.spacing.s2, padding: m3.spacing.s2 },
  routeContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  routeLabel: {
    flex: 1,
    color: m3.color.onSurface,
    lineHeight: 20,
    paddingBottom: m3.spacing.s1,
  },
});
