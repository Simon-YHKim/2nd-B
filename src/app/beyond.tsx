import { useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Rect } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader, SecondbHead } from "@/components/deepspace";
import { m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";
import { flattenAlpha } from "@/lib/theme/tokens";

type BeyondPreviewId = "widgets" | "lock" | "push";

const PREVIEWS = [
  { id: "widgets", titleKey: "beyond.widgetsSection", icon: "devices" },
  { id: "lock", titleKey: "beyond.lockSection", icon: "lock" },
  { id: "push", titleKey: "beyond.pushSection", icon: "notifications" },
] as const;

const WIDGET_GROUND = m3.color.surfaceContainerHigh;
const STAR_GLOW = [
  { inset: 6, fill: flattenAlpha(m3.color.primary, 0.18, WIDGET_GROUND) },
  { inset: 18, fill: flattenAlpha(m3.color.primary, 0.45, WIDGET_GROUND) },
  { inset: 26, fill: m3.color.primary },
] as const;

function PreviewBadge({ label }: { label: string }) {
  return (
    <PixelSurface variant="inset" contentStyle={styles.badgeContent}>
      <RNText style={[m3TextStyle("labelSmall"), styles.badgeLabel]}>{label}</RNText>
    </PixelSurface>
  );
}

function StarGlow() {
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64" accessibilityElementsHidden>
      {STAR_GLOW.map(({ inset, fill }) => (
        <Rect
          key={inset}
          x={inset}
          y={inset}
          width={64 - inset * 2}
          height={64 - inset * 2}
          fill={fill}
        />
      ))}
    </Svg>
  );
}

export default function BeyondScreen() {
  const { t } = useTranslation(["deepspace", "common"]);
  const { userId, loading } = useAuth();
  const [openPreview, setOpenPreview] = useState<BeyondPreviewId | null>("widgets");

  if (loading) {
    return (
      <DeepSpaceScreen active="settings" header="none">
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" caption={t("common:states.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const previewTag = t("beyond.preview");

  return (
    <DeepSpaceScreen active="settings" header="none">
      <View style={styles.topBar}>
        <PixelPressable
          variant="bevel"
          onPress={() => router.back()}
          accessibilityLabel={t("common:actions.back")}
          contentStyle={styles.backContent}
        >
          <PixelGlyph name="arrowBack" color={m3.color.onSurface} size={24} />
        </PixelPressable>
        <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.title]}>
          {t("beyond.title")}
        </RNText>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <SecondbHead size={64} mood="neutral" />
          <PixelSurface variant="inset" contentStyle={styles.heroMessage}>
            <PreviewBadge label={previewTag} />
            <RNText style={[m3TextStyle("bodyMedium"), styles.heroCopy]}>
              {t("beyond.widgetsSection")} · {t("beyond.lockSection")} · {t("beyond.pushSection")}
            </RNText>
          </PixelSurface>
        </View>

        <PixelSurface variant="frame" contentStyle={styles.previewGroup}>
          {PREVIEWS.map((preview) => {
            const expanded = openPreview === preview.id;
            const label = t(preview.titleKey);
            return (
              <View key={preview.id} style={styles.previewSection}>
                <PixelPressable
                  variant={expanded ? "inset" : "bevel"}
                  onPress={() =>
                    setOpenPreview((current) => current === preview.id ? null : preview.id)
                  }
                  accessibilityLabel={label}
                  accessibilityState={{ expanded }}
                  fullWidth
                  contentStyle={styles.previewHeader}
                >
                  <PixelGlyph name={preview.icon} color={m3.color.primary} size={24} />
                  <RNText style={[m3TextStyle("labelLarge"), styles.previewTitle]}>{label}</RNText>
                  <PreviewBadge label={previewTag} />
                  <PixelGlyph
                    name={expanded ? "expandLess" : "expandMore"}
                    color={m3.color.onSurfaceVariant}
                    size={24}
                  />
                </PixelPressable>

                {openPreview === preview.id ? (
                  <PixelSurface variant="inset" contentStyle={styles.previewBody}>
                    {preview.id === "widgets" ? (
                      <View style={styles.widgetGrid}>
                        <PixelSurface
                          variant="bevel"
                          background={WIDGET_GROUND}
                          style={styles.previewCard}
                          contentStyle={styles.starCardContent}
                        >
                          <View style={styles.cardHead}>
                            <RNText style={[m3TextStyle("labelMedium"), styles.cardTitle]}>
                              {t("beyond.todaysStar")}
                            </RNText>
                            <PreviewBadge label={previewTag} />
                          </View>
                          <View style={styles.starGlow}>
                            <StarGlow />
                          </View>
                          <RNText style={[m3TextStyle("titleMedium"), styles.starName]}>
                            {t("beyond.brightestStar")}
                          </RNText>
                        </PixelSurface>

                        <PixelSurface
                          variant="bevel"
                          background={WIDGET_GROUND}
                          style={styles.previewCard}
                          contentStyle={styles.captureCardContent}
                        >
                          <View style={styles.captureHead}>
                            <SecondbHead size={32} track={false} />
                            <RNText style={[m3TextStyle("labelLarge"), styles.captureTitle]}>
                              {t("beyond.captureTitle")}
                            </RNText>
                          </View>
                          <PixelPressable
                            variant="bevel"
                            onPress={() => router.push("/capture")}
                            accessibilityLabel={t("beyond.capture")}
                            accessibilityRole="link"
                            fullWidth
                            contentStyle={styles.actionContent}
                          >
                            <PixelGlyph name="add" color={m3.color.primary} size={24} />
                            <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
                              {t("beyond.capture")}
                            </RNText>
                          </PixelPressable>
                          <PixelPressable
                            variant="bevel"
                            onPress={() =>
                              router.push({ pathname: "/capture-full", params: { mode: "voice" } })
                            }
                            accessibilityLabel={t("beyond.captureByVoice")}
                            accessibilityRole="link"
                            fullWidth
                            contentStyle={styles.actionContent}
                          >
                            <PixelGlyph name="mic" color={m3.color.primary} size={24} />
                            <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
                              {t("beyond.captureByVoice")}
                            </RNText>
                          </PixelPressable>
                        </PixelSurface>
                      </View>
                    ) : preview.id === "lock" ? (
                      <PixelSurface variant="bevel" style={styles.fullWidth} contentStyle={styles.surfacePreview}>
                        <View style={styles.surfaceIcon}>
                          <PixelGlyph name="lock" color={m3.color.primary} size={24} />
                        </View>
                        <SecondbHead size={32} track={false} />
                        <RNText style={[m3TextStyle("bodyMedium"), styles.surfaceCopy]}>
                          {t("beyond.lockNotif")}
                        </RNText>
                        <PreviewBadge label={previewTag} />
                      </PixelSurface>
                    ) : (
                      <View style={styles.pushGroup}>
                        <PixelSurface variant="bevel" style={styles.fullWidth} contentStyle={styles.surfacePreview}>
                          <View style={styles.surfaceIcon}>
                            <PixelGlyph name="notifications" color={m3.color.primary} size={24} />
                          </View>
                          <View style={styles.surfaceCopyGroup}>
                            <RNText style={[m3TextStyle("labelLarge"), styles.surfaceTitle]}>
                              {t("beyond.pushHead")}
                            </RNText>
                            <RNText style={[m3TextStyle("bodyMedium"), styles.surfaceCopy]}>
                              {t("beyond.pushBody")}
                            </RNText>
                          </View>
                          <PreviewBadge label={previewTag} />
                        </PixelSurface>
                        <PixelPressable
                          variant="bevel"
                          onPress={() => router.push("/settings")}
                          accessibilityLabel={t("beyond.notifSettings")}
                          accessibilityRole="link"
                          fullWidth
                          contentStyle={styles.actionContent}
                        >
                          <PixelGlyph name="settings" color={m3.color.primary} size={24} />
                          <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
                            {t("beyond.notifSettings")}
                          </RNText>
                        </PixelPressable>
                      </View>
                    )}
                  </PixelSurface>
                ) : null}
              </View>
            );
          })}
        </PixelSurface>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s2,
  },
  backContent: { minWidth: m3.minTouch, alignItems: "center", paddingHorizontal: m3.spacing.s2 },
  title: { flex: 1, color: m3.color.onSurface },
  scrollView: { flex: 1 },
  scroll: {
    paddingHorizontal: m3.spacing.s8,
    paddingBottom: m3.spacing.s8,
    gap: m3.spacing.s6,
  },
  hero: { alignItems: "center", gap: m3.spacing.s6, paddingVertical: m3.spacing.s8 },
  heroMessage: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
    padding: m3.spacing.s4,
  },
  heroCopy: { flexShrink: 1, color: m3.color.onSurfaceVariant, textAlign: "center" },
  badgeContent: { paddingHorizontal: m3.spacing.s3, paddingVertical: m3.spacing.s1 },
  badgeLabel: { color: m3.color.primary },
  previewGroup: { gap: m3.spacing.s4, padding: m3.spacing.s2 },
  previewSection: { gap: m3.spacing.s2 },
  previewHeader: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s4,
  },
  previewTitle: { flex: 1, color: m3.color.onSurface },
  previewBody: { padding: m3.spacing.s4 },
  widgetGrid: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s4 },
  previewCard: { flexGrow: 1, flexBasis: 180, minWidth: 180 },
  cardHead: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
  },
  cardTitle: { flexShrink: 1, color: m3.color.onSurfaceVariant },
  starCardContent: { minHeight: 180, alignItems: "center", gap: m3.spacing.s4, padding: m3.spacing.s6 },
  starGlow: { alignItems: "center", justifyContent: "center" },
  starName: { color: m3.color.onSurface, textAlign: "center" },
  captureCardContent: { minHeight: 180, gap: m3.spacing.s4, padding: m3.spacing.s6 },
  captureHead: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s4 },
  captureTitle: { flex: 1, color: m3.color.onSurface },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
  },
  actionLabel: { color: m3.color.primary, textAlign: "center" },
  fullWidth: { width: "100%" },
  surfacePreview: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: m3.spacing.s4,
    padding: m3.spacing.s6,
  },
  surfaceIcon: {
    minWidth: m3.minTouch,
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  surfaceCopyGroup: { flex: 1, minWidth: 180, gap: m3.spacing.s2 },
  surfaceTitle: { color: m3.color.onSurface },
  surfaceCopy: { flex: 1, minWidth: 180, color: m3.color.onSurfaceVariant },
  pushGroup: { gap: m3.spacing.s4 },
});
