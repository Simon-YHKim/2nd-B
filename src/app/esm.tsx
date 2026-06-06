import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, PremiumButton, PremiumCard, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cosmic, radii, semantic, spacing, typography, withAlpha } from "@/lib/theme/tokens";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

type PromptKind = "context" | "energy";

const PROMPT_OPTIONS: { id: PromptKind; en: string; ko: string }[] = [
  { id: "context", en: "Context", ko: "맥락" },
  { id: "energy", en: "Energy", ko: "에너지" },
];

const CONTEXT_TAGS = [
  { id: "alone", en: "Alone", ko: "혼자" },
  { id: "with_people", en: "With people", ko: "사람들과" },
  { id: "work_study", en: "Work/study", ko: "일/공부" },
  { id: "moving", en: "Moving", ko: "움직이는 중" },
  { id: "resting", en: "Resting", ko: "쉬는 중" },
  { id: "outside", en: "Outside", ko: "밖" },
];

export default function EsmCheckIn() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, loading: authLoading } = useAuth();

  const [kind, setKind] = useState<PromptKind>(locale === "ko" ? "context" : "energy");
  const [scaleValue, setScaleValue] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSubmit = kind === "energy" ? scaleValue !== null : selectedTags.length > 0;
  const activePrompt = useMemo(() => PROMPT_OPTIONS.find((p) => p.id === kind)!, [kind]);

  if (authLoading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            {locale === "ko" ? "체크인을 준비하는 중입니다." : "Preparing your check-in."}
          </Text>
        </View>
      </PremiumAppShell>
    );
  }

  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  function toggleTag(tag: string) {
    setSaved(false);
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  async function handleSubmit() {
    if (!userId || !canSubmit || saving) return;
    setSaving(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("esm_responses").insert({
      user_id: userId,
      prompt_kind: kind,
      scale_value: kind === "energy" ? scaleValue : null,
      context_tags: kind === "context" ? selectedTags : [],
    });
    setSaving(false);

    if (error) {
      Alert.alert(
        locale === "ko" ? "저장하지 못했습니다" : "Couldn't save",
        locale === "ko"
          ? "연결이 잠깐 흔들렸습니다. 다시 시도해 주세요."
          : "The connection hiccuped. Please try again.",
      );
      return;
    }

    setSaved(true);
    setScaleValue(null);
    setSelectedTags([]);
  }

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "가벼운 체크인" : "Light check-in"}
          title={locale === "ko" ? "지금의 단서 하나" : "One signal from now"}
          subtitle={locale === "ko" ? "알림 없이, 내가 열었을 때만" : "No notifications. Only when you open it."}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={
            locale === "ko"
              ? "판단이 아니라 작은 맥락만 남겨요."
              : "No judgment. Just a small momentary signal."
          }
        />

        <PremiumCard
          eyebrow={locale === "ko" ? "15초" : "15 seconds"}
          title={locale === "ko" ? "오늘은 어떤 단서로 남길까요?" : "What kind of signal fits this moment?"}
          accent={semantic.brand}
          glow
        >
          <View style={styles.promptTabs} accessibilityRole="tablist">
            {PROMPT_OPTIONS.map((option) => {
              const active = option.id === kind;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    setKind(option.id);
                    setSaved(false);
                  }}
                  style={[styles.promptTab, active && styles.promptTabActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={locale === "ko" ? option.ko : option.en}
                  accessibilityHint={
                    locale === "ko" ? "체크인 질문 종류를 바꿉니다" : "Changes the check-in prompt type"
                  }
                >
                  <Text variant="body" color={active ? "background" : "brand"} style={styles.promptTabText}>
                    {locale === "ko" ? option.ko : option.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {kind === "energy" ? (
            <View
              style={styles.scaleBlock}
              accessibilityRole="radiogroup"
              accessibilityLabel={locale === "ko" ? "에너지 선택" : "Energy level"}
            >
              <Text variant="body" color="text">
                {locale === "ko" ? "지금 남아 있는 힘은 어느 정도인가요?" : "How much energy is available right now?"}
              </Text>
              <View style={styles.scaleRow}>
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = scaleValue === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setScaleValue(value);
                        setSaved(false);
                      }}
                      style={[styles.scaleDot, active && styles.scaleDotActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={
                        locale === "ko" ? `에너지 ${value}점` : `Energy ${value} of 5`
                      }
                    >
                      <Text variant="body" color={active ? "background" : "brand"} style={styles.scaleText}>
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.scaleBlock}>
              <Text variant="body" color="text">
                {locale === "ko" ? "지금 어디에 누구와 있나요?" : "What is around this moment?"}
              </Text>
              <View style={styles.tagGrid}>
                {CONTEXT_TAGS.map((tag) => {
                  const active = selectedTags.includes(tag.id);
                  return (
                    <Pressable
                      key={tag.id}
                      onPress={() => toggleTag(tag.id)}
                      style={[styles.tagChip, active && styles.tagChipActive]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={locale === "ko" ? tag.ko : tag.en}
                    >
                      <Text variant="caption" color={active ? "background" : "text"}>
                        {locale === "ko" ? tag.ko : tag.en}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Text variant="subtle" color="textMuted" style={styles.note}>
            {locale === "ko"
              ? "이 기록은 판단이나 진단이 아니라, 나중에 패턴을 더 정확히 보는 작은 단서입니다."
              : "This is not a judgment or diagnosis. It is a small signal for future pattern accuracy."}
          </Text>

          <View style={styles.actions}>
            <PremiumButton
              label={saving ? (locale === "ko" ? "저장 중" : "Saving") : locale === "ko" ? "체크인 저장" : "Save check-in"}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={saving}
              full
              accessibilityLabel={locale === "ko" ? "체크인 저장" : "Save check-in"}
              accessibilityHint={
                locale === "ko"
                  ? `${activePrompt.ko} 체크인을 저장합니다`
                  : `Saves the ${activePrompt.en.toLowerCase()} check-in`
              }
            />
            <PremiumButton
              label={locale === "ko" ? "마을로 돌아가기" : "Back to village"}
              variant="ghost"
              onPress={() => router.push("/")}
              full
            />
          </View>
        </PremiumCard>

        {saved ? (
          <PremiumCard accent={cosmic.signalMint} style={styles.savedCard}>
            <Text variant="body" color="text">
              {locale === "ko" ? "저장했습니다. 작은 단서 하나가 더해졌어요." : "Saved. One small signal was added."}
            </Text>
          </PremiumCard>
        ) : null}
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  promptTabs: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  promptTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: withAlpha(semantic.brand, 0.44),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    backgroundColor: withAlpha(cosmic.space900, 0.56),
  },
  promptTabActive: {
    backgroundColor: semantic.brand,
    borderColor: semantic.brand,
  },
  promptTabText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weights.bold,
    textAlign: "center",
  },
  scaleBlock: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  scaleRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  scaleDot: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: withAlpha(semantic.brand, 0.42),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(cosmic.space900, 0.54),
  },
  scaleDotActive: {
    backgroundColor: semantic.brand,
    borderColor: semantic.brand,
  },
  scaleText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weights.bold,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tagChip: {
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.soulViolet, 0.42),
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(cosmic.space900, 0.54),
  },
  tagChipActive: {
    backgroundColor: cosmic.soulViolet,
    borderColor: cosmic.soulViolet,
  },
  note: {
    marginTop: spacing.lg,
    lineHeight: 19,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  savedCard: {
    marginTop: -spacing.sm,
  },
});
