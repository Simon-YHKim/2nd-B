import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { SecondbHead } from "@/components/deepspace";
import { m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { resetCoachmarks } from "@/lib/onboarding/coachmarks-gate";
import { m3 } from "@/lib/theme/m3";

import {
  filterManualTopics,
  manualScreenCopyFor,
  manualTopicsFor,
  type ManualLocale,
  type ManualTopicId,
} from "./dds-manual-content";

export function DeepSpaceManualScreen() {
  const { t, i18n } = useTranslation(["deepspace", "common"]);
  const locale: ManualLocale = i18n.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
  const copy = manualScreenCopyFor(locale);
  const topics = useMemo(() => manualTopicsFor(locale), [locale]);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<ManualTopicId | null>("stars");
  const filteredTopics = useMemo(() => filterManualTopics(topics, query), [query, topics]);

  const onSearchChange = (value: string) => {
    setQuery(value);
    setExpandedId(null);
  };

  return (
    <DeepSpaceScreen active="settings" header="none">
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <PixelPressable
            variant="bevel"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityLabel={t("common:actions.back")}
            contentStyle={styles.backContent}
          >
            <PixelGlyph name="arrowBack" color={m3.color.onSurface} size={24} />
          </PixelPressable>
          <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.title]}>
            {t("manual.title")}
          </RNText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PixelSurface variant="inset" contentStyle={styles.hero}>
            <SecondbHead size={48} mood="neutral" />
            <View style={styles.heroCopy}>
              <RNText style={[m3TextStyle("bodyLarge"), styles.heroText]}>{copy.hero}</RNText>
              <RNText style={[m3TextStyle("bodySmall"), styles.tipText]}>{copy.tip}</RNText>
            </View>
          </PixelSurface>

          <PixelSurface variant="inset" contentStyle={styles.searchContent}>
            <TextInput
              value={query}
              onChangeText={onSearchChange}
              placeholder={copy.searchPlaceholder}
              placeholderTextColor={m3.color.onSurfaceVariant}
              selectionColor={m3.color.primary}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel={copy.searchLabel}
              style={[m3TextStyle("bodyMedium"), styles.searchInput]}
            />
          </PixelSurface>

          <View style={styles.topicList}>
            {filteredTopics.map((topic) => {
              const expanded = topic.id === expandedId;
              return (
                <View key={topic.id} style={styles.topicBlock}>
                  <PixelPressable
                    variant="bevel"
                    onPress={() => setExpandedId(expanded ? null : topic.id)}
                    accessibilityLabel={`${topic.question}. ${expanded ? copy.expanded : copy.collapsed}`}
                    style={styles.fullWidth}
                    contentStyle={styles.questionContent}
                  >
                    <PixelGlyph name={topic.icon} color={m3.color.primary} size={24} />
                    <RNText style={[m3TextStyle("titleSmall"), styles.questionText]}>
                      {topic.question}
                    </RNText>
                    <PixelGlyph
                      name={expanded ? "expandLess" : "expandMore"}
                      color={m3.color.onSurfaceVariant}
                      size={24}
                    />
                  </PixelPressable>

                  {expanded ? (
                    <PixelSurface variant="inset" style={styles.answerSurface} contentStyle={styles.answerContent}>
                      <RNText style={[m3TextStyle("bodyMedium"), styles.answerText]}>
                        {topic.answer}
                      </RNText>
                      <View style={styles.actionList}>
                        {topic.actions.map((action) => (
                          <PixelPressable
                            key={action.route}
                            variant="frame"
                            onPress={() => router.push(action.route as Href)}
                            accessibilityLabel={action.label}
                            style={styles.fullWidth}
                            contentStyle={styles.actionContent}
                          >
                            <RNText style={[m3TextStyle("labelLarge"), styles.actionText]}>
                              {action.label}
                            </RNText>
                            <PixelGlyph name="arrowForward" color={m3.color.primary} size={24} />
                          </PixelPressable>
                        ))}
                      </View>
                    </PixelSurface>
                  ) : null}
                </View>
              );
            })}
          </View>

          {filteredTopics.length === 0 ? (
            <PixelSurface variant="inset" contentStyle={styles.emptyContent}>
              <RNText style={[m3TextStyle("bodyMedium"), styles.emptyText]}>{copy.noResults}</RNText>
            </PixelSurface>
          ) : null}

          <View style={styles.footerActions}>
            <PixelPressable
              variant="bevel"
              onPress={() => router.push("/secondb")}
              accessibilityLabel={t("manual.askDirect")}
              style={styles.fullWidth}
              contentStyle={styles.footerContent}
            >
              <PixelGlyph name="bubble" color={m3.color.primary} size={24} />
              <RNText style={[m3TextStyle("labelLarge"), styles.footerText]}>
                {t("manual.askDirect")}
              </RNText>
            </PixelPressable>
            <PixelPressable
              variant="frame"
              onPress={() => {
                resetCoachmarks();
                router.replace("/");
              }}
              accessibilityLabel={t("manual.replayCoachmarks")}
              style={styles.fullWidth}
              contentStyle={styles.footerContent}
            >
              <PixelGlyph name="replay" color={m3.color.onSurfaceVariant} size={24} />
              <RNText style={[m3TextStyle("labelLarge"), styles.footerText]}>
                {t("manual.replayCoachmarks")}
              </RNText>
            </PixelPressable>
          </View>
        </ScrollView>
      </View>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
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
  heroCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s2 },
  heroText: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  tipText: { color: m3.color.onSurfaceVariant, paddingBottom: m3.spacing.s1 },
  searchContent: { paddingVertical: 0, paddingHorizontal: m3.spacing.s4 },
  searchInput: {
    minHeight: m3.minTouch,
    color: m3.color.onSurface,
    paddingVertical: m3.spacing.s3,
    paddingBottom: m3.spacing.s3 + m3.spacing.s1,
  },
  topicList: { gap: m3.spacing.s4 },
  topicBlock: { width: "100%" },
  fullWidth: { width: "100%" },
  questionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  questionText: {
    flex: 1,
    minWidth: 0,
    color: m3.color.onSurface,
    paddingBottom: m3.spacing.s1,
  },
  answerSurface: { width: "100%", marginTop: m3.spacing.s2 },
  answerContent: { gap: m3.spacing.s4, paddingVertical: m3.spacing.s6 },
  answerText: { color: m3.color.onSurfaceVariant, paddingBottom: m3.spacing.s1 },
  actionList: { gap: m3.spacing.s2 },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  actionText: { flex: 1, minWidth: 0, color: m3.color.primary, paddingBottom: m3.spacing.s1 },
  emptyContent: { minHeight: m3.minTouch, justifyContent: "center", paddingVertical: m3.spacing.s6 },
  emptyText: { color: m3.color.onSurfaceVariant, textAlign: "center", paddingBottom: m3.spacing.s1 },
  footerActions: { gap: m3.spacing.s4 },
  footerContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  footerText: { color: m3.color.onSurface, textAlign: "center", paddingBottom: m3.spacing.s1 },
});
