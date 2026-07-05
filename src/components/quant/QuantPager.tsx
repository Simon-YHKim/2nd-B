// Paginated question carrier for quant assessments. 5 items per page by
// default — the user said "showing all questions at once made me not want
// to take it". Renders progress bar + page counter + prev/next nav + a
// terminal Save button on the last page.

import { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useTranslation } from "react-i18next";

export interface QuantPagerProps {
  totalItems: number;
  /** Default 5; tunable for short instruments. */
  perPage?: number;
  /** Render one item card by its 0-based index. */
  renderItem: (itemIndex: number) => React.ReactNode;
  /** Count of items the user has answered so far (any page). */
  answered: number;
  /** True iff every item has a valid response. */
  complete: boolean;
  /** Submit handler — called when the user taps the save button on the last page. */
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  locale: "en" | "ko";
  /** Optional copy override for the save button. Defaults to "결과 저장". */
  submitLabel?: string;
}

export function QuantPager({
  totalItems,
  perPage = 5,
  renderItem,
  answered,
  complete,
  onSubmit,
  submitDisabled,
  submitLoading,
  submitLabel,
}: QuantPagerProps) {
  const { t } = useTranslation(["common", "deepspace"]);
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const [page, setPage] = useState(0);

  // Slice indices for the current page; clamped against totalItems to handle
  // the final partial page (e.g. 44 items with perPage 5 → page 8 has 4).
  const { start, end, pageItems } = useMemo(() => {
    const s = page * perPage;
    const e = Math.min(totalItems, s + perPage);
    return { start: s, end: e, pageItems: Array.from({ length: e - s }, (_, i) => s + i) };
  }, [page, perPage, totalItems]);

  const progressPct = totalItems > 0 ? Math.min(1, answered / totalItems) : 0;
  const progressPercent = Math.round(progressPct * 100);
  const onLastPage = page >= totalPages - 1;
  const isFirstPage = page === 0;
  const progressLabel = t("deepspace:quant.progressLabel", { percent: progressPercent });
  const prevHint = t("quantPrevHint");
  const nextHint = t("quantNextHint");
  const submitHint = t("quantSubmitHint");

  function next() {
    if (!onLastPage) setPage((p) => p + 1);
  }
  function prev() {
    if (!isFirstPage) setPage((p) => p - 1);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text variant="caption" color="textMuted">
            {t("deepspace:quant.pageCounter", { current: page + 1, total: totalPages })}
          </Text>
          <Text variant="caption" color={complete ? "brand" : "textMuted"}>
            {`${t("deepspace:quant.answered", { answered, total: totalItems })}${complete ? t("deepspace:quant.readySuffix") : ""}`}
          </Text>
        </View>
        <View
          style={styles.progressBarOuter}
          accessibilityRole="progressbar"
          accessibilityLabel={progressLabel}
          accessibilityValue={{ min: 0, max: 100, now: progressPercent, text: progressLabel }}
        >
          <View style={[styles.progressBarInner, { width: `${progressPct * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.pageScroll}>
        {pageItems.map((idx) => (
          <View key={idx}>{renderItem(idx)}</View>
        ))}

        <Text variant="subtle" color="textSubtle" style={styles.rangeNote}>
          {t("deepspace:quant.rangeNote", { from: start + 1, to: end })}
        </Text>

        <View style={styles.navRow}>
          <Button
            label={t("quantBack")}
            // O-R1 P1: mid-assessment Back must read quieter than Next/Save
            // so the forward action stays the one prominent choice.
            variant="ghost"
            onPress={prev}
            disabled={isFirstPage}
            accessibilityHint={prevHint}
          />
          {onLastPage ? (
            <Button
              label={submitLabel ?? (t("quantSaveResult"))}
              variant="primary"
              onPress={onSubmit}
              disabled={submitDisabled}
              loading={submitLoading}
              accessibilityHint={submitHint}
            />
          ) : (
            <Button
              label={t("quantNext")}
              variant="primary"
              onPress={next}
              accessibilityHint={nextHint}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  progressHeader: { flexDirection: "row", justifyContent: "space-between" },
  progressBarOuter: {
    height: 4,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarInner: { height: "100%", backgroundColor: semantic.brand },
  pageScroll: { gap: spacing.sm, paddingBottom: spacing.xxl },
  rangeNote: { textAlign: "center", marginTop: spacing.sm },
  navRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.md },
});
