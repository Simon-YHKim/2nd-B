// 5 × 5 drill-down progress matrix for /interview.
//
// Rows = 5 narrative layers (FACT → ECHO), columns = 5 life periods
// (childhood → current). Each cell shows the number of user answers
// landed in that (period, layer) combination, brightening as the count
// grows. The "active" cell (the one the next probe is targeting) glows
// so the user sees where the interview is heading.
//
// Source of truth for layers/periods is src/lib/interview/probe.ts.
// Visual language uses the cosmic palette: a signalBlue intensity ramp with a
// signalMint active-cell glow.

import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import {
  DRILL_LAYERS,
  LAYER_LABEL,
  LIFE_PERIODS,
  PERIOD_LABEL,
  type Coverage,
  type DrillLayer,
  type LifePeriod,
} from "@/lib/interview/probe";
import { cosmic, semantic, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

interface Props {
  coverage: Coverage;
  locale: "en" | "ko";
  /** Period currently being interviewed — highlights that column. */
  activePeriod?: LifePeriod | null;
  /** Layer the *next* question is probing — that cell glows. */
  activeLayer?: DrillLayer | null;
}

function cellTone(count: number): { bg: string; border: string; text: string } {
  if (count <= 0) return { bg: semantic.surfaceAlt, border: semantic.border, text: semantic.textSubtle };
  if (count === 1) return { bg: withAlpha(cosmic.signalBlue, 0.18), border: withAlpha(cosmic.signalBlue, 0.35), text: cosmic.signalBlue };
  if (count === 2) return { bg: withAlpha(cosmic.signalBlue, 0.32), border: withAlpha(cosmic.signalBlue, 0.55), text: semantic.text };
  return { bg: withAlpha(cosmic.signalBlue, 0.55), border: cosmic.signalBlue, text: semantic.text };
}

function shortPeriodLabel(p: LifePeriod, locale: "en" | "ko"): string {
  // Header strips need to fit narrow columns. Keep it punchy.
  if (locale === "ko") {
    return { childhood: "유년", teens: "10대", twenties: "20대", thirties: "30대", current: "지금" }[p];
  }
  return { childhood: "child", teens: "teens", twenties: "20s", thirties: "30s", current: "now" }[p];
}

function shortLayerLabel(l: DrillLayer, locale: "en" | "ko"): string {
  // Side strip — code only ("L1") to leave room for numbers in cells.
  return LAYER_LABEL[locale][l].split(" · ")[0] ?? l;
}

export function DrillProgress({ coverage, locale, activePeriod, activeLayer }: Props) {
  return (
    <View style={styles.wrap} accessibilityLabel={locale === "ko" ? "인터뷰 진행 매트릭스" : "Interview progress matrix"}>
      {/* Header row: period names */}
      <View style={styles.row}>
        <View style={[styles.cellSide, styles.headerCell]}>
          <Text style={styles.headerMicro}>{locale === "ko" ? "층 / 시기" : "layer / period"}</Text>
        </View>
        {LIFE_PERIODS.map((p) => (
          <View key={p} style={[styles.cell, styles.headerCell, activePeriod === p ? styles.headerCellActive : null]}>
            <Text style={[styles.headerLabel, activePeriod === p ? styles.headerLabelActive : null]}>
              {shortPeriodLabel(p, locale)}
            </Text>
          </View>
        ))}
      </View>

      {/* 5 layer rows × 5 period columns */}
      {DRILL_LAYERS.map((layer) => (
        <View key={layer} style={styles.row}>
          <View style={[styles.cellSide, styles.headerCell]}>
            <Text style={[styles.headerLabel, activeLayer === layer ? styles.headerLabelActive : null]}>
              {shortLayerLabel(layer, locale)}
            </Text>
          </View>
          {LIFE_PERIODS.map((period) => {
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
    borderRadius: 8,
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
    paddingRight: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: {
    borderColor: semantic.brand,
    shadowColor: semantic.brand,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  cellText: { fontSize: 11, fontWeight: "700", fontFamily: fontFamilies.mono },
  headerCell: { aspectRatio: undefined, paddingVertical: 4 },
  headerCellActive: {},
  headerLabel: { fontSize: 11, color: semantic.textSubtle, letterSpacing: 0, fontWeight: "600" },
  headerLabelActive: { color: semantic.brand },
  headerMicro: { fontSize: 11, color: semantic.textSubtle, letterSpacing: 0 },
});
