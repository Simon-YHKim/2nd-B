// 커리어 CV 타임라인 (rev2 P4d): the career domain lens. Every domain:career
// record grouped by year (an explicit year: tag from the achievement form wins
// over the capture date), newest first, plus the structured 성과 담기 form.
// Saves ride createRecord (C9/C3) with tags [career_achievement, domain:career,
// year:YYYY] so the 커리어 star brightens from real, dated accomplishments.
// 3C4P drilldown + 고용24 integration stay deferred to the rev2 prototype spec.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createRecord } from "@/lib/records/create";
import { domainTagFor } from "@/lib/persona/domain-stars";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import {
  composeAchievementBody,
  groupCareerTimeline,
  type CareerRecordRow,
} from "@/lib/career/career-timeline";

const CAREER_TAG = domainTagFor("career");

async function listCareerRecords(userId: string): Promise<CareerRecordRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("records")
    .select("id, kind, topic, body, tags, created_at")
    .eq("user_id", userId)
    .contains("tags", [CAREER_TAG])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as CareerRecordRow[];
}

export default function CareerTimelineScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [rows, setRows] = useState<CareerRecordRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [impact, setImpact] = useState("");
  const [year, setYear] = useState("");

  const refresh = useCallback(() => {
    if (!userId) return;
    listCareerRecords(userId)
      .then((r) => {
        setRows(r);
        setLoadFailed(false);
      })
      .catch((e) => {
        console.warn("[career] list failed", (e as Error).message);
        setRows([]);
        setLoadFailed(true);
      });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = useMemo(() => groupCareerTimeline(rows ?? []), [rows]);
  const yearValid = year.trim() === "" || /^\d{4}$/.test(year.trim());

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:career.screenTitle")} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={t("deepspace:career.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  async function handleAdd() {
    if (!userId || !title.trim() || !yearValid || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const body = composeAchievementBody({ title, role, impact }, locale);
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "note",
        body,
        topic: title.trim().slice(0, 80),
        tags: [
          "career_achievement",
          CAREER_TAG,
          ...(year.trim() ? [`year:${year.trim()}`] : []),
        ],
      });
      setTitle("");
      setRole("");
      setImpact("");
      setYear("");
      setAdding(false);
      refresh();
    } catch (e) {
      console.warn("[career] save failed", (e as Error).message);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:career.screenTitle")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headRow}>
          <Text variant="heading" style={{ flex: 1 }}>
            {t("deepspace:career.timelineTitle")}
          </Text>
          <MdButton
            variant="outlined"
            label="Drill Down"
            onPress={() => router.push("/career-drilldown")}
          />
          <MdButton
            variant="tonal"
            label={adding ? t("deepspace:career.close") : t("deepspace:career.addAchievement")}
            onPress={() => setAdding((v) => !v)}
          />
        </View>

        {adding ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Field
              label={t("deepspace:career.fieldAchievement")}
              value={title}
              onChangeText={setTitle}
              placeholder={t("deepspace:career.placeholderAchievement")}
            />
            <Field
              label={t("deepspace:career.fieldRole")}
              value={role}
              onChangeText={setRole}
              placeholder={t("deepspace:career.placeholderRole")}
            />
            <Field
              label={t("deepspace:career.fieldImpact")}
              value={impact}
              onChangeText={setImpact}
              placeholder={t("deepspace:career.placeholderImpact")}
            />
            <Field
              label={t("deepspace:career.fieldYear")}
              value={year}
              onChangeText={setYear}
              placeholder={t("deepspace:career.placeholderYear")}
              keyboardType="number-pad"
              error={!yearValid}
              supportingText={yearValid ? undefined : t("deepspace:career.yearError")}
            />
            {saveFailed ? (
              <Text variant="caption" color="textSubtle">
                {t("deepspace:career.saveFailed")}
              </Text>
            ) : null}
            <MdButton
              variant="filled"
              disabled={!title.trim() || !yearValid || saving}
              label={saving ? t("deepspace:career.saving") : t("deepspace:career.save")}
              onPress={handleAdd}
            />
          </MdCard>
        ) : null}

        {rows === null ? (
          <PremiumLoadingState message={t("deepspace:career.opening")} />
        ) : loadFailed ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {t("deepspace:career.loadError")}
            </Text>
            <MdButton variant="tonal" label={t("deepspace:career.retry")} onPress={refresh} />
          </MdCard>
        ) : groups.length === 0 ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {t("deepspace:career.empty")}
            </Text>
          </MdCard>
        ) : (
          groups.map((group) => (
            <View key={group.year} style={styles.yearBlock}>
              <View style={styles.yearRow}>
                <Text variant="heading" style={styles.yearLabel}>
                  {group.year}
                </Text>
                <View style={styles.yearLine} />
              </View>
              {group.items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push({ pathname: "/record/[id]", params: { id: item.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={item.topic ?? t("deepspace:career.pieceFallback")}
                >
                  <MdCard variant="outlined" style={styles.entry}>
                    <View style={styles.entryDot} />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {item.topic ?? item.body?.split("\n")[0] ?? t("deepspace:career.untitled")}
                      </Text>
                      {item.body ? (
                        <Text variant="caption" color="textMuted" numberOfLines={2}>
                          {item.body}
                        </Text>
                      ) : null}
                    </View>
                  </MdCard>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardPad: { padding: spacing.md, gap: spacing.sm },
  yearBlock: { gap: spacing.sm },
  yearRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  yearLabel: { color: withAlpha(m3.accent.skyTextHi, 0.9) },
  yearLine: { flex: 1, height: 1, backgroundColor: withAlpha(deepSpace.accentDim, 0.25) },
  entry: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md },
  entryDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: m3.accent.starCore },
});
