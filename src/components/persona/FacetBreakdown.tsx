// The IPIP-NEO-120 facet lens: the 5 Big Five domains each expanded into their 6
// facets (label + bar). This is the precision payoff over BFI-44's domain-only
// view. Self-contained presentational component; the grouping/scoring is the pure
// facetRows helper. Canon result surface for /ipip-neo.

import { View, StyleSheet, ScrollView, Pressable } from "react-native";

import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing, withAlpha } from "@/lib/theme/tokens";
import { facetRows } from "@/lib/persona/facet-rows";
import { type BigFiveTrait } from "@/lib/persona/bfi";

function Bar({ percent, accent }: { percent: number | null; accent: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent ?? 0}%`, backgroundColor: accent }]} />
    </View>
  );
}

export function FacetBreakdown({
  facets,
  domains,
  locale,
  onRetake,
}: {
  facets: Record<string, number>;
  domains: Partial<Record<BigFiveTrait, number>>;
  locale: "en" | "ko";
  onRetake?: () => void;
}) {
  const groups = facetRows(facets, domains, locale);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text variant="heading" style={styles.title}>
        {locale === "ko" ? "세부 특질 30가지" : "Your 30 facets"}
      </Text>
      <Text variant="subtle" color="textMuted" style={styles.note}>
        {locale === "ko"
          ? "5가지 축을 그 아래 세부 특질까지 펼쳐봤어요. 막대는 자기보고 기준이에요."
          : "Each of the 5 domains, broken into its facets. Bars are from your own self-report."}
      </Text>
      {groups.map((g) => (
        <View key={g.domain} style={styles.group}>
          <View style={styles.domainHead}>
            <Text variant="body" style={styles.domainLabel} numberOfLines={1}>{g.domainLabel}</Text>
            <View style={styles.domainBarRow}>
              <Bar percent={g.domainPercent} accent={cosmic.soulViolet} />
            </View>
          </View>
          {g.facets.map((f) => (
            <View key={f.key} style={styles.facetRow}>
              <Text variant="subtle" color="textMuted" style={styles.facetLabel} numberOfLines={2}>{f.label}</Text>
              <Bar percent={f.percent} accent={cosmic.signalMint} />
            </View>
          ))}
        </View>
      ))}
      {onRetake ? (
        <Pressable
          onPress={onRetake}
          style={styles.retake}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={locale === "ko" ? "다시 검사하기" : "Retake the assessment"}
        >
          <Text variant="caption" color="brand">{locale === "ko" ? "다시 검사하기" : "Retake"}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md },
  title: { marginBottom: 2 },
  note: { marginBottom: spacing.sm },
  group: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  domainHead: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  // The domain name heads its group on its own full-width line (long EN labels
  // like "Openness to Experience" / "Conscientiousness" can't fit a fixed label
  // column), with its overall bar full-width below — which also reads as the
  // dominant parent over the indented facet bars (Visual Tier principle).
  domainLabel: { color: cosmic.soulViolet },
  domainBarRow: { flexDirection: "row" },
  facetRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // Wide enough for long EN facet labels ("Self-Consciousness",
  // "Excitement-Seeking"); the longest ("Achievement-Striving") wraps to a 2nd
  // line rather than truncating. KO labels are short and stay single-line.
  facetLabel: { width: 116 },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: withAlpha(cosmic.mistGray, 0.18), overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  retake: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
});
