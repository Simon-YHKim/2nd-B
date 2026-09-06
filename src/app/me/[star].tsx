// 별 하나의 요약 — 홈에서 별을 누르면 여기로 온다. (Simon 결정 4 = B)
//
// *"그 별의 요약 → 거기서 인터뷰"*. 바로 대화를 열지 않는 이유는, 지금까지 뭘
// 했는지 볼 자리가 없으면 사용자가 **매번 처음부터 시작하는 기분**이 되기 때문이다.
// 그리고 화면 하나에 메시지 하나라는 규율과도 맞는다 -- 여기는 "이 별은 지금
// 이만큼"이고, 대화는 다음 화면이다.
//
// ⚠ 지어내지 않는다. 기록이 없으면 "아직 없다"고 말하고 끝낸다. 추정치를 만들어
// 보여주는 것이 이 저장소가 반복해서 걸렸던 병이다.
//
// 아직 살지 않은 시기(스물다섯 살의 "30대 이후")는 **잠긴다.** 살지 않은 때를
// 물어보는 것은 지어내라는 말이다.
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import Svg from "react-native-svg";

import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";
import {
  getSevenStar,
  isSevenStarId,
  isUnlived,
  type SevenStarId,
} from "@/lib/persona/seven-stars";
import { loadCoverage } from "@/lib/interview/coverage-store";
import {
  DRILL_LAYERS,
  LAYER_LABEL,
  type DrillLayer,
  type LifePeriod,
} from "@/lib/interview/probe";
import { coveredDrillLayers, meStarStaticParams } from "@/lib/nav/me-star-route";

interface Summary {
  /** 이 별에서 판 칸 수 (0~5). 인터뷰가 없는 별은 null. */
  cells: number | null;
  /** 이 별과 연결된 기록 수. */
  records: number;
  /** 실제 답변이 있어 켜진 드릴 층. */
  covered: DrillLayer[];
}

async function loadSummary(userId: string, period: LifePeriod | null): Promise<Summary> {
  if (period === null) return { cells: null, records: 0, covered: [] };
  let cells = 0;
  let covered: DrillLayer[] = [];
  try {
    const cov = await loadCoverage(userId);
    covered = coveredDrillLayers(cov[period]);
    cells = covered.length;
  } catch {
    cells = 0;
    covered = [];
  }
  let records = 0;
  try {
    const { count } = await getSupabaseClient()
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("audit_period", period);
    records = count ?? 0;
  } catch {
    records = 0;
  }
  return { cells, records, covered };
}

export default function StarSummaryRoute() {
  const { t, i18n } = useTranslation("home");
  const { star } = useLocalSearchParams<{ star?: string }>();
  const { userId, loading, age } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);

  const id: SevenStarId | null =
    typeof star === "string" && isSevenStarId(star) ? star : null;
  const meta = id ? getSevenStar(id) : null;
  const locked = id ? isUnlived(id, age) : false;

  const load = useCallback(async () => {
    if (!userId || !meta) return;
    setSummary(await loadSummary(userId, meta.period));
  }, [userId, meta]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PremiumLoadingState />;
  if (!userId) return <Redirect href="/sign-in" />;
  // 모르는 별 이름이면 홈으로. 옛 링크가 남아 있을 수 있다.
  if (!id || !meta) return <Redirect href="/" />;

  const name = t(`ds.star.${meta.key}`);
  const layerLocale = i18n.resolvedLanguage?.startsWith("ko") ? "ko" : "en";
  const range = meta.ageBand
    ? meta.ageBand.to === null
      ? t("ds.audit.rangeFrom", { from: meta.ageBand.from })
      : meta.ageBand.from === 0
        ? t("ds.audit.rangeUnder", { to: meta.ageBand.to + 1 })
        : t("ds.audit.rangeSpan", { from: meta.ageBand.from, to: meta.ageBand.to })
    : "";

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={name} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* 레퍼런스는 별 이름 위에 화면 이름을 둔다 — 어느 별에 있든 "여기가 요약
            자리"라는 것이 먼저 읽혀야 하기 때문이다(design/pixel_clay_260825
            captures/me-star.png). */}
        <Text style={[m3TextStyle("labelMedium"), styles.pageLabel]}>{t("ds.star.pageLabel")}</Text>
        <View style={styles.hero}>
          <Svg width={52} height={52} viewBox="0 0 52 52">
            <PixelStarSvg cx={26} cy={26} r={12} fill={m3.color.primary} />
          </Svg>
          <View style={styles.heroCopy}>
            <Text style={[m3TextStyle("headlineSmall"), styles.title]}>{name}</Text>
            {range.length > 0 ? (
              <Text style={[m3TextStyle("bodyMedium"), styles.range]}>{range}</Text>
            ) : null}
          </View>
        </View>

        {locked ? (
          // 아직 오지 않은 시기. 들어가지 못하게 하고 이유를 말한다.
          <MdCard variant="outlined" style={styles.card}>
            <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>{t("ds.star.lockedBody")}</Text>
          </MdCard>
        ) : meta.period === null ? (
          // 프로필 — 인터뷰가 아니라 항목을 채우는 자리다.
          <>
            <MdCard variant="outlined" style={styles.card}>
              <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>{t("ds.star.profileBody")}</Text>
            </MdCard>
            <MdButton
              label={t("ds.star.openProfile")}
              variant="filled"
              onPress={() => router.push("/profile-details")}
              style={styles.cta}
            />
          </>
        ) : (
          <>
            <MdCard variant="outlined" style={styles.card}>
              {summary === null ? (
                <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>{t("ds.star.loading")}</Text>
              ) : summary.cells === 0 && summary.records === 0 ? (
                // 지어내지 않는다. 없으면 없다고 한다.
                <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>{t("ds.star.emptyBody")}</Text>
              ) : (
                <>
                  {/* 밝기의 규칙을 숫자 옆에 붙여 말한다. 이 한 줄이 없으면 "3/5"
                      가 점수처럼 읽히는데, 이 앱에서 밝기는 평가가 아니라 판 양이다. */}
                  <Text style={[m3TextStyle("bodyMedium"), styles.line]}>
                    {t("ds.star.meter", { n: summary.cells ?? 0, total: DRILL_LAYERS.length })}
                  </Text>
                  <Text style={[m3TextStyle("bodySmall"), styles.muted]}>
                    {t("ds.star.dug", { n: summary.cells ?? 0, total: DRILL_LAYERS.length })}
                  </Text>
                  <View
                    style={styles.gauge}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel={t("ds.star.meter", {
                      n: summary.covered.length,
                      total: DRILL_LAYERS.length,
                    })}
                    accessibilityValue={{
                      min: 0,
                      max: DRILL_LAYERS.length,
                      now: summary.covered.length,
                      text: t("ds.star.dug", {
                        n: summary.covered.length,
                        total: DRILL_LAYERS.length,
                      }),
                    }}
                  >
                    {DRILL_LAYERS.map((layer) => {
                      const isCovered = summary.covered.includes(layer);
                      return (
                        <View key={layer} style={styles.gaugeItem}>
                          <View
                            style={[
                              styles.gaugeSegment,
                              isCovered ? styles.gaugeSegmentOn : styles.gaugeSegmentOff,
                            ]}
                          />
                          <Text
                            style={[
                              m3TextStyle("labelSmall"),
                              isCovered ? styles.layerOn : styles.layerOff,
                            ]}
                          >
                            {LAYER_LABEL[layerLocale][layer]}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={[m3TextStyle("labelSmall"), styles.sectionLabel]}>
                    {t("ds.star.recordsLabel")}
                  </Text>
                  <Text style={[m3TextStyle("bodySmall"), styles.muted]}>
                    {t("ds.star.records", { n: summary.records })}
                  </Text>
                </>
              )}
            </MdCard>

            <MdButton
              label={summary && (summary.cells ?? 0) > 0 ? t("ds.star.continue") : t("ds.star.start")}
              variant="filled"
              onPress={() =>
                router.push({ pathname: "/interview", params: { period: meta.period ?? "now" } })
              }
              style={styles.cta}
            />
          </>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.sm },
  pageLabel: { color: m3.color.onSurfaceVariant, marginBottom: spacing.xs },
  sectionLabel: { color: m3.color.onSurfaceVariant, marginTop: spacing.sm },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroCopy: { flex: 1 },
  title: { color: m3.color.onSurface },
  range: { color: m3.color.onSurfaceVariant, marginBottom: spacing.sm },
  card: { marginTop: spacing.sm },
  line: { color: m3.color.onSurface },
  muted: { color: m3.color.onSurfaceVariant },
  gauge: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.md },
  gaugeItem: { flex: 1, gap: spacing.xs },
  gaugeSegment: { height: 18, borderWidth: 1, borderRadius: m3.shape.none },
  gaugeSegmentOn: { backgroundColor: m3.color.primary, borderColor: m3.color.primary },
  gaugeSegmentOff: {
    backgroundColor: m3.color.surfaceContainerHighest,
    borderColor: m3.color.outlineVariant,
  },
  layerOn: { color: m3.color.onSurface },
  layerOff: { color: m3.color.onSurfaceVariant },
  cta: { marginTop: spacing.lg },
});

/** GitHub Pages 정적 export에서도 `/me/<star>` direct hit가 404가 되지 않게 한다. */
export function generateStaticParams(): { star: string }[] {
  return meStarStaticParams();
}
