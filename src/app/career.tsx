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
  const { i18n } = useTranslation();
  const { userId, loading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const isKo = locale === "ko";

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
      <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={isKo ? "커리어" : "Career"} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={isKo ? "불러오는 중이에요…" : "Loading…"} />
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
    <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={isKo ? "커리어" : "Career"} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headRow}>
          <Text variant="heading" style={{ flex: 1 }}>
            {isKo ? "커리어 타임라인" : "Career timeline"}
          </Text>
          <MdButton
            variant="outlined"
            label="Drill Down"
            onPress={() => router.push("/career-drilldown")}
          />
          <MdButton
            variant="tonal"
            label={adding ? (isKo ? "닫기" : "Close") : isKo ? "성과 담기" : "Add achievement"}
            onPress={() => setAdding((v) => !v)}
          />
        </View>

        {adding ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Field
              label={isKo ? "성과 (필수)" : "Achievement (required)"}
              value={title}
              onChangeText={setTitle}
              placeholder={isKo ? "무엇을 해냈나요?" : "What did you accomplish?"}
            />
            <Field
              label={isKo ? "역할" : "Role"}
              value={role}
              onChangeText={setRole}
              placeholder={isKo ? "그때 나의 역할" : "Your role at the time"}
            />
            <Field
              label={isKo ? "임팩트" : "Impact"}
              value={impact}
              onChangeText={setImpact}
              placeholder={isKo ? "무엇이 달라졌나요? 수치가 있다면 함께" : "What changed? Numbers welcome"}
            />
            <Field
              label={isKo ? "연도" : "Year"}
              value={year}
              onChangeText={setYear}
              placeholder={isKo ? "예: 2023 (비우면 오늘 기준)" : "e.g. 2023 (empty = today)"}
              keyboardType="number-pad"
              error={!yearValid}
              supportingText={yearValid ? undefined : isKo ? "네 자리 연도로 적어 주세요" : "Use a four-digit year"}
            />
            {saveFailed ? (
              <Text variant="caption" color="textSubtle">
                {isKo ? "저장하지 못했어요. 다시 시도해 주세요." : "Could not save. Please try again."}
              </Text>
            ) : null}
            <MdButton
              variant="filled"
              disabled={!title.trim() || !yearValid || saving}
              label={saving ? (isKo ? "저장 중…" : "Saving…") : isKo ? "담기" : "Save"}
              onPress={handleAdd}
            />
          </MdCard>
        ) : null}

        {rows === null ? (
          <PremiumLoadingState message={isKo ? "타임라인을 펴는 중…" : "Opening the timeline…"} />
        ) : loadFailed ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {isKo
                ? "타임라인을 잠깐 못 불러왔어요. 조각은 그대로 있으니 다시 시도해 주세요."
                : "Could not load the timeline just now. Your pieces are safe; try again."}
            </Text>
            <MdButton variant="tonal" label={isKo ? "다시 시도" : "Try again"} onPress={refresh} />
          </MdCard>
        ) : groups.length === 0 ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {isKo
                ? "아직 커리어 조각이 없어요. 지난 성과부터 하나 담아 보세요. 커리어 별이 밝아져요."
                : "No career pieces yet. Start with one past achievement; the career star brightens."}
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
                  accessibilityLabel={item.topic ?? (isKo ? "커리어 조각" : "Career piece")}
                >
                  <MdCard variant="outlined" style={styles.entry}>
                    <View style={styles.entryDot} />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {item.topic ?? item.body?.split("\n")[0] ?? (isKo ? "(제목 없음)" : "(untitled)")}
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
