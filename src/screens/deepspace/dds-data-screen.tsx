import { useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader } from "@/components/deepspace";
import { m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";

import {
  dataRightsFor,
  dataScreenCopyFor,
  type DataLocale,
  type DataRightId,
} from "./dds-data-content";

export function DeepSpaceDataScreen() {
  const { t, i18n } = useTranslation(["data", "common"]);
  const { userId, loading } = useAuth();
  const locale: DataLocale = i18n.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
  const copy = dataScreenCopyFor(locale);
  const rights = dataRightsFor(locale);
  const [expandedId, setExpandedId] = useState<DataRightId | null>(null);

  if (loading) {
    return (
      <DeepSpaceScreen active="settings" header="none">
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" caption={t("data:loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <DeepSpaceScreen active="settings" header="none">
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <PixelPressable
            variant="bevel"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
            accessibilityLabel={t("common:actions.back")}
            contentStyle={styles.backContent}
          >
            <PixelGlyph name="arrowBack" color={m3.color.onSurface} size={24} />
          </PixelPressable>
          <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.title]}>
            {copy.title}
          </RNText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PixelSurface variant="inset" contentStyle={styles.hero}>
            <PixelGlyph name="hub" color={m3.color.primary} size={48} />
            <RNText style={[m3TextStyle("bodyLarge"), styles.heroText]}>{copy.hero}</RNText>
          </PixelSurface>

          <View style={styles.rightsList}>
            {rights.map((item) => {
              const expanded = item.id === expandedId;
              const accent = item.danger ? m3.color.error : m3.color.primary;
              return (
                <View key={item.id} style={styles.rightBlock}>
                  <PixelPressable
                    variant={expanded ? "inset" : "bevel"}
                    onPress={() => setExpandedId(expanded ? null : item.id)}
                    accessibilityLabel={`${item.title}. ${item.summary}. ${
                      expanded ? copy.expanded : copy.collapsed
                    }`}
                    accessibilityState={{ expanded }}
                    fullWidth
                    contentStyle={styles.rightHeader}
                  >
                    <PixelGlyph name={item.icon} color={accent} size={24} />
                    <View style={styles.rightCopy}>
                      <RNText
                        style={[
                          m3TextStyle("titleSmall"),
                          item.danger ? styles.dangerTitle : styles.rightTitle,
                        ]}
                      >
                        {item.title}
                      </RNText>
                      <RNText style={[m3TextStyle("bodySmall"), styles.summary]}>
                        {item.summary}
                      </RNText>
                    </View>
                    <PixelGlyph
                      name={expanded ? "expandLess" : "expandMore"}
                      color={m3.color.onSurfaceVariant}
                      size={24}
                    />
                  </PixelPressable>

                  {expanded ? (
                    <PixelSurface
                      variant="inset"
                      style={styles.detailSurface}
                      contentStyle={styles.detailContent}
                    >
                      <RNText style={[m3TextStyle("bodyMedium"), styles.detailText]}>
                        {item.detail}
                      </RNText>
                      <PixelPressable
                        variant="frame"
                        onPress={() => router.push(item.route as Href)}
                        accessibilityLabel={item.actionLabel}
                        accessibilityRole="link"
                        fullWidth
                        contentStyle={styles.actionContent}
                      >
                        <RNText
                          style={[
                            m3TextStyle("labelLarge"),
                            item.danger ? styles.dangerAction : styles.actionText,
                          ]}
                        >
                          {item.actionLabel}
                        </RNText>
                        <PixelGlyph name="arrowForward" color={accent} size={24} />
                      </PixelPressable>
                    </PixelSurface>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    minHeight: m3.minTouch + m3.spacing.s6,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s6,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s3,
  },
  backContent: {
    minWidth: m3.minTouch,
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  title: { flex: 1, minWidth: 0, color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  scrollView: { flex: 1 },
  scroll: {
    gap: m3.spacing.s6,
    paddingHorizontal: m3.spacing.s6,
    paddingBottom: m3.spacing.s8 * 3,
  },
  hero: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s6,
    paddingVertical: m3.spacing.s6,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    color: m3.color.onSurface,
    paddingBottom: m3.spacing.s1,
  },
  rightsList: { gap: m3.spacing.s4 },
  rightBlock: { alignSelf: "stretch" },
  rightHeader: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  rightCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  rightTitle: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  dangerTitle: { color: m3.color.error, paddingBottom: m3.spacing.s1 },
  summary: { color: m3.color.onSurfaceVariant, paddingBottom: m3.spacing.s1 },
  detailSurface: { alignSelf: "stretch", marginTop: m3.spacing.s2 },
  detailContent: { gap: m3.spacing.s4, paddingVertical: m3.spacing.s6 },
  detailText: { color: m3.color.onSurfaceVariant, paddingBottom: m3.spacing.s1 },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  actionText: { flex: 1, minWidth: 0, color: m3.color.primary, paddingBottom: m3.spacing.s1 },
  dangerAction: { flex: 1, minWidth: 0, color: m3.color.error, paddingBottom: m3.spacing.s1 },
});
