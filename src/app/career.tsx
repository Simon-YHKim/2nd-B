// 커리어 CV 타임라인 (rev2 P4d): the career domain lens. Every domain:career
// record grouped by year (an explicit year: tag from the 성과 입력 form wins over
// the capture date), newest first.
//
// The form itself lives on /career-input, not inline here. This screen carried a
// three-box version (성과 / 역할 / 임팩트 + 연도) that was a reduction of the spec in
// sb-careerinput.jsx; the full seven-section form replaced it rather than sitting
// beside it, because two ways to enter the same thing is how one of them rots.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { domainTagFor } from "@/lib/persona/domain-stars";
import { deepSpace, flattenAlpha, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { groupCareerTimeline, type CareerRecordRow } from "@/lib/career/career-timeline";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.color.surfaceContainerLow` — 카드 배경.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const carAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.color.surfaceContainerLow);

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
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [rows, setRows] = useState<CareerRecordRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
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
            label={t("deepspace:career.addAchievement")}
            onPress={() => router.push("/career-input")}
          />
        </View>

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
            {/* 빈 타임라인에서의 유일한 행동이 헤더 구석 버튼뿐이었다(2026-09-01 감사 THIN).
                같은 화면 안 중복이라 "입력 경로는 하나"(파일 헤더) 결정과 충돌하지 않는다. */}
            <MdButton
              variant="filled"
              label={t("deepspace:career.addAchievement")}
              onPress={() => router.push("/career-input")}
            />
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
  trackTab: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: m3.shape.none, borderWidth: 1, borderColor: carAlpha(deepSpace.accentDim, 0.35) },
  trackTabOn: { backgroundColor: carAlpha(m3.accent.starCore, 0.18), borderColor: carAlpha(m3.accent.starCore, 0.5) },
  trackTxt: { color: carAlpha(m3.accent.skyTextHi, 0.7) },
  trackTxtOn: { color: m3.accent.skyTextHi },
  sideBlock: { gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  credChip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: m3.shape.none, borderWidth: 1, borderColor: carAlpha(deepSpace.accentDim, 0.3) },
  yearBlock: { gap: spacing.sm },
  yearRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  yearLabel: { color: carAlpha(m3.accent.skyTextHi, 0.9) },
  yearLine: { flex: 1, height: 1, backgroundColor: carAlpha(deepSpace.accentDim, 0.25) },
  entry: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md },
  entryDot: { width: 8, height: 8, borderRadius: m3.shape.none, marginTop: 6, backgroundColor: m3.accent.starCore },
});
