// 승인 이력 (rev2 P3d) — the propose->ratify history, re-skinned to the
// reference RatifyScreen (sb-validate.jsx): an in-body 승인 이력 headline, a
// 4-column summary strip, a decision filter-chip row, and per-record cards
// (source · decision badge · target · L from->to · relative time · cited note).
//
// Wiring preserved: every row is a REAL persisted star_tier_history observation
// (loadTierObservations -> buildRatificationLog), newest first. Nothing is
// fabricated — the constellation's light rests on this ledger, so each entry
// here is a change you accepted into it (decision = 승인). No auto-apply exists;
// there is no 보류/거절 in the persisted ledger, so those summary columns read 0
// honestly and their filter chips surface the empty state.
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, MdChip } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";
import { SELF_UNDERSTANDING_STARS, type StarId } from "@/lib/persona/stars";
import { loadTierObservations } from "@/lib/persona/load-tier-observations";
import { buildRatificationLog, ratificationEmptyState, type RatificationEntry } from "@/lib/persona/brightness-timeline";
import { keepAllKo } from "@/lib/i18n/keep-all";

// Amber warning tone for the 보류 column — the one raw literal, transcribed 1:1
// from the reference RatifyScreen DEC map (#F7B955) as its M3 caution accent.
const HOLD_AMBER = "#F7B955";

type Tx = (key: string, options?: Record<string, unknown>) => string;

// Star names resolve through home:ds.home.starName.<id> (all five locales);
// the SELF_UNDERSTANDING_STARS nameKo/nameEn pair only ever covered two.
const starName = (starId: StarId, t: Tx): string => {
  const star = SELF_UNDERSTANDING_STARS.find((s) => s.id === starId);
  return star ? t(`home:ds.home.starName.${star.id}`) : starId;
};

function originLabel(origin: string | null, t: Tx): string {
  if (origin === "ratify") return t("originRatify");
  if (origin === "rebuild") return t("originRebuild");
  if (!origin) return t("originRecorded");
  return origin;
}

// Relative time from an ISO timestamp — 방금 / N분 전 / N시간 전 / N일 전, else
// the date. Keeps the reference's terse "when" column without a date library;
// labels come from the shared deepspace:time.* set so all five locales resolve.
function relativeTime(iso: string, t: Tx): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso.slice(0, 10);
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return t("deepspace:time.now");
  if (mins < 60) return t("deepspace:time.minsAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("deepspace:time.hoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t("deepspace:time.daysAgo", { count: days });
  return iso.slice(0, 10);
}

function StarGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.9 6.6 19.7l1.2-6L3.3 9.3l6.1-.7z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M4.5 12.5l4.5 4.5 10.5-11" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export default function RatificationLogScreen() {
  const { t } = useTranslation("ratifications");
  const { userId, loading } = useAuth();

  const [showUnchanged, setShowUnchanged] = useState(false);
  const [filter, setFilter] = useState<"전체" | "승인" | "보류" | "거절">("전체");
  const [entries, setEntries] = useState<RatificationEntry[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadTierObservations(userId).then((rows) => {
      if (alive) setEntries(buildRatificationLog(rows));
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const barTitle = t("barTitle");
  const subtitleText = t("subtitle");

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // Same-level re-recordings (L1 -> L1 rebuild echoes) fold behind one count row
  // (QA r3). Real deltas render as the timeline.
  const all = entries ?? [];
  const changed = all.filter((e) => e.prevLevel === null || e.level !== e.prevLevel);
  const unchanged = all.filter((e) => e.prevLevel !== null && e.level === e.prevLevel);
  const base = showUnchanged ? all : changed;
  // Every persisted record is a change accepted into the constellation → 승인.
  const visible = filter === "전체" || filter === "승인" ? base : [];

  const filters = ["전체", "승인", "보류", "거절"] as const;
  const filterLabel: Record<(typeof filters)[number], string> = {
    전체: t("all"),
    승인: t("ratified"),
    보류: t("held"),
    거절: t("declined"),
  };
  // Honest summary: 제안 = total records, 승인 = same (all persisted = accepted),
  // 보류 / 거절 = 0 (never persist a tier change).
  const counts = [
    { key: "제안", label: t("proposed"), n: all.length, color: m3.color.onSurface },
    { key: "승인", label: t("ratified"), n: all.length, color: m3.color.primary },
    { key: "보류", label: t("held"), n: 0, color: HOLD_AMBER },
    { key: "거절", label: t("declined"), n: 0, color: m3.color.error },
  ];

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headline}>{barTitle}</Text>
        {/* Screen readers get the raw string: keepAllKo's U+2060 joiners disorient
            braille output and character-by-character review. */}
        <Text style={styles.subtitle} accessibilityLabel={subtitleText}>
          {keepAllKo(subtitleText)}
        </Text>

        {/* summary strip */}
        <MdCard variant="filled" style={styles.summary}>
          {counts.map((c, i) => (
            <View key={c.key} style={[styles.summaryCol, i > 0 && styles.summaryDivider]}>
              <Text style={[styles.summaryNum, { color: c.color }]}>{c.n}</Text>
              <Text style={styles.summaryLabel}>{c.label}</Text>
            </View>
          ))}
        </MdCard>

        {/* decision filters */}
        <View style={styles.filterRow}>
          {filters.map((f) => (
            <MdChip key={f} kind="filter" label={filterLabel[f]} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>

        {/* timeline */}
        {entries === null ? (
          <PremiumLoadingState message={t("openingLedger")} />
        ) : ratificationEmptyState(all.length, visible.length) === "none" ? (
          <MdCard variant="outlined" style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {t("emptyAll")}
            </Text>
            <MdButton variant="tonal" label={t("goPolaris")} onPress={() => router.replace("/core-brain")} />
          </MdCard>
        ) : ratificationEmptyState(all.length, visible.length) === "filtered" ? (
          <MdCard variant="outlined" style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {t("emptyFilter")}
            </Text>
          </MdCard>
        ) : (
          visible.map((entry, i) => (
            <MdCard key={`${entry.starId}-${entry.recordedAt}-${i}`} variant="outlined" style={styles.entry}>
              <View style={styles.entryHead}>
                <View style={styles.iconBox}>
                  <StarGlyph color={m3.color.onSurfaceVariant} />
                </View>
                <Text style={styles.source} numberOfLines={1}>
                  {originLabel(entry.origin, t)}
                </Text>
                <View style={styles.pill}>
                  <CheckIcon color={m3.color.onPrimaryContainer} />
                  <Text style={styles.pillText}>{t("ratified")}</Text>
                </View>
              </View>
              <View style={styles.entryMeta}>
                <Text style={styles.target} numberOfLines={1}>
                  {starName(entry.starId, t)}
                </Text>
                <View style={styles.delta}>
                  {/* No prior level = first observation; the reference marks it "—".
                      Duplicating the level rendered "L1 → L1", which reads as no change. */}
                  <Text style={styles.deltaText}>{entry.prevLevel === null ? "—" : `L${entry.prevLevel}`}</Text>
                  <Text style={styles.arrow}>→</Text>
                  <Text style={[styles.deltaText, styles.deltaTo]}>{`L${entry.level}`}</Text>
                </View>
                <Text style={styles.when}>{relativeTime(entry.recordedAt, t)}</Text>
              </View>
              {entry.citedCount > 0 ? (
                <Text style={styles.note}>{t("cited", { n: entry.citedCount })}</Text>
              ) : null}
            </MdCard>
          ))
        )}

        {unchanged.length > 0 ? (
          <MdButton
            variant="text"
            label={
              showUnchanged
                ? t("hideUnchanged")
                : t("showUnchanged", { n: unchanged.length })
            }
            onPress={() => setShowUnchanged((v) => !v)}
          />
        ) : null}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: m3.spacing.s4, gap: m3.spacing.s3, paddingBottom: m3.spacing.s8 },
  headline: { fontSize: m3.type.headlineSmall.size, lineHeight: m3.type.headlineSmall.line, fontWeight: "500", color: m3.color.onSurface, marginTop: m3.spacing.s2 },
  subtitle: { fontSize: m3.type.bodyMedium.size, lineHeight: m3.type.bodyMedium.line, color: m3.color.onSurfaceVariant },
  summary: { flexDirection: "row", padding: 14, backgroundColor: m3.color.surfaceContainerHigh },
  summaryCol: { flex: 1, alignItems: "center" },
  summaryDivider: { borderLeftWidth: 1, borderLeftColor: m3.color.outlineVariant },
  summaryNum: { fontFamily: m3.font.mono, fontSize: 22, fontWeight: "700" },
  summaryLabel: { fontSize: m3.type.labelMedium.size, color: m3.color.onSurfaceVariant, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: m3.spacing.s2, flexWrap: "wrap" },
  emptyCard: { padding: m3.spacing.s4, gap: m3.spacing.s3 },
  emptyText: { fontSize: m3.type.bodyMedium.size, lineHeight: m3.type.bodyMedium.line, color: m3.color.onSurfaceVariant },
  entry: { padding: 14, gap: m3.spacing.s2, borderWidth: 1, borderColor: m3.color.outlineVariant },
  entryHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  source: { flex: 1, fontSize: m3.type.labelMedium.size, color: m3.color.onSurfaceVariant },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, backgroundColor: m3.color.primaryContainer },
  pillText: { fontSize: 12, fontWeight: "700", color: m3.color.onPrimaryContainer },
  entryMeta: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  target: { fontSize: m3.type.titleSmall.size, lineHeight: m3.type.titleSmall.line, fontWeight: "500", color: m3.color.onSurface },
  delta: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  deltaText: { fontFamily: m3.font.mono, fontSize: 13, color: m3.color.onSurfaceVariant },
  deltaTo: { color: m3.color.primary },
  arrow: { fontSize: 13, color: m3.color.onSurfaceVariant },
  when: { fontSize: m3.type.labelSmall.size, color: m3.color.onSurfaceVariant },
  note: { fontSize: m3.type.bodySmall.size, color: m3.color.onSurfaceVariant },
});
