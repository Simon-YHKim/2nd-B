import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, PremiumButton, PremiumCard, SceneHero, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { m3 } from "@/lib/theme/m3";
import { cosmic, deepSpace, flattenAlpha, radii, semantic, spacing, typography } from "@/lib/theme/tokens";
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

// ── 이 화면의 바탕 (PIXEL-CLAY 절대 규칙 4) ──────────────────────────
//
// 알파는 아래 깔린 것에 따라 결과가 달라지고 겹치면 색이 미끄러진다. 픽셀아트는
// 색이 **셀 수 있는 몇 개**여야 하므로 미리 합성한다.
//
// ⚠ **바탕 선언**: 이 화면은 `DeepSpaceScreen` 의 스테이지 위에 앉는다. 스테이지는
//   `m3.accent.stageFloor` 를 0.92 로 깔고 그 아래가 `deepSpace.bgEdge` 다
//   (`components/deep-space/DeepSpaceScreen.tsx` 의 `root`·stage 스타일).
//   바탕이 틀리면 알파를 그냥 두는 것보다 나쁘므로, 옮기는 사람은 여기부터 다시 잴 것.
//
// ⚠ 레거시 셸(`isDeepSpaceUI()` 가 false)일 때는 바탕이 다르다. 그러나 모든 배포가
//   deep-space 고정이라 그쪽은 실제로 그려지지 않는다 — 되살리는 사람이 다시 잰다.
const ESM_GROUND = flattenAlpha(m3.accent.stageFloor, 0.92, deepSpace.bgEdge);
const esmAlpha = (c: string, a: number): string => flattenAlpha(c, a, ESM_GROUND);

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
    borderColor: esmAlpha(semantic.brand, 0.44),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    backgroundColor: esmAlpha(cosmic.space900, 0.56),
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
    borderColor: esmAlpha(semantic.brand, 0.42),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: esmAlpha(cosmic.space900, 0.54),
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
    borderColor: esmAlpha(cosmic.soulViolet, 0.42),
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: esmAlpha(cosmic.space900, 0.54),
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
