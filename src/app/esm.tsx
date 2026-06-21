import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, PremiumButton, PremiumCard, SceneHero, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cosmic, radii, semantic, spacing, typography, withAlpha } from "@/lib/theme/tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

type PromptKind = "context" | "energy";
type Toast = { message: string; tone: "danger" | "info" | "success" };

const PROMPT_OPTIONS: { id: PromptKind }[] = [{ id: "context" }, { id: "energy" }];

const CONTEXT_TAGS = ["alone", "with_people", "work_study", "moving", "resting", "outside"] as const;

function EsmCheckInScreen() {
  const { t } = useTranslation("esm");
  const { userId, loading: authLoading } = useAuth();

  const [kind, setKind] = useState<PromptKind>("context");
  const [scaleValue, setScaleValue] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const canSubmit = kind === "energy" ? scaleValue !== null : selectedTags.length > 0;
  const activePrompt = useMemo(() => PROMPT_OPTIONS.find((p) => p.id === kind)!, [kind]);
  const activePromptSaveHint = t(`prompts.${activePrompt.id}.saveHint`);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(h);
  }, [toast]);

  if (authLoading) {
    return (
      <EsmShell>
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            {t("loading")}
          </Text>
        </View>
      </EsmShell>
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
      setToast({
        tone: "danger",
        message: t("toast.saveFailed"),
      });
      return;
    }

    setSaved(true);
    setScaleValue(null);
    setSelectedTags([]);
  }

  return (
    <EsmShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={t("hero.speech")}
        />

        <PremiumCard eyebrow={t("card.eyebrow")} title={t("card.title")} accent={semantic.brand}>
          <View style={styles.promptTabs} accessibilityRole="tablist">
            {PROMPT_OPTIONS.map((option) => {
              const active = option.id === kind;
              const label = t(`prompts.${option.id}.label`);
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
                  accessibilityLabel={label}
                  accessibilityHint={t("prompts.changeHint")}
                >
                  <Text variant="body" color={active ? "background" : "brand"} style={styles.promptTabText}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {kind === "energy" ? (
            <View style={styles.scaleBlock} accessibilityRole="radiogroup" accessibilityLabel={t("energy.label")}>
              <Text variant="body" color="text">
                {t("energy.question")}
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
                      accessibilityLabel={t("energy.optionLabel", { value })}
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
                {t("context.question")}
              </Text>
              <View style={styles.tagGrid}>
                {CONTEXT_TAGS.map((tag) => {
                  const active = selectedTags.includes(tag);
                  const label = t(`context.tags.${tag}`);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => toggleTag(tag)}
                      style={[styles.tagChip, active && styles.tagChipActive]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={label}
                    >
                      <Text variant="caption" color={active ? "background" : "text"}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Text variant="subtle" color="textMuted" style={styles.note}>
            {t("note")}
          </Text>

          <View style={styles.actions}>
            <PremiumButton
              label={saving ? t("actions.saving") : t("actions.save")}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={saving}
              full
              accessibilityLabel={t("actions.save")}
              accessibilityHint={activePromptSaveHint}
            />
            <PremiumButton
              label={t("actions.backHome")}
              variant="ghost"
              onPress={() => router.push("/")}
              full
              accessibilityHint={t("actions.backHomeHint")}
            />
          </View>
        </PremiumCard>

        {saved ? (
          <PremiumCard accent={cosmic.signalMint} style={styles.savedCard}>
            <Text variant="body" color="text">
              {t("saved")}
            </Text>
          </PremiumCard>
        ) : null}
      </ScrollView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </EsmShell>
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
    minHeight: 44,
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
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});

// Canon (deep-space) and legacy share ONE functional screen — the ESM check-in.
// Canon previously showed a placeholder RhythmLensView with a dead CTA; now both
// render the real check-in (context/energy prompt → save). Only the chrome
// differs: the deep-space dock (DeepSpaceScreen) vs the premium shell.
function EsmShell({ children }: { children: ReactNode }) {
  return isDeepSpaceUI() ? (
    <DeepSpaceScreen active="lens">{children}</DeepSpaceScreen>
  ) : (
    <PremiumAppShell>{children}</PremiumAppShell>
  );
}

export default function EsmCheckIn() {
  return <EsmCheckInScreen />;
}
