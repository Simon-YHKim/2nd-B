/**
 * Axis-scoped layer-B validation lens (rev2 P3b, clone-audit 16/19/20): the
 * shared read-only body for /values (가치관), /motivation (동기·SDT), and
 * /strengths (강점). Cloned 1:1 from the reference ValuesScreen (sb-validate.jsx)
 * + MotivationScreen / StrengthsScreen (sb-surfaces.jsx): headline + subtitle +
 * the sibling-check action pair.
 *
 * HONESTY (canon:186-190 + iden.tsx precedent): the reference prototype fills
 * these axes with example scores (Self-Direction 78, 확신 61%) plus an insight
 * claiming the user's records back the read. But no real per-axis measurement
 * exists yet (deriveValues only ranks; no values/SDT/strengths instrument is
 * wired), so rendering the canon numbers as the user's own read would fabricate
 * data on a self-understanding surface. Until a real loader lands
 * (deriveValuesScored + measured Big Five) we show a neutral "not measured yet"
 * state with the interview CTA instead of the example scores, keeping the
 * design shell clone-faithful while telling the truth.
 *
 * Chrome: DeepSpaceScreen active="lens", windowed (radius-24 card over the
 * shared sky) with the M3 top app bar carrying the axis name (the same
 * ds.axisCheck.<axis>.headline key the body uses, so all 5 locales localize).
 * All colors route through m3.* tokens — no cosmic tokens, no hex literals.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { SvgXml } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";
import type { AxisCheckId } from "@/lib/audit/axis-checks";

// Material-symbol stroke idiom (2dp currentColor, round caps), matching the
// shell's CaptureIcon set. Only the glyphs the strengths lens needs are kept
// local so the shared icon set stays lean.
const ICON: Record<string, string> = {
  lightbulb:
    '<path d="M9.2 18h5.6M10 21h4M8.4 14.6A5.6 5.6 0 1 1 17 10a5.4 5.4 0 0 1-1.6 3.9c-.6.6-.9 1-.9 1.7v.4h-5v-.4c0-.7-.3-1.1-.9-1.7Z"/>',
  trending_up: '<path d="M4 16 10 10l3.5 3.5L20 7"/><path d="M15.5 7H20v4.5"/>',
  task_alt: '<circle cx="12" cy="12" r="8.4"/><path d="m8.4 12 2.5 2.6 4.7-5.2"/>',
  forum: '<path d="M3 5.5h11v7H8l-3.5 3z"/><path d="M8.5 13v1.4a2 2 0 0 0 2 2h5.7l3.3 2.6v-7.6a2 2 0 0 0-2-2H16"/>',
  auto_awesome:
    '<path d="M11 3c.4 3.2 2.3 5.1 5.5 5.5-3.2.4-5.1 2.3-5.5 5.5-.4-3.2-2.3-5.1-5.5-5.5C8.7 8.1 10.6 6.2 11 3Z"/><path d="M18 13c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z"/>',
};

function LensIcon({ name, color, size = 20 }: { name: keyof typeof ICON; color: string; size?: number }) {
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${ICON[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

// Sibling-check action pair (reference bottom buttons): a tonal primary + an
// outlined secondary. Routes are the real app screens.
const ACTIONS: Record<AxisCheckId, { primaryRoute: string; primaryIcon: keyof typeof ICON; secondaryRoute: string }> = {
  values: { primaryRoute: "/interview", primaryIcon: "forum", secondaryRoute: "/big-five" },
  motivation: { primaryRoute: "/strengths", primaryIcon: "auto_awesome", secondaryRoute: "/big-five" },
  strengths: { primaryRoute: "/secondb", primaryIcon: "forum", secondaryRoute: "/motivation" },
};

function AxisLens({ axis }: { axis: AxisCheckId }) {
  const { t } = useTranslation("home");
  const act = ACTIONS[axis];
  const k = (leaf: string) => t(`ds.axisCheck.${axis}.${leaf}`);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.headRow}>
        <Text style={[m3TextStyle("headlineSmall"), styles.headline]}>{k("headline")}</Text>
      </View>
      <Text style={[m3TextStyle("bodyMedium"), styles.subtitle]}>{k("subtitle")}</Text>

      {/* Honesty: no real per-axis measurement yet, so a neutral not-measured
          state stands in for the reference's example scores (see file header). */}
      <MdCard variant="outlined" style={styles.emptyCard}>
        <SecondbHead size={30} track={false} />
        <View style={styles.emptyBody}>
          <Text style={[m3TextStyle("titleSmall"), styles.emptyTitle]}>
            {t("ds.axisCheck.emptyTitle")}
          </Text>
          <Text style={[m3TextStyle("bodyMedium"), styles.emptyText]}>
            {t("ds.axisCheck.emptyText")}
          </Text>
        </View>
      </MdCard>

      {/* ── sibling-check actions ────────────────────────────────────── */}
      <View style={styles.actions}>
        <MdButton
          label={k("actionPrimary")}
          variant="tonal"
          onPress={() => router.push(act.primaryRoute as never)}
          icon={<LensIcon name={act.primaryIcon} color={m3.color.onSecondaryContainer} size={18} />}
          style={styles.actionBtn}
        />
        <MdButton
          label={k("actionSecondary")}
          variant="outlined"
          onPress={() => router.push(act.secondaryRoute as never)}
          style={styles.actionBtn}
        />
      </View>
    </ScrollView>
  );
}

export function AxisCheckScreen({ axis }: { axis: AxisCheckId }) {
  const { t } = useTranslation("home");
  // Bar title reuses the axis body's headline key so es/pt/id localize too.
  const barTitle = t(`ds.axisCheck.${axis}.headline`);

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
      <AxisLens axis={axis} />
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  // head
  headRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  headline: { color: m3.color.onSurface, fontFamily: m3.font.brand, flexShrink: 1 },
  levelChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: m3.color.tertiaryContainer },
  levelChipText: { color: m3.color.onTertiaryContainer, fontFamily: m3.font.brand, fontWeight: "600" },
  confidence: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  subtitle: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 16 },

  // 가치관 — CORE VALUES top-3 card
  coreCard: { borderRadius: 16, padding: 18, backgroundColor: m3.color.primaryContainer, borderWidth: 1, borderColor: m3.color.outlineVariant },
  coreLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.4, color: withAlpha(m3.color.onPrimaryContainer, 0.8), marginBottom: 12 },
  coreRow: { flexDirection: "row", gap: 8 },
  coreCell: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 6, borderRadius: 12, backgroundColor: m3.color.surface, borderWidth: 1, borderColor: m3.color.outlineVariant },
  coreCellFirst: { backgroundColor: m3.color.primary, borderColor: m3.color.primary },
  coreRank: { fontFamily: m3.font.mono, fontSize: 11, color: m3.color.onSurfaceVariant },
  coreRankFirst: { color: m3.color.onPrimary },
  coreName: { fontSize: 15, fontWeight: "700", color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 4 },
  coreNameFirst: { color: m3.color.onPrimary },

  // 동기 — 내적 ↔ 외적 balance bar
  balanceCard: { padding: 16 },
  balanceTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginBottom: 10 },
  balanceBar: { flexDirection: "row", height: 38, borderRadius: 10, overflow: "hidden" },
  balanceIntrinsic: { flex: 68, backgroundColor: m3.color.primary, alignItems: "center", justifyContent: "center" },
  balanceIntrinsicText: { color: m3.color.onPrimary, fontFamily: m3.font.brand, fontSize: 13, fontWeight: "700" },
  balanceExtrinsic: { flex: 32, backgroundColor: m3.color.surfaceContainerHighest, alignItems: "center", justifyContent: "center" },
  balanceExtrinsicText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, fontSize: 13, fontWeight: "600" },
  balanceNote: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 10 },

  // 강점 — 3 signature cards
  sigRow: { flexDirection: "row", gap: 8 },
  sigCard: { flex: 1, padding: 14, alignItems: "center", borderRadius: 12 },
  sigCardFirst: { backgroundColor: m3.color.surfaceContainerLow, borderWidth: 2, borderColor: m3.color.primary, ...m3.elevation.level1 },
  sigCardRest: { backgroundColor: m3.color.surfaceContainerHighest },
  sigIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  sigIconBoxFirst: { backgroundColor: m3.color.primary },
  sigIconBoxRest: { backgroundColor: m3.color.secondaryContainer },
  sigName: { color: m3.color.onSurface, fontFamily: m3.font.brand, textAlign: "center" },

  // section label + spectrum
  sectionLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 20, marginBottom: 10 },
  spectrum: { gap: 13 },
  specRow: { gap: 5 },
  specHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  specName: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "600" },
  specMono: { fontFamily: m3.font.mono, color: m3.color.onSurfaceVariant },
  specNote: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4 },
  strRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  strBody: { flex: 1, gap: 4 },

  // 세컨비 insight card
  insightCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: m3.shape.medium,
    backgroundColor: m3.color.secondaryContainer,
  },
  insightText: { flex: 1, color: m3.color.onSecondaryContainer, fontFamily: m3.font.brand },

  // honesty neutral state (no real per-axis measurement yet)
  emptyCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 16, padding: 16, borderRadius: m3.shape.medium },
  emptyBody: { flex: 1, gap: 4 },
  emptyTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700" },
  emptyText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },

  // actions
  actions: { flexDirection: "row", gap: 8, marginTop: 18 },
  actionBtn: { flex: 1 },
});
