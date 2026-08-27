// 5 × 5 drill-down progress matrix for /interview.
//
// Rows = 5 narrative layers (FACT → ECHO), columns = 사용자가 **살아온**
// 시기들(`periodsForAge()`). 열 수는 사람마다 다르다. Each cell shows the number of user answers
// landed in that (period, layer) combination, brightening as the count
// grows. The "active" cell (the one the next probe is targeting) glows
// so the user sees where the interview is heading.
//
// Source of truth for layers/periods is src/lib/interview/probe.ts.
// Visual language uses the cosmic palette: a signalBlue intensity ramp with a
// signalMint active-cell glow.

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import {
  DRILL_LAYERS,
  LAYER_LABEL,
  PERIOD_LABEL,
  type Coverage,
  type DrillLayer,
  type LifePeriod,
} from "@/lib/interview/probe";
import { cosmic, flattenAlpha, semantic, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { m3 } from "@/lib/theme/m3";

interface Props {
  coverage: Coverage;
  locale: "en" | "ko";
  /** 이 사용자에게 **해당되는** 시기만. `periodsForAge()` 가 만든다.
   *
   *  일부러 필수로 둔다. 예전에는 이 컴포넌트가 `LIFE_PERIODS` 를 그대로
   *  그렸는데, union 이 9개로 넓어진 지금은 그러면 스물다섯 살 사용자에게
   *  70대 칸이 보인다. 기본값을 주지 않는 것이 그 재발을 막는 유일한 방법이다. */
  periods: readonly LifePeriod[];
  /** Period currently being interviewed — highlights that column. */
  activePeriod?: LifePeriod | null;
  /** Layer the *next* question is probing — that cell glows. */
  activeLayer?: DrillLayer | null;
}

// PIXEL-CLAY 규칙 4 — 정적 반투명 금지. 밝기 사다리를 **미리 합성**해 둔다.
//
// 바탕이 둘이다:
//   · 칸 배경 → `wrap` 의 `semantic.surface` 위에 얹힌다.
//   · 칸 테두리 → RN 은 테두리를 요소 **안쪽**에 그리므로 바탕은 그 칸의
//     배경색이다. 화면 색으로 합성하면 사다리 중간 단이 어긋난다.
const CELL_BG_1 = flattenAlpha(cosmic.signalBlue, 0.18, semantic.surface);
const CELL_BG_2 = flattenAlpha(cosmic.signalBlue, 0.32, semantic.surface);
const CELL_BG_3 = flattenAlpha(cosmic.signalBlue, 0.55, semantic.surface);
const CELL_LINE_1 = flattenAlpha(cosmic.signalBlue, 0.35, CELL_BG_1);
const CELL_LINE_2 = flattenAlpha(cosmic.signalBlue, 0.55, CELL_BG_2);

function cellTone(count: number): { bg: string; border: string; text: string } {
  if (count <= 0) return { bg: semantic.surfaceAlt, border: semantic.border, text: semantic.textSubtle };
  if (count === 1) return { bg: CELL_BG_1, border: CELL_LINE_1, text: cosmic.signalBlue };
  if (count === 2) return { bg: CELL_BG_2, border: CELL_LINE_2, text: semantic.text };
  return { bg: CELL_BG_3, border: cosmic.signalBlue, text: semantic.text };
}

function shortPeriodLabel(p: LifePeriod, locale: "en" | "ko"): string {
  // 좁은 열에 들어가야 한다. 짧게.
  if (locale === "ko") {
    return { infancy: "영유아", school: "학창", twenties: "20대", later: "30대~", work: "직장", now: "지금" }[p];
  }
  return { infancy: "0-6", school: "7-19", twenties: "20s", later: "30+", work: "work", now: "now" }[p];
}

function shortLayerLabel(l: DrillLayer, locale: "en" | "ko"): string {
  // Side strip — code only ("L1") to leave room for numbers in cells.
  return LAYER_LABEL[locale][l].split(" · ")[0] ?? l;
}

export function DrillProgress({ coverage, locale, periods, activePeriod, activeLayer }: Props) {
  const { t } = useTranslation("common");
  const totalAnswers = periods.reduce(
    (sum, period) => sum + DRILL_LAYERS.reduce((layerSum, layer) => layerSum + coverage[period][layer], 0),
    0,
  );
  const activeTarget =
    activePeriod && activeLayer
      ? `${PERIOD_LABEL[locale][activePeriod]} · ${LAYER_LABEL[locale][activeLayer]}`
      : locale === "ko"
        ? "아직 정해지지 않음"
        : "not set yet";
  const matrixLabel =
    locale === "ko"
      ? `인터뷰 진행 매트릭스. 총 응답 ${totalAnswers}개. 다음 질문 타깃: ${activeTarget}.`
      : `Interview progress matrix. ${totalAnswers} total answers. Next question target: ${activeTarget}.`;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={matrixLabel}
      accessibilityHint={
        locale === "ko"
          ? "셀 숫자는 시기와 질문 층별 응답 수를 나타냅니다."
          : "Cell numbers show answer counts by life period and question layer."
      }
    >
      {/* Header row: period names */}
      <View style={styles.row}>
        <View style={[styles.cellSide, styles.headerCell]}>
          <Text style={styles.headerMicro}>{t("drillLayerPeriod")}</Text>
        </View>
        {periods.map((p) => (
          <View key={p} style={[styles.cell, styles.headerCell, activePeriod === p ? styles.headerCellActive : null]}>
            <Text style={[styles.headerLabel, activePeriod === p ? styles.headerLabelActive : null]}>
              {shortPeriodLabel(p, locale)}
            </Text>
          </View>
        ))}
      </View>

      {/* 5 layer rows × 해당되는 시기 수만큼의 열 */}
      {DRILL_LAYERS.map((layer) => (
        <View key={layer} style={styles.row}>
          <View style={[styles.cellSide, styles.headerCell]}>
            <Text style={[styles.headerLabel, activeLayer === layer ? styles.headerLabelActive : null]}>
              {shortLayerLabel(layer, locale)}
            </Text>
          </View>
          {periods.map((period) => {
            const n = coverage[period][layer];
            const tone = cellTone(n);
            const isActive = activePeriod === period && activeLayer === layer;
            const accLabel = `${PERIOD_LABEL[locale][period]} · ${LAYER_LABEL[locale][layer]} · ${n}`;
            return (
              <View
                key={period}
                accessibilityLabel={accLabel}
                style={[
                  styles.cell,
                  { backgroundColor: tone.bg, borderColor: tone.border },
                  isActive ? styles.cellActive : null,
                ]}
              >
                <Text style={[styles.cellText, { color: tone.text }]}>
                  {n > 0 ? String(n) : ""}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: semantic.surface,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: semantic.border,
    padding: 8,
    gap: 4,
  },
  row: { flexDirection: "row", gap: 4 },
  cellSide: {
    width: 64,
    minHeight: 28,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingEnd: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: {
    borderColor: semantic.brand,
    shadowColor: semantic.brand,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  cellText: { fontSize: typography.sizes.xs, fontWeight: "700", fontFamily: fontFamilies.mono },
  headerCell: { aspectRatio: undefined, paddingVertical: 4 },
  headerCellActive: {},
  headerLabel: { fontSize: typography.sizes.xs, color: semantic.textSubtle, letterSpacing: 0, fontWeight: "600" },
  headerLabelActive: { color: semantic.brand },
  headerMicro: { fontSize: typography.sizes.xs, color: semantic.textSubtle, letterSpacing: 0 },
});
