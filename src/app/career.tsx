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
import { Field, MdButton, MdCard, YearField } from "@/components/m3";
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
  // 쌓아온 길 track (rev2 11-star): 메인 = real achievements, 사이드 = official records.
  const [track, setTrack] = useState<"main" | "side">("main");

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
            <YearField
              label={t("deepspace:career.fieldYear")}
              value={year}
              onChange={setYear}
              placeholder={t("deepspace:career.placeholderYear")}
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

        {/* 쌓아온 길 (rev2 11-star): 메인 = 직접 담은 성과 실기록, 사이드 = 공식 이력
            (학력/병역/수상/자격/경력). 공식 이력은 연동으로 채워지는 트랙이라, mock
            데이터 없이 중립 안내를 두어 레퍼런스 구성/의도를 정직하게 클론한다. */}
        <View style={styles.pathHead}>
          <Text variant="heading">{locale === "ko" ? "쌓아온 길" : "The path you've built"}</Text>
        </View>
        <View style={styles.trackRow}>
          {(["main", "side"] as const).map((tk) => {
            const on = track === tk;
            const lbl = tk === "main" ? (locale === "ko" ? "메인" : "Main") : locale === "ko" ? "사이드" : "Side";
            return (
              <Pressable
                key={tk}
                onPress={() => setTrack(tk)}
                style={[styles.trackTab, on && styles.trackTabOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text variant="body" style={on ? styles.trackTxtOn : styles.trackTxt}>
                  {lbl}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {track === "side" ? (
          <View style={styles.sideBlock}>
            <View style={styles.chipRow}>
              {(locale === "ko"
                ? ["학력", "병역", "수상", "자격", "경력"]
                : ["Education", "Military", "Awards", "Licenses", "Experience"]
              ).map((c) => (
                <View key={c} style={styles.credChip}>
                  <Text variant="caption" color="textMuted">
                    {c}
                  </Text>
                </View>
              ))}
            </View>
            <MdCard variant="outlined" style={styles.cardPad}>
              <Text variant="body" color="textMuted">
                {locale === "ko"
                  ? "학력·병역·수상·자격·경력 같은 공식 이력은 연동하면 여기에 자동으로 정리돼요. 지금은 메인에서 직접 담은 성과가 쌓여요."
                  : "Official records like education, military, awards, licenses, and experience organize here once you connect a source. For now, your own achievements build up under Main."}
              </Text>
            </MdCard>
          </View>
        ) : rows === null ? (
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
  pathHead: { marginTop: spacing.xs },
  trackRow: { flexDirection: "row", gap: spacing.sm },
  trackTab: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: withAlpha(deepSpace.accentDim, 0.35) },
  trackTabOn: { backgroundColor: withAlpha(m3.accent.starCore, 0.18), borderColor: withAlpha(m3.accent.starCore, 0.5) },
  trackTxt: { color: withAlpha(m3.accent.skyTextHi, 0.7) },
  trackTxtOn: { color: m3.accent.skyTextHi },
  sideBlock: { gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  credChip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: withAlpha(deepSpace.accentDim, 0.3) },
  yearBlock: { gap: spacing.sm },
  yearRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  yearLabel: { color: withAlpha(m3.accent.skyTextHi, 0.9) },
  yearLine: { flex: 1, height: 1, backgroundColor: withAlpha(deepSpace.accentDim, 0.25) },
  entry: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md },
  entryDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: m3.accent.starCore },
});
