// dds-consent-notice-screen: the consent detail page behind the sign-up rows'
// "자세히 보기" chevrons (flow request #4). One screen, one section per selection
// key; ?item=<key> scrolls to and highlights that section. The shared paragraphs
// (what is collected / purpose / retention / rights) reuse the SAME reviewed
// notice.* copy the legacy ConsentNotice renders inline, so the two consent
// surfaces cannot drift apart. Lives in the (auth) group: IntroGate-exempt,
// reachable while signed out mid-sign-up. Canon-only (no legacy skin).
import { useCallback, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, spacing } from "@/theme/tokens";
import { Text } from "@/components/ui/Text";
import { REQUIRED_ACK_KEYS } from "@/lib/auth/consent-selections";
import { ddsStyles as styles } from "./dds-styles";
import { AuthShell } from "./dds-auth-screens";

// The detail catalog covers every selection the sign-up block collects: the
// four required acks plus the optional marketing consent.
export const CONSENT_DETAIL_ITEMS = [...REQUIRED_ACK_KEYS, "marketing"] as const;
export type ConsentDetailItem = (typeof CONSENT_DETAIL_ITEMS)[number];

export function DeepSpaceConsentNoticeScreen() {
  const { t } = useTranslation(["consent", "common"]);
  const { item } = useLocalSearchParams<{ item?: string }>();
  const target = (CONSENT_DETAIL_ITEMS as readonly string[]).includes(item ?? "")
    ? (item as ConsentDetailItem)
    : null;
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  // Sections lay out top-down; when the target section reports its y, jump once.
  const onSectionLayout = useCallback(
    (key: ConsentDetailItem, y: number) => {
      if (key !== target || scrolled.current) return;
      scrolled.current = true;
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true }),
      );
    },
    [target],
  );

  return (
    <AuthShell scrollRef={scrollRef}>
      <View style={styles.titleRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common:navGraph.drilldown.back")}
        >
          <RNText style={styles.back}>‹</RNText>
        </Pressable>
        <Text variant="heading" style={styles.title} accessibilityRole="header">
          {t("consent:detail.title")}
        </Text>
      </View>
      <Text variant="body" style={styles.consentIntro}>{t("consent:detail.intro")}</Text>

      <View style={styles.card}>
        <Text variant="heading" style={styles.section} accessibilityRole="header">
          {t("consent:notice.purposesTitle")}
        </Text>
        {(["items", "purposeService", "retention", "rights"] as const).map((k) => (
          <Text key={k} variant="body" style={local.body}>
            {t(`consent:notice.${k}`)}
          </Text>
        ))}
      </View>

      {CONSENT_DETAIL_ITEMS.map((key) => (
        <View
          key={key}
          onLayout={(e) => onSectionLayout(key, e.nativeEvent.layout.y)}
          style={[styles.card, target === key && local.cardTarget]}
        >
          <Text variant="caption" pixelEn style={styles.consentGroupLabel}>
            {key === "marketing" ? t("consent:notice.optionalLabel") : t("consent:notice.requiredLabel")}
          </Text>
          <Text variant="heading" style={styles.section} accessibilityRole="header">
            {t(`consent:detail.${key}.title`)}
          </Text>
          <Text variant="body" style={local.body}>{t(`consent:detail.${key}.body`)}</Text>
        </View>
      ))}

      <Text variant="body" style={styles.footer}>{t("consent:detail.footer")}</Text>
    </AuthShell>
  );
}

const local = StyleSheet.create({
  // ddsStyles.consentLabel carries flex:1 for its checkbox row; standalone legal
  // paragraphs need their own style or flexBasis:0 collapses them in a column.
  body: { color: colors.textMid, fontSize: 12, lineHeight: 18 },
  cardTarget: { borderColor: colors.cyan },
});
